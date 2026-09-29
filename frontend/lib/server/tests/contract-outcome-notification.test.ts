import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PublicKey } from "@solana/web3.js";

import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";
import { createMemoryNotificationStore } from "../memory-stores";
import {
  ContractOutcomeError,
  contractOutcomeUniqueKey,
  notifyContractOutcome,
  type ContractOutcomeFacts,
} from "../notifications/contract-outcome";
import { markAllNotificationsRead, unreadNotificationCount } from "../notifications/service";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const UNRELATED = WALLET_C.toBase58();
const RESOLVER = new PublicKey(new Uint8Array(32).fill(9)).toBase58();
const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();

function facts(overrides: Partial<ContractOutcomeFacts> = {}): ContractOutcomeFacts {
  return {
    employer: EMPLOYER,
    freelancer: FREELANCER,
    resolver: RESOLVER,
    status: "Completed",
    freelancerSettlementAmount: "0",
    employerRefundableAmount: "0",
    withdrawnAmount: "0",
    refundedAmount: "0",
    ...overrides,
  };
}

const unread = async (store: ReturnType<typeof createMemoryNotificationStore>, wallet: string) =>
  (await unreadNotificationCount(store, wallet)).unreadCount;
const isCode = (code: string) => (err: unknown) => err instanceof ContractOutcomeError && err.code === code;

test("contract ended: counterparty notified once; caller is not notified", async () => {
  const store = createMemoryNotificationStore();
  const input = { kind: "contract_ended" as const, contractAddress: CONTRACT, callerWallet: EMPLOYER, facts: facts() };
  const first = await notifyContractOutcome(store, input);
  assert.equal(first.created, true);
  assert.deepEqual(first.notified.map((n) => [n.recipient, n.title]), [[FREELANCER, "Contract ended"]]);
  assert.equal((await notifyContractOutcome(store, input)).created, false);
  assert.equal(await unread(store, FREELANCER), 1);
  assert.equal(await unread(store, EMPLOYER), 0);
  const cancelled = await notifyContractOutcome(createMemoryNotificationStore(), {
    ...input,
    callerWallet: FREELANCER,
    facts: facts({ status: "Cancelled" }),
  });
  assert.deepEqual(cancelled.notified.map((n) => [n.recipient, n.title]), [[EMPLOYER, "Contract cancelled"]]);
  assert.equal(
    contractOutcomeUniqueKey("contract_ended", CONTRACT, FREELANCER),
    `contract_ended:${CONTRACT}:${FREELANCER}`
  );
});

test("contract ended: unrelated wallet and resolver forbidden; non-terminal status rejected", async () => {
  const store = createMemoryNotificationStore();
  for (const caller of [UNRELATED, RESOLVER]) {
    await assert.rejects(
      notifyContractOutcome(store, { kind: "contract_ended", contractAddress: CONTRACT, callerWallet: caller, facts: facts() }),
      isCode("forbidden")
    );
  }
  for (const status of ["Active", "Disputed", "Resolved"] as const) {
    await assert.rejects(
      notifyContractOutcome(store, {
        kind: "contract_ended",
        contractAddress: CONTRACT,
        callerWallet: EMPLOYER,
        facts: facts({ status }),
      }),
      isCode("state_mismatch")
    );
  }
  assert.equal(await unread(store, FREELANCER), 0);
});

test("settlement recorded: both parties notified once with collect/refund guidance; read state kept", async () => {
  const store = createMemoryNotificationStore();
  const input = {
    kind: "settlement_recorded" as const,
    contractAddress: CONTRACT,
    callerWallet: RESOLVER,
    facts: facts({
      status: "Resolved",
      freelancerSettlementAmount: "700",
      withdrawnAmount: "100",
      employerRefundableAmount: "300",
      refundedAmount: "0",
    }),
  };
  const first = await notifyContractOutcome(store, input);
  assert.equal(first.notified.filter((n) => n.created).length, 2);
  const freelancer = first.notified.find((n) => n.recipient === FREELANCER);
  const employer = first.notified.find((n) => n.recipient === EMPLOYER);
  assert.match(freelancer?.body ?? "", /available for you to collect/);
  assert.match(employer?.body ?? "", /refund is available/);
  for (const n of first.notified) assert.doesNotMatch(n.body, /\btransferred\b|\bsent you\b/i);
  await markAllNotificationsRead(store, FREELANCER);
  const again = await notifyContractOutcome(store, { ...input, callerWallet: EMPLOYER });
  assert.equal(again.created, false);
  assert.equal(await unread(store, FREELANCER), 0);
  assert.equal(await unread(store, EMPLOYER), 1);
  assert.equal(await unread(store, RESOLVER), 0);
});

test("settlement recorded: unrelated forbidden; only when Resolved; nothing-left copy", async () => {
  const store = createMemoryNotificationStore();
  await assert.rejects(
    notifyContractOutcome(store, {
      kind: "settlement_recorded",
      contractAddress: CONTRACT,
      callerWallet: UNRELATED,
      facts: facts({ status: "Resolved" }),
    }),
    isCode("forbidden")
  );
  await assert.rejects(
    notifyContractOutcome(store, {
      kind: "settlement_recorded",
      contractAddress: CONTRACT,
      callerWallet: RESOLVER,
      facts: facts({ status: "Disputed" }),
    }),
    isCode("state_mismatch")
  );
  const none = await notifyContractOutcome(store, {
    kind: "settlement_recorded",
    contractAddress: CONTRACT,
    callerWallet: FREELANCER,
    facts: facts({ status: "Resolved", freelancerSettlementAmount: "100", withdrawnAmount: "100" }),
  });
  assert.match(none.notified.find((n) => n.recipient === FREELANCER)?.body ?? "", /nothing further/);
  assert.match(none.notified.find((n) => n.recipient === EMPLOYER)?.body ?? "", /No refund is due/);
});

test("outcome route re-reads chain facts under a signed session", () => {
  const route = readFileSync(join(ROOT, "app/api/contracts/[address]/outcome-notification/route.ts"), "utf8");
  assert.match(route, /requireMutatingOrigin/);
  assert.match(route, /requireSession/);
  assert.match(route, /connectionCaseFactsReader/);
});
