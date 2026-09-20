import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { availableActions } from "../../streampay-v2/actions";
import { activationDeadlineUnix } from "../../streampay-v2/derived";
import { makeContract, makeWorkUnit, WALLET_A, WALLET_B, WALLET_C } from "../../streampay-v2/tests/fixtures";
import { NOTICE_CATALOG, noticeKindForAction } from "../notices";
import { ACTIVATION_EXIT_COPY, expireActivationConfirmation } from "../activation-exit";
import { actionLabel, clientMethodForAction, confirmTitle } from "../view-model";
import { shouldAttemptCaseRecover, shouldRecoverAfterAction } from "../resolution-case";

const detail = readFileSync(
  new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
  "utf8"
);

function pendingNoTrial() {
  return makeContract({
    status: "PendingEmployerApproval",
    trialAmount: 0n,
    mainAmount: 1_000n,
    totalAmount: 1_000n,
    startTime: 0,
    endTime: 0,
    acceptedAt: 1_699_500_000,
    activationReviewDuration: 3_600,
  });
}

function pendingTrial() {
  return makeContract({
    status: "PendingEmployerApproval",
    trialAmount: 50n,
    mainAmount: 950n,
    totalAmount: 1_000n,
    startTime: 0,
    endTime: 0,
    acceptedAt: 1_699_500_000,
    activationReviewDuration: 3_600,
  });
}

test("end expired activation is distinct from T1, T2, and T3", () => {
  assert.equal(actionLabel("expireActivation"), "End expired activation");
  assert.equal(confirmTitle("expireActivation"), "End expired activation?");
  assert.equal(clientMethodForAction("expireActivation"), "expireActivation");
  assert.notEqual(actionLabel("expireActivation"), actionLabel("expireAcceptance"));
  assert.notEqual(actionLabel("expireActivation"), actionLabel("settleTrialAndEnd"));
  assert.notEqual(actionLabel("expireActivation"), actionLabel("rejectActivation"));
  assert.notEqual(actionLabel("expireActivation"), actionLabel("cancelActiveContract"));
  assert.notEqual(actionLabel("expireActivation"), actionLabel("openDispute"));
  assert.match(detail, /case "expireActivation":/);
  assert.match(detail, /client\.expireActivation\(contract\.address\)/);
  assert.match(detail, /expireActivationConfirmation/);
});

test("pre-deadline activation actions remain; T4 is hidden", () => {
  const contract = pendingNoTrial();
  const now = activationDeadlineUnix(contract) - 1;
  const employer = availableActions({ wallet: WALLET_A, contract, now });
  const freelancer = availableActions({ wallet: WALLET_B, contract, now });
  assert.ok(employer.includes("approveActivation"));
  assert.ok(employer.includes("rejectActivation"));
  assert.ok(!employer.includes("expireActivation"));
  assert.ok(!freelancer.includes("expireActivation"));
  assert.ok(!freelancer.includes("approveActivation"));

  const trialContract = pendingTrial();
  const defined = makeWorkUnit({ kind: "Trial", status: "Defined", amount: 50n });
  const trialEmployer = availableActions({
    wallet: WALLET_A,
    contract: trialContract,
    trialUnit: defined,
    now,
  });
  const trialFreelancer = availableActions({
    wallet: WALLET_B,
    contract: trialContract,
    trialUnit: defined,
    now,
  });
  assert.ok(!trialEmployer.includes("approveActivation"));
  assert.ok(trialFreelancer.includes("submitTrialWork"));
  assert.ok(!trialEmployer.includes("expireActivation"));
  assert.ok(!trialFreelancer.includes("expireActivation"));
});

