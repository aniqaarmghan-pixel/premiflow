import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CASE_WORKSPACE_RECOVERY_FAILED,
  dbFailureAfterChainSuccessIsTransactionFailure,
  displayedCaseStatusLabel,
  neverShowPaidFromDatabase,
  shouldAttemptCaseRecover,
  shouldRecoverAfterAction,
} from "../resolution-case";
import {
  CASE_PREPARATION_COPY,
  CASE_WORKSPACE_COPY,
  EVIDENCE_COPY,
  PARTY_STATEMENTS_COPY,
  RESOLUTION_CASE_PERSISTENCE,
  suggestedAwardFromCategory,
} from "../resolution-center";

test("Resolution Case backend persistence flags are on, notes stay off-chain", () => {
  assert.equal(RESOLUTION_CASE_PERSISTENCE.onChain, false);
  assert.equal(RESOLUTION_CASE_PERSISTENCE.backend, true);
  assert.equal(RESOLUTION_CASE_PERSISTENCE.requiredForOpenDispute, false);
  assert.equal(caseNotesRequired(), false);
  assert.match(CASE_PREPARATION_COPY.notStored, /not recorded on-chain/i);
  assert.match(CASE_PREPARATION_COPY.notStored, /saves them to the Resolution Case/i);
  assert.match(CASE_PREPARATION_COPY.categoryHint, /does not choose a winner/i);
  assert.match(CASE_PREPARATION_COPY.categoryHint, /freelancerContestedAward/i);
});

function caseNotesRequired() {
  return RESOLUTION_CASE_PERSISTENCE.requiredForOpenDispute;
}

test("DB failure after chain success is a case-workspace recovery failure, not a transaction failure", () => {
  assert.equal(dbFailureAfterChainSuccessIsTransactionFailure(), false);
  assert.equal(
    CASE_WORKSPACE_RECOVERY_FAILED,
    "Your dispute is active on-chain. PREMIFLOW could not load the case workspace yet. Retry case recovery."
  );
  const detail = readFileSync(
    new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
    "utf8"
  );
  assert.match(detail, /shouldRecoverAfterAction/);
  assert.match(detail, /setCaseRecoverGeneration/);
  assert.match(detail, /client\.openDispute\(contract\.address\)/);
  assert.match(detail, /client\.rejectActivation\(contract\.address\)/);
  const center = readFileSync(
    new URL("../../../components/contracts/ResolutionCenter.tsx", import.meta.url),
    "utf8"
  );
  assert.match(center, /CASE_WORKSPACE_RECOVERY_FAILED/);
  assert.match(center, /recoverResolutionCase/);
  assert.doesNotMatch(center, /type=["']file["']/);
  assert.match(center, /EVIDENCE_COPY\.nextPhase/);
});

test("both dispute-opening paths attempt case recovery after confirmed chain success", () => {
  assert.equal(shouldRecoverAfterAction("openDispute", "Disputed"), true);
  assert.equal(shouldRecoverAfterAction("rejectActivation", "Disputed"), true);
  assert.equal(shouldRecoverAfterAction("rejectActivation", "ActivationRejected"), false);
  assert.equal(shouldRecoverAfterAction("openDispute", "Active"), false);
  assert.equal(shouldAttemptCaseRecover("Cancelled", "employer"), false);
  assert.equal(shouldAttemptCaseRecover("Disputed", "employer"), true);
  assert.equal(shouldAttemptCaseRecover("Resolved", "freelancer"), true);
  assert.equal(shouldAttemptCaseRecover("Disputed", "resolver"), false);
  assert.equal(shouldAttemptCaseRecover("Active", "employer"), false);
});

test("displayed case status prefers on-chain Resolved and never invents Paid", () => {
  const resolved = displayedCaseStatusLabel({
    chainStatus: "Resolved",
    workflowStatus: "ready_for_resolver",
    payoutState: "unclaimed",
  });
  assert.match(resolved, /Resolved \(on-chain\)/);
  assert.equal(neverShowPaidFromDatabase(resolved), true);
  const disputed = displayedCaseStatusLabel({
    chainStatus: "Disputed",
    workflowStatus: "awaiting_statements",
    payoutState: "not_resolved",
  });
  assert.match(disputed, /Disputed \(on-chain\)/);
  assert.match(disputed, /Awaiting statements/);
  assert.equal(suggestedAwardFromCategory("payment"), null);
});

test("party workspace copy covers statements, evidence next phase, and on-chain facts", () => {
  assert.match(PARTY_STATEMENTS_COPY.ready, /does not block resolve_dispute/i);
  assert.match(PARTY_STATEMENTS_COPY.ownOnly, /only your statement/i);
  assert.match(PARTY_STATEMENTS_COPY.resolverCannot, /resolver cannot write/i);
  assert.equal(EVIDENCE_COPY.nextPhase, "Evidence submission is coming in the next Resolution phase.");
  assert.match(CASE_WORKSPACE_COPY.contestedHint, /on-chain Contract account/i);
  assert.match(CASE_WORKSPACE_COPY.snapshotHint, /authoritative/i);
});
