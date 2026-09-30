import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACTIVE_CLUSTER_ID,
  MAINNET_CLUSTER,
  PREMIFLOW_CLUSTERS,
  assertClusterBundleIntegrity,
  canSelectCluster,
  getActiveCluster,
  isClusterTransactionReady,
  networkMenuItems,
} from "../../cluster";
import {
  NETWORK,
  isWalletUiConnected,
  shortenAddress,
  walletControlLabel,
} from "../../network";

const WALLET_UI = readFileSync(
  new URL("../../../components/shell/WalletControl.tsx", import.meta.url),
  "utf8"
);
const NETWORK_UI = readFileSync(
  new URL("../../../components/shell/NetworkControl.tsx", import.meta.url),
  "utf8"
);
const PROVIDERS = readFileSync(
  new URL("../../../app/providers.tsx", import.meta.url),
  "utf8"
);
const SHELL = readFileSync(
  new URL("../../../components/shell/AppShell.tsx", import.meta.url),
  "utf8"
);

test("disconnected wallet does not display a remembered address", () => {
  assert.equal(
    walletControlLabel({ connected: false, publicKeyBase58: "AXMM3XNF2jpN1WizwF1CaT22V5BFugCokhB2bojKdAoD" }),
    "Connect wallet"
  );
  assert.equal(
    isWalletUiConnected({
      connected: false,
      publicKeyBase58: "AXMM3XNF2jpN1WizwF1CaT22V5BFugCokhB2bojKdAoD",
    }),
    false
  );
});

test("connected wallet displays current publicKey short form", () => {
  const key = "AXMM3XNF2jpN1WizwF1CaT22V5BFugCokhB2bojKdAoD";
  assert.equal(
    walletControlLabel({ connected: true, publicKeyBase58: key }),
    shortenAddress(key)
  );
  assert.equal(isWalletUiConnected({ connected: true, publicKeyBase58: key }), true);
  assert.match(walletControlLabel({ connected: true, publicKeyBase58: key }), /^AXMM…dAoD$/);
});

test("missing publicKey while connected still shows Connect wallet", () => {
  assert.equal(
    walletControlLabel({ connected: true, publicKeyBase58: null }),
    "Connect wallet"
  );
  assert.equal(isWalletUiConnected({ connected: true, publicKeyBase58: null }), false);
});

test("WalletControl uses explicit adapter connect and real disconnect", () => {
  assert.match(WALLET_UI, /useWallet\(/);
  assert.match(WALLET_UI, /connected/);
  assert.match(WALLET_UI, /publicKey/);
  assert.match(WALLET_UI, /connect/);
  assert.match(WALLET_UI, /disconnect/);
  assert.match(WALLET_UI, /connectRequestedRef/);
  assert.match(WALLET_UI, /setVisible\(true\)/);
  assert.match(WALLET_UI, /Connect wallet/);
  assert.match(WALLET_UI, /Copy address/);
  assert.match(WALLET_UI, /Change wallet/);
  assert.match(WALLET_UI, /Disconnect/);
  assert.doesNotMatch(WALLET_UI, /WalletMultiButton/);
  assert.match(WALLET_UI, /isWalletUiConnected/);

  // Account sign-in must not silently reconnect a previously used wallet.
  assert.doesNotMatch(PROVIDERS, /\bautoConnect\b/);
});

test("account-change source of truth remains wallet-adapter publicKey", () => {
  assert.match(WALLET_UI, /publicKey\?\.toBase58/);
  assert.match(WALLET_UI, /walletControlLabel/);
  assert.match(SHELL, /WalletControl/);
  assert.match(SHELL, /NetworkControl/);
});

test("Devnet is the active configured cluster", () => {
  assert.equal(ACTIVE_CLUSTER_ID, "devnet");
  assert.equal(NETWORK.cluster, "devnet");
  assert.equal(NETWORK.label, "Devnet");
  assert.equal(getActiveCluster().configured, true);
  assert.equal(isClusterTransactionReady("devnet"), true);
  assert.equal(canSelectCluster("devnet"), true);
});

test("Mainnet is disabled when configuration is absent", () => {
  assert.equal(MAINNET_CLUSTER.configured, false);
  assert.equal(isClusterTransactionReady("mainnet-beta"), false);
  assert.equal(canSelectCluster("mainnet-beta"), false);
  assert.equal(assertClusterBundleIntegrity(MAINNET_CLUSTER), null);
  const items = networkMenuItems();
  const mainnet = items.find((item: { id: string }) => item.id === "mainnet-beta");
  assert.ok(mainnet);
  assert.equal(mainnet?.selectable, false);
  assert.equal(mainnet?.active, false);
  assert.match(mainnet?.description ?? "", /Not configured/i);
});

test("network UI cannot produce mixed cluster configuration", () => {
  assert.equal(assertClusterBundleIntegrity(PREMIFLOW_CLUSTERS.devnet), null);
  const mixed = {
    ...MAINNET_CLUSTER,
    configured: true,
    programId: PREMIFLOW_CLUSTERS.devnet.programId,
    paymentMint: null,
    paymentMintDecimals: null,
    resolver: null,
  };
  assert.match(assertClusterBundleIntegrity(mixed) ?? "", /missing program, mint/i);

  const partial = {
    ...MAINNET_CLUSTER,
    configured: false,
    programId: "SomeProgram1111111111111111111111111111111",
    paymentMint: null,
    paymentMintDecimals: null,
    resolver: null,
  };
  assert.match(assertClusterBundleIntegrity(partial) ?? "", /partial configuration/i);
});

test("NetworkControl marks Devnet active and Mainnet not configured", () => {
  assert.match(NETWORK_UI, /Network/);
  assert.match(NETWORK_UI, /networkMenuItems/);
  assert.match(NETWORK_UI, /Not configured yet/);
  assert.match(NETWORK_UI, /disabled=\{!item\.selectable\}/);
});
