import assert from "node:assert/strict";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import { createOrRecoverResolutionCase, upsertOwnStatement, CaseAccessError } from "../cases/service";
import { createMemoryCaseStore, createMemoryNotificationStore } from "../memory-stores";
import {
  statementSubmittedRecipients,
  statementSubmittedUniqueKey,
} from "../notifications/statement-submitted";
import type { ContractCaseFacts, ContractFactsReader } from "../solana/read-contract-case-facts";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const RESOLVER_WALLET = WALLET_C.toBase58();

const facts: ContractCaseFacts = {
  employer: EMPLOYER,
  freelancer: FREELANCER,
  resolver: RESOLVER_WALLET,
  status: "Disputed",
  paymentMode: "Fixed",
  disputeInitiator: "Employer",
  disputedAt: 1_700_000_100,
  terminatedAt: 0,
  contestedAmount: "90",
  freelancerSettlementAmount: "0",
  employerRefundableAmount: "0",
  releasedAmount: "10",
  withdrawnAmount: "0",
  refundedAmount: "0",
};
const reader: ContractFactsReader = { async read() { return facts; } };

async function setup() {
  const db = { cases: createMemoryCaseStore(), notifications: createMemoryNotificationStore() };
  await createOrRecoverResolutionCase(db, reader, { contractAddress: CONTRACT, sessionWallet: EMPLOYER });
  return db;
}

const inbox = (db: Awaited<ReturnType<typeof setup>>, w: string) =>
  db.notifications.listForWallet(w, null, 50);

test("first statement notifies the other party and the resolver with a Resolution Center link", async () => {
  const db = await setup();
  await upsertOwnStatement(db, reader, { contractAddress: CONTRACT, sessionWallet: EMPLOYER, body: "Employer view" });
  const toFreelancer = await inbox(db, FREELANCER);
  const toResolver = await inbox(db, RESOLVER_WALLET);
  assert.equal(toFreelancer.length, 1);
  assert.equal(toResolver.length, 1);
  assert.equal(toFreelancer[0]!.href, `/contracts/${CONTRACT}#resolution`);
  assert.equal(toResolver[0]!.href, `/contracts/${CONTRACT}#resolution`);
  assert.equal((await inbox(db, EMPLOYER)).length, 0, "submitter is not notified");
});

test("edits do not create duplicate notifications", async () => {
  const db = await setup();
  for (const body of ["v1", "v2", "v3"]) {
    await upsertOwnStatement(db, reader, { contractAddress: CONTRACT, sessionWallet: EMPLOYER, body });
  }
  assert.equal((await inbox(db, FREELANCER)).length, 1);
  assert.equal((await inbox(db, RESOLVER_WALLET)).length, 1);
  // The freelancer's own first statement notifies the employer + resolver once.
  await upsertOwnStatement(db, reader, { contractAddress: CONTRACT, sessionWallet: FREELANCER, body: "f1" });
  await upsertOwnStatement(db, reader, { contractAddress: CONTRACT, sessionWallet: FREELANCER, body: "f2" });
  assert.equal((await inbox(db, EMPLOYER)).length, 1);
  assert.equal((await inbox(db, RESOLVER_WALLET)).length, 2);
});

test("statement permissions: resolver cannot write; each party writes only its own", async () => {
  const db = await setup();
  await assert.rejects(
    upsertOwnStatement(db, reader, { contractAddress: CONTRACT, sessionWallet: RESOLVER_WALLET, body: "x" }),
    CaseAccessError
  );
  const c = await upsertOwnStatement(db, reader, {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    body: "mine",
    partyRole: "freelancer",
    partyWallet: FREELANCER,
  });
  assert.equal(c.employerStatement?.body, "mine");
  assert.equal(c.freelancerStatement, null);
});

test("recipients exclude submitter and an unset resolver; keys are per role + recipient", () => {
  assert.deepEqual(
    statementSubmittedRecipients({ ...facts, resolver: "11111111111111111111111111111111" }, "freelancer"),
    [{ wallet: EMPLOYER, audience: "party" }]
  );
  assert.notEqual(
    statementSubmittedUniqueKey(CONTRACT, "employer", RESOLVER_WALLET),
    statementSubmittedUniqueKey(CONTRACT, "freelancer", RESOLVER_WALLET)
  );
});
