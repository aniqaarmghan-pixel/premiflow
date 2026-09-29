import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PublicKey } from "@solana/web3.js";

import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";
import {
  CaseAccessError,
  createOrRecoverResolutionCase,
  getResolutionCase,
  upsertOwnStatement,
} from "../cases/service";
import { createMemoryCaseStore, createMemoryNotificationStore } from "../memory-stores";
import {
  DisputeAssignedError,
  notifyDisputeAssigned,
  type DisputeAssignedFacts,
} from "../notifications/dispute-assigned";
import { markAllNotificationsRead, unreadNotificationCount } from "../notifications/service";
import type { ContractCaseFacts, ContractFactsReader } from "../solana/read-contract-case-facts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const UNRELATED = WALLET_C.toBase58();
const RESOLVER = new PublicKey(new Uint8Array(32).fill(9)).toBase58();
const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();

function facts(overrides: Partial<DisputeAssignedFacts> = {}): DisputeAssignedFacts {
  return {
    employer: EMPLOYER,
    freelancer: FREELANCER,
    resolver: RESOLVER,
    status: "Disputed",
    disputedAt: 1_700_000_100,
    ...overrides,
  };
}

const unread = async (store: ReturnType<typeof createMemoryNotificationStore>, wallet: string) =>
  (await unreadNotificationCount(store, wallet)).unreadCount;

test("dispute assigned: resolver notified once per contract + disputed_at (idempotent)", async () => {
  const store = createMemoryNotificationStore();
  const input = { contractAddress: CONTRACT, facts: facts() };
  assert.deepEqual(await notifyDisputeAssigned(store, { ...input, callerWallet: EMPLOYER }), { created: true });
  assert.deepEqual(await notifyDisputeAssigned(store, { ...input, callerWallet: RESOLVER }), { created: false });
  assert.deepEqual(await notifyDisputeAssigned(store, { ...input, callerWallet: FREELANCER }), { created: false });
  assert.equal(await unread(store, RESOLVER), 1);
  assert.equal(await unread(store, EMPLOYER), 0);
});

test("dispute assigned: read state is respected on later syncs", async () => {
  const store = createMemoryNotificationStore();
  const input = { contractAddress: CONTRACT, callerWallet: RESOLVER, facts: facts() };
  await notifyDisputeAssigned(store, input);
  await markAllNotificationsRead(store, RESOLVER);
  assert.deepEqual(await notifyDisputeAssigned(store, input), { created: false });
  assert.equal(await unread(store, RESOLVER), 0);
});

test("dispute assigned: unrelated wallet forbidden; non-Disputed is a state mismatch", async () => {
  const store = createMemoryNotificationStore();
  await assert.rejects(
    notifyDisputeAssigned(store, { contractAddress: CONTRACT, callerWallet: UNRELATED, facts: facts() }),
    (err: unknown) => err instanceof DisputeAssignedError && err.code === "forbidden"
  );
  await assert.rejects(
    notifyDisputeAssigned(store, {
      contractAddress: CONTRACT,
      callerWallet: EMPLOYER,
      facts: facts({ status: "Active", disputedAt: 0 }),
    }),
    (err: unknown) => err instanceof DisputeAssignedError && err.code === "state_mismatch"
  );
  assert.equal(await unread(store, RESOLVER), 0);
});

test("dispute assigned: a resolver who is also a party is not notified", async () => {
  const store = createMemoryNotificationStore();
  assert.deepEqual(
    await notifyDisputeAssigned(store, {
      contractAddress: CONTRACT,
      callerWallet: EMPLOYER,
      facts: facts({ resolver: FREELANCER }),
    }),
    { created: false, skipped: "party_resolver" }
  );
});

function caseFacts(): ContractCaseFacts {
  return {
    employer: EMPLOYER,
    freelancer: FREELANCER,
    resolver: RESOLVER,
    status: "Disputed",
    paymentMode: "Streaming",
    disputeInitiator: "Employer",
    disputedAt: 1_700_000_100,
    terminatedAt: 0,
    contestedAmount: "90",
    freelancerSettlementAmount: "0",
    employerRefundableAmount: "0",
    releasedAmount: "10",
    withdrawnAmount: "10",
    refundedAmount: "0",
  };
}

const reader: ContractFactsReader = {
  async read() {
    return caseFacts();
  },
};

test("resolver reads both statements read-only; only when the route allows it; never writes", async () => {
  const db = { cases: createMemoryCaseStore() };
  await createOrRecoverResolutionCase(db, reader, { contractAddress: CONTRACT, sessionWallet: EMPLOYER });
  await upsertOwnStatement(db, reader, { contractAddress: CONTRACT, sessionWallet: EMPLOYER, body: "Employer view" });
  await upsertOwnStatement(db, reader, { contractAddress: CONTRACT, sessionWallet: FREELANCER, body: "Freelancer view" });
  await assert.rejects(
    getResolutionCase(db.cases, reader, { contractAddress: CONTRACT, sessionWallet: RESOLVER }),
    CaseAccessError
  );
  const view = await getResolutionCase(
    db.cases,
    reader,
    { contractAddress: CONTRACT, sessionWallet: RESOLVER },
    new Date(),
    { allowResolver: true }
  );
  assert.equal(view.viewerRole, "resolver");
  assert.equal(view.employerStatement?.body, "Employer view");
  assert.equal(view.freelancerStatement?.body, "Freelancer view");
  await assert.rejects(
    getResolutionCase(
      db.cases,
      reader,
      { contractAddress: CONTRACT, sessionWallet: UNRELATED },
      new Date(),
      { allowResolver: true }
    ),
    CaseAccessError
  );
  await assert.rejects(
    upsertOwnStatement(db, reader, { contractAddress: CONTRACT, sessionWallet: RESOLVER, body: "x" }),
    CaseAccessError
  );
});

test("case routes: GET allows the resolver read-only; writes stay party-only", () => {
  const caseRoute = read("app/api/contracts/[address]/case/route.ts");
  const get = caseRoute.slice(
    caseRoute.indexOf("export async function GET"),
    caseRoute.indexOf("export async function POST")
  );
  assert.match(get, /requireCaseViewer/);
  const writes = caseRoute.slice(caseRoute.indexOf("export async function POST"));
  assert.doesNotMatch(writes, /requireCaseViewer/);
  assert.match(writes, /requireCaseParty/);
  const statementRoute = read("app/api/contracts/[address]/case/statement/route.ts");
  assert.match(statementRoute, /requireCaseParty/);
  assert.doesNotMatch(statementRoute, /requireCaseViewer/);
  const notifyRoute = read("app/api/contracts/[address]/dispute-assigned-notification/route.ts");
  assert.match(notifyRoute, /requireSession/);
  assert.match(notifyRoute, /connectionCaseFactsReader/);
});
