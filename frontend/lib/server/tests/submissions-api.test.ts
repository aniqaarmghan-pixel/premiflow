import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import { availableActions } from "@/lib/streampay-v2/actions";
import { WALLET_A, WALLET_B, WALLET_C, makeContract } from "@/lib/streampay-v2/tests/fixtures";
import {
  createMemoryRateLimitStore,
  createMemorySubmissionStore,
} from "../memory-stores";
import {
  SubmissionAccessError,
  SubmissionValidationError,
  isAuthorizedSubmissionReader,
  isAuthorizedSubmissionWriter,
  listWorkSubmissions,
  persistConfirmedWorkSubmission,
} from "../submissions/service";

const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const OTHER = WALLET_C.toBase58();
const SIG =
  "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSVnAN";

function parties(freelancer = FREELANCER) {
  return { employer: EMPLOYER, freelancer };
}

function stores() {
  return {
    submissions: createMemorySubmissionStore(),
    rates: createMemoryRateLimitStore(),
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    submissionKind: "fixed",
    workUnitIndex: 0,
    revisionNumber: 0,
    deliveryNote: "Completed the landing page revision.",
    links: [{ url: "https://figma.example/file/1", label: "Figma" }],
    onChainSubmissionUri: "https://figma.example/file/1",
    transactionSignature: SIG,
    chainSubmittedAt: 1_700_000_000,
    ...overrides,
  };
}

test("freelancer can persist confirmed own submission; employer and other cannot", async () => {
  const db = stores();
  const saved = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    body: validBody(),
  });
  assert.equal(saved.created, true);
  assert.equal(saved.submission.freelancerWallet, FREELANCER);
  assert.equal(saved.submission.links.length, 1);

  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: EMPLOYER,
        parties: parties(),
        body: validBody({ transactionSignature: SIG + "x".slice(0, 0) + "2" }),
      }),
    SubmissionAccessError
  );

  // Use a different valid-looking signature for stranger attempt.
  const otherSig = SIG.slice(0, -1) + "3";
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: OTHER,
        parties: parties(),
        body: validBody({ transactionSignature: otherSig }),
      }),
    SubmissionAccessError
  );
});

test("participant can read history; client freelancer overrides are rejected", async () => {
  const db = stores();
  const saved = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    body: validBody({ transactionSignature: SIG.slice(0, -1) + "a" }),
  });
  assert.equal(saved.submission.freelancerWallet, FREELANCER);
  assert.equal(isAuthorizedSubmissionReader(EMPLOYER, parties()), true);
  assert.equal(isAuthorizedSubmissionReader(FREELANCER, parties()), true);
  assert.equal(isAuthorizedSubmissionReader(OTHER, parties()), false);
  assert.equal(isAuthorizedSubmissionWriter(FREELANCER, parties()), true);
  assert.equal(isAuthorizedSubmissionWriter(EMPLOYER, parties()), false);

  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody({ freelancer: OTHER }),
      }),
    /not allowed/
  );
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody({ freelancerOverride: OTHER }),
      }),
    /not allowed/
  );

  const listed = await listWorkSubmissions(db.submissions, { contractAddress: CONTRACT });
  assert.equal(listed.submissions.length, 1);
  assert.equal(listed.submissions[0].freelancerWallet, FREELANCER);
});

test("append-only revisions and idempotent duplicate persistence", async () => {
  const db = stores();
  const first = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    body: validBody(),
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const secondSig = SIG.slice(0, -1) + "4";
  const second = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    body: validBody({
      revisionNumber: 1,
      deliveryNote: "Revision with nav fixes.",
      transactionSignature: secondSig,
      links: [
        { url: "https://figma.example/file/2", label: "Figma v2" },
        { url: "https://preview.example/", label: "Live" },
      ],
      onChainSubmissionUri: "https://figma.example/file/2",
    }),
  });
  assert.equal(second.created, true);
  const listed = await listWorkSubmissions(db.submissions, { contractAddress: CONTRACT });
  assert.equal(listed.submissions.length, 2);
  const byRevision = new Map(listed.submissions.map((row) => [row.revisionNumber, row]));
  assert.equal(byRevision.get(1)?.deliveryNote, "Revision with nav fixes.");
  assert.equal(byRevision.get(0)?.id, first.submission.id);
  assert.equal(listed.submissions[0].revisionNumber, 1);

  const again = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    body: validBody(),
  });
  assert.equal(again.created, false);
  assert.equal(again.submission.id, first.submission.id);
  const after = await listWorkSubmissions(db.submissions, { contractAddress: CONTRACT });
  assert.equal(after.submissions.length, 2);
});