test("post-deadline Activate, Approve trial, and Submit trial disappear", () => {
  const contract = pendingNoTrial();
  const now = activationDeadlineUnix(contract);
  const employer = availableActions({ wallet: WALLET_A, contract, now });
  assert.ok(!employer.includes("approveActivation"));
  assert.ok(employer.includes("expireActivation"));
  assert.ok(employer.includes("rejectActivation"));

  const trialContract = pendingTrial();
  const defined = makeWorkUnit({ kind: "Trial", status: "Defined", amount: 50n });
  const submitted = makeWorkUnit({
    kind: "Trial",
    status: "Submitted",
    amount: 50n,
    actionDeadline: now + 300,
  });
  const revising = makeWorkUnit({ kind: "Trial", status: "Revising", amount: 50n });

  const definedEmployer = availableActions({
    wallet: WALLET_A,
    contract: trialContract,
    trialUnit: defined,
    now,
  });
  const definedFreelancer = availableActions({
    wallet: WALLET_B,
    contract: trialContract,
    trialUnit: defined,
    now,
  });
  assert.ok(definedEmployer.includes("expireActivation"));
  assert.ok(definedFreelancer.includes("expireActivation"));
  assert.ok(!definedFreelancer.includes("submitTrialWork"));
  assert.ok(!definedEmployer.includes("approveTrialAndActivate"));

  const submittedEmployer = availableActions({
    wallet: WALLET_A,
    contract: trialContract,
    trialUnit: submitted,
    now,
  });
  assert.ok(!submittedEmployer.includes("expireActivation"));
  assert.ok(!submittedEmployer.includes("approveTrialAndActivate"));
  assert.ok(submittedEmployer.includes("settleTrialAndEnd"));
  assert.ok(submittedEmployer.includes("rejectActivation"));

  const revisingEmployer = availableActions({
    wallet: WALLET_A,
    contract: trialContract,
    trialUnit: revising,
    now,
  });
  const revisingFreelancer = availableActions({
    wallet: WALLET_B,
    contract: trialContract,
    trialUnit: revising,
    now,
  });
  assert.ok(!revisingEmployer.includes("expireActivation"));
  assert.ok(!revisingFreelancer.includes("submitTrialWork"));
  assert.ok(!revisingFreelancer.includes("expireActivation"));

  const stranger = availableActions({
    wallet: WALLET_C,
    contract,
    now,
  });
  assert.ok(!stranger.includes("expireActivation"));
});

test("expire confirmation and notices explain refund later, not immediate transfer", () => {
  const copy = expireActivationConfirmation({
    contract: pendingNoTrial(),
    decimals: 0,
  });
  assert.equal(copy.fundedAmountLabel, "1000");
  assert.ok(copy.points.includes(ACTIVATION_EXIT_COPY.windowEnded));
  assert.ok(copy.points.includes(ACTIVATION_EXIT_COPY.mainDidNotStart));
  assert.ok(copy.points.includes(ACTIVATION_EXIT_COPY.noDispute));
  assert.ok(copy.points.includes(ACTIVATION_EXIT_COPY.noImmediateTransfer));
  assert.ok(copy.points.includes(ACTIVATION_EXIT_COPY.laterRefund));
  assert.match(ACTIVATION_EXIT_COPY.body, /does not itself transfer the escrow tokens/i);
  assert.match(ACTIVATION_EXIT_COPY.body, /does not open a dispute/i);
  assert.equal(noticeKindForAction("expireActivation"), "activation_window_ended");
  assert.match(NOTICE_CATALOG.activation_window_ended.body, /Claim refund/i);
  assert.match(NOTICE_CATALOG.activation_window_ended.body, /did not start/i);
  assert.match(NOTICE_CATALOG.activation_window_ended.body, /No dispute was opened/);
  assert.doesNotMatch(NOTICE_CATALOG.activation_window_ended.body, /transferred to your wallet/i);
  assert.equal(shouldRecoverAfterAction("expireActivation", "ActivationRejected"), false);
  assert.equal(shouldRecoverAfterAction("expireActivation", "Disputed"), false);
  assert.equal(shouldAttemptCaseRecover("ActivationRejected", "employer"), false);
});
