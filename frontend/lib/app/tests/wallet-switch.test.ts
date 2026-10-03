import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  settleWithin,
  startWalletSwitch,
  walletSwitchAction,
  type WalletSwitchPending,
} from "../wallet-connect";

const CONTROL = readFileSync("components/shell/WalletControl.tsx", "utf8");
const PROVIDERS = readFileSync("app/providers.tsx", "utf8");
const CONTRACTS = readFileSync("lib/hooks/ContractsProvider.tsx", "utf8");

type State = {
  walletName: string | null;
  walletReady: boolean;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  modalVisible: boolean;
};

const idle: State = {
  walletName: null,
  walletReady: true,
  connected: false,
  connecting: false,
  disconnecting: false,
  modalVisible: false,
};

/** Drive the stepper through commits the way the WalletControl effect does; count connects. */
function drive(from: string | null, commits: Partial<State>[]) {
  let pending: WalletSwitchPending | null = startWalletSwitch(from);
  const kinds: string[] = [];
  const connects: string[] = [];
  const restores: (string | null)[] = [];
  for (const c of commits) {
    const state = { ...idle, ...c };
    let action = walletSwitchAction({ pending, ...state });
    kinds.push(action.kind);
    if (action.kind === "arm") {
      pending = action.pending;
      // deferred tick re-runs with the latest (same) state
      action = walletSwitchAction({ pending, ...state });
      kinds.push(`tick:${action.kind}`);
    }
    if (action.kind === "wait" || action.kind === "arm") pending = action.pending;
    else if (action.kind === "connect") {
      connects.push(action.target);
      pending = null;
    } else if (action.kind === "cancel") {
      restores.push(action.restore);
      pending = null;
    } else if (action.kind !== "idle") pending = null;
  }
  return { kinds, connects, restores, pending };
}

test("Solflare -> Phantom: stale Solflare never connected, Phantom connected exactly once", () => {
  const r = drive("Solflare", [
    { walletName: "Solflare" }, // still the old adapter (select(null) not committed yet)
    { walletName: null, modalVisible: true }, // cleared, picker open
    { walletName: "Phantom", modalVisible: false }, // picked: arm (deferred)
    { walletName: "Phantom", connecting: true },
    { walletName: "Phantom", connected: true },
  ]);
  assert.deepEqual(r.connects, ["Phantom"]);
  assert.equal(r.kinds[0], "wait");
  assert.equal(r.kinds[2], "arm");
  assert.equal(r.pending, null);
});

test("Phantom -> Solflare works the same way", () => {
  const r = drive("Phantom", [
    { walletName: null, modalVisible: true },
    { walletName: "Solflare" },
    { walletName: "Solflare", connected: true },
  ]);
  assert.deepEqual(r.connects, ["Solflare"]);
});

test("arm does not connect on the commit where the adapter swaps", () => {
  const p: WalletSwitchPending = { from: "Solflare", sawCleared: true, sawModal: true, target: null };
  const a = walletSwitchAction({ pending: p, ...idle, walletName: "Phantom" });
  assert.equal(a.kind, "arm");
});

test("stale adapter before the selection is cleared never connects", () => {
  const a = walletSwitchAction({ pending: startWalletSwitch("Solflare"), ...idle, walletName: "Solflare" });
  assert.equal(a.kind, "wait");
});

test("cancel switch: picker closed without choosing restores the previous selection, no connect", () => {
  const r = drive("Solflare", [
    { walletName: null, modalVisible: true },
    { walletName: null, modalVisible: false },
  ]);
  assert.deepEqual(r.connects, []);
  assert.deepEqual(r.restores, ["Solflare"]);
});

test("reconnect same wallet: Solflare -> Solflare connects once", () => {
  const r = drive("Solflare", [
    { walletName: "Solflare" },
    { walletName: null, modalVisible: true },
    { walletName: "Solflare" },
    { walletName: "Solflare", connected: true },
  ]);
  assert.deepEqual(r.connects, ["Solflare"]);
});

test("busy, not ready and connected states never start a duplicate connect", () => {
  const armed: WalletSwitchPending = { from: "Solflare", sawCleared: true, sawModal: true, target: "Phantom" };
  assert.equal(walletSwitchAction({ pending: armed, ...idle, walletName: "Phantom", connecting: true }).kind, "wait");
  assert.equal(walletSwitchAction({ pending: armed, ...idle, walletName: "Phantom", disconnecting: true }).kind, "wait");
  assert.equal(walletSwitchAction({ pending: armed, ...idle, walletName: "Phantom", walletReady: false }).kind, "not_ready");
  assert.equal(walletSwitchAction({ pending: armed, ...idle, walletName: "Phantom", connected: true }).kind, "done");
  assert.equal(walletSwitchAction({ pending: null, ...idle, walletName: "Phantom" }).kind, "idle");
});

test("settleWithin bounds a disconnect that never settles and swallows errors", async () => {
  assert.equal(await settleWithin(new Promise(() => undefined), 20), "timeout");
  assert.equal(await settleWithin(Promise.reject(new Error("x")), 20), "error");
  assert.equal(await settleWithin(Promise.resolve(), 20), "settled");
  assert.equal(await settleWithin(undefined, 20), "settled");
});

test("WalletControl switch: bounded disconnect, clear selection, then picker; connect deferred", () => {
  assert.match(CONTROL, /settleWithin\(disconnect\(\), WALLET_SWITCH_DISCONNECT_TIMEOUT_MS\)/);
  assert.match(CONTROL, /select\(null\);\s*switchRef\.current = startWalletSwitch\(from\);\s*setVisible\(true\)/);
  assert.match(CONTROL, /if \(switchRef\.current\) return;/);
  assert.match(CONTROL, /case "arm":[\s\S]*setTimeout\(/);
  assert.match(CONTROL, /case "connect":\s*switchRef\.current = null;/);
});

test("linked-wallet account data is preserved: switching never unlinks or refetches", () => {
  assert.doesNotMatch(CONTROL, /account-wallets|unlink|method:\s*"DELETE"/i);
  assert.match(CONTRACTS, /\/api\/account-wallets/);
  assert.doesNotMatch(PROVIDERS, /autoConnect/);
  assert.match(PROVIDERS, /onError=\{onWalletError\}/);
});