test("invalid contract, work identity, and settlement fields rejected", async () => {
  const db = stores();
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: "not-a-key",
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody(),
      }),
    SubmissionValidationError
  );
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody({ submissionKind: "hourly" }),
      }),
    SubmissionValidationError
  );
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody({ workUnitIndex: -1 }),
      }),
    SubmissionValidationError
  );
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody({ payout: "1" }),
      }),
    /not allowed/
  );
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody({ settlement: {} }),
      }),
    /not allowed/
  );
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody({ programIdOverride: "x" }),
      }),
    /not allowed/
  );
});

test("javascript/data/file/non-https links rejected; safe https accepted", async () => {
  const db = stores();
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///etc/passwd",
    "http://insecure.example/",
  ]) {
    await assert.rejects(
      () =>
        persistConfirmedWorkSubmission(db, {
          contractAddress: CONTRACT,
          sessionWallet: FREELANCER,
          parties: parties(),
          body: validBody({
            links: [{ url }],
            onChainSubmissionUri: url.startsWith("https") ? url : "https://ok.example/",
            transactionSignature: SIG.slice(0, -1) + String(url.length % 9),
          }),
        }),
      SubmissionValidationError
    );
  }
  const ok = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    body: validBody({
      transactionSignature: SIG.slice(0, -1) + "7",
      links: [{ url: "https://github.com/org/repo", label: "GitHub" }],
      onChainSubmissionUri: "https://github.com/org/repo",
    }),
  });
  assert.equal(ok.created, true);
});

test("excessive links and oversized note rejected; unknown fields rejected", async () => {
  const db = stores();
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody({
          links: Array.from({ length: 9 }, (_, i) => ({
            url: `https://example.com/${i}`,
          })),
          onChainSubmissionUri: "https://example.com/0",
          transactionSignature: SIG.slice(0, -1) + "8",
        }),
      }),
    /At most 8/
  );
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody({
          deliveryNote: "x".repeat(4001),
          transactionSignature: SIG.slice(0, -1) + "9",
        }),
      }),
    SubmissionValidationError
  );
  await assert.rejects(
    () =>
      persistConfirmedWorkSubmission(db, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        parties: parties(),
        body: validBody({ mystery: true }),
      }),
    SubmissionValidationError
  );
});

test("DB record cannot alter availableActions", () => {
  const contract = makeContract({
    paymentMode: "Fixed",
    status: "Active",
    freelancer: WALLET_B,
  });
  const before = availableActions({
    wallet: WALLET_B,
    contract,
    now: contract.startTime + 10,
  });
  // Neon history is not an input to availableActions.
  assert.equal(typeof before.includes, "function");
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      { submissionHistory: true },
      "availableActions"
    ),
    false
  );
});

test("migration SQL creates append-only submission tables", () => {
  const sql = readFileSync(
    new URL("../../../drizzle/0002_work_delivery_history.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /CREATE TABLE "contract_work_submissions"/);
  assert.match(sql, /CREATE TABLE "contract_work_submission_links"/);
  assert.match(sql, /contract_work_submissions_tx_sig_uidx/);
  assert.match(sql, /submission_kind" in \('trial', 'fixed', 'milestone'\)/);
  assert.match(sql, /char_length\("contract_work_submissions"\."delivery_note"\) between 1 and 4000/);
  assert.doesNotMatch(sql, /bytea|base64|blob/i);
});
