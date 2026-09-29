import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";
import { createMemoryNotificationStore } from "../memory-stores";
import {
  OfferLifecycleError,
  isOfferLifecycleKind,
  notifyOfferLifecycle,
  offerLifecycleUniqueKey,
  type OfferLifecycleFacts,
} from "../notifications/offer-lifecycle";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const CONTRACT = WALLET_C.toBase58();

function facts(status: OfferLifecycleFacts["status"]): OfferLifecycleFacts {
  return { employer: EMPLOYER, freelancer: FREELANCER, status };
}

test("offer_accepted: freelancer caller + PendingEmployerApproval notifies once (idempotent retry)", async () => {
  const store = createMemoryNotificationStore();
  const input = {
    kind: "offer_accepted" as const,
    contractAddress: CONTRACT,
    callerWallet: FREELANCER,
    facts: facts("PendingEmployerApproval"),
  };
  assert.deepEqual(await notifyOfferLifecycle(store, input), { created: true });
  assert.deepEqual(await notifyOfferLifecycle(store, input), { created: false });
});

test("contract_activated: employer caller + Active notifies the freelancer once", async () => {
  const store = createMemoryNotificationStore();
  const input = {
    kind: "contract_activated" as const,
    contractAddress: CONTRACT,
    callerWallet: EMPLOYER,
    facts: facts("Active"),
  };
  assert.equal((await notifyOfferLifecycle(store, input)).created, true);
  assert.equal((await notifyOfferLifecycle(store, input)).created, false);
});

test("wrong caller is rejected (forbidden) and never writes", async () => {
  const store = createMemoryNotificationStore();
  for (const callerWallet of [EMPLOYER, CONTRACT]) {
    await assert.rejects(
      notifyOfferLifecycle(store, {
        kind: "offer_accepted",
        contractAddress: CONTRACT,
        callerWallet,
        facts: facts("PendingEmployerApproval"),
      }),
      (err: unknown) => err instanceof OfferLifecycleError && err.code === "forbidden"
    );
  }
  await assert.rejects(
    notifyOfferLifecycle(store, {
      kind: "contract_offer_received",
      contractAddress: CONTRACT,
      callerWallet: FREELANCER,
      facts: facts("PendingAcceptance"),
    }),
    (err: unknown) => err instanceof OfferLifecycleError && err.code === "forbidden"
  );
});

test("on-chain status must already reflect the transition (state_mismatch)", async () => {
  const store = createMemoryNotificationStore();
  const cases = [
    { kind: "contract_activated" as const, caller: EMPLOYER, status: "PendingEmployerApproval" as const },
    { kind: "offer_accepted" as const, caller: FREELANCER, status: "PendingAcceptance" as const },
    { kind: "contract_offer_received" as const, caller: EMPLOYER, status: "Active" as const },
    { kind: "contract_offer_received" as const, caller: EMPLOYER, status: "Draft" as const },
  ];
  for (const c of cases) {
    await assert.rejects(
      notifyOfferLifecycle(store, {
        kind: c.kind,
        contractAddress: CONTRACT,
        callerWallet: c.caller,
        facts: facts(c.status),
      }),
      (err: unknown) => err instanceof OfferLifecycleError && err.code === "state_mismatch",
      `${c.kind} @ ${c.status}`
    );
  }
});

test("offer_received for a PendingAcceptance offer notifies the freelancer; same wallet skips self", async () => {
  const store = createMemoryNotificationStore();
  const created = await notifyOfferLifecycle(store, {
    kind: "contract_offer_received",
    contractAddress: CONTRACT,
    callerWallet: EMPLOYER,
    facts: facts("PendingAcceptance"),
  });
  assert.equal(created.created, true);
  const self = await notifyOfferLifecycle(store, {
    kind: "offer_accepted",
    contractAddress: CONTRACT,
    callerWallet: EMPLOYER,
    facts: { employer: EMPLOYER, freelancer: EMPLOYER, status: "PendingEmployerApproval" },
  });
  assert.deepEqual(self, { created: false, skipped: "self" });
});

test("unique key is contract + recipient + kind and fits the schema limit", () => {
  const key = offerLifecycleUniqueKey("contract_offer_received", CONTRACT, FREELANCER);
  assert.equal(key, `contract_offer_received:${CONTRACT}:${FREELANCER}`);
  assert.ok(key.length <= 200);
  assert.equal(isOfferLifecycleKind("offer_accepted"), true);
  assert.equal(isOfferLifecycleKind("message_received"), false);
  assert.equal(isOfferLifecycleKind(undefined), false);
});

test("route authenticates the session and re-reads on-chain state before notifying", () => {
  const src = read("app/api/contracts/[address]/lifecycle-notifications/route.ts");
  assert.match(src, /requireMutatingOrigin\(request\)/);
  assert.match(src, /requireSession\(request, stores, env\)/);
  assert.match(src, /readContractSnapshot\(\s*connectionSnapshotReader\(env\.solanaRpcUrl\)/);
  assert.match(src, /callerWallet: session\.walletAddress/);
  assert.match(src, /facts: snapshot\.facts/);
});
