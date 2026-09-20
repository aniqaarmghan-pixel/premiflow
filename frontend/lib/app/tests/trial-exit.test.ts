import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { availableActions } from "../../streampay-v2/actions";
import { makeContract, makeWorkUnit, WALLET_A, WALLET_B } from "../../streampay-v2/tests/fixtures";
import { NOTICE_CATALOG, noticeKindForAction } from "../notices";
import {
  TRIAL_EXIT_COPY,
  settleTrialAndEndConfirmation,
  trialEmployerDecisions,
} from "../trial-exit";
import {
  actionLabel,
  clientMethodForAction,
  confirmTitle,
  needsConfirmation,
} from "../view-model";
import { shouldAttemptCaseRecover, shouldRecoverAfterAction } from "../resolution-case";

const detail = readFileSync(
  new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
  "utf8"
);
const client = readFileSync(
  new URL("../../streampay-v2/instructions.ts", import.meta.url),
  "utf8"
);

function submittedTrial(overrides: { actionDeadline?: number; revisionCount?: number } = {}) {
  return makeWorkUnit({
    kind: "Trial",
    status: "Submitted",
    amount: 50n,
    actionDeadline: overrides.actionDeadline ?? 2_000,
    revisionCount: overrides.revisionCount ?? 0,
  });
}

function pendingTrialContract(mode: "Fixed" | "Milestone" | "Streaming" | "Hourly" = "Fixed") {
  return makeContract({
    status: "PendingEmployerApproval",
    paymentMode: mode,
    trialAmount: 50n,
    mainAmount: 950n,
    totalAmount: 1_000n,
    maxRevisions: 2,
    startTime: 0,
    endTime: 0,
  });
}

test("submitted trial shows approve/start, pay/end, and dispute as distinct employer decisions", () => {
  const contract = pendingTrialContract();
  const trial = submittedTrial();
  const actions = availableActions({
    wallet: WALLET_A,
    contract,
    trialUnit: trial,
    now: 1_000,
  });
  assert.ok(actions.includes("approveTrialAndActivate"));
  assert.ok(actions.includes("settleTrialAndEnd"));
  assert.ok(actions.includes("rejectActivation"));
  assert.equal(actionLabel("approveTrialAndActivate"), "Approve trial & start contract");
  assert.equal(actionLabel("settleTrialAndEnd"), "Pay trial & don't continue");
  assert.equal(
    actionLabel("rejectActivation", { workUnitStatus: "Submitted" }),
    "Dispute trial"
  );
  assert.notEqual(actionLabel("settleTrialAndEnd"), actionLabel("rejectActivation"));
  assert.notEqual(
    actionLabel("settleTrialAndEnd"),
    actionLabel("rejectActivation", { workUnitStatus: "Submitted" })
  );

  const decisions = trialEmployerDecisions({ actions });
  assert.deepEqual(
    decisions.map((d) => d.action),
    ["approveTrialAndActivate", "settleTrialAndEnd", "requestTrialRevision", "rejectActivation"]
  );
  assert.match(TRIAL_EXIT_COPY.approveBody, /main contract starts/i);
  assert.match(TRIAL_EXIT_COPY.payEndBody, /No dispute is opened/);
  assert.match(TRIAL_EXIT_COPY.disputeBody, /enters dispute/);
  assert.doesNotMatch(TRIAL_EXIT_COPY.payEndBody, /\bReject\b/);
  assert.doesNotMatch(TRIAL_EXIT_COPY.disputeBody, /\bReject\b/);
});

test("request revision appears only while the trial review window and revision cap allow it", () => {
  const contract = pendingTrialContract();
  const open = availableActions({
    wallet: WALLET_A,
    contract,
    trialUnit: submittedTrial({ actionDeadline: 2_000, revisionCount: 0 }),
    now: 1_000,
  });
  assert.ok(open.includes("requestTrialRevision"));
  assert.match(TRIAL_EXIT_COPY.revisionBody, /does not pay the trial/i);
  assert.match(TRIAL_EXIT_COPY.revisionBody, /does not end/i);

  const closed = availableActions({
    wallet: WALLET_A,
    contract,
    trialUnit: submittedTrial({ actionDeadline: 1_000, revisionCount: 0 }),
    now: 1_000,
  });
  assert.ok(!closed.includes("requestTrialRevision"));
  assert.ok(closed.includes("settleTrialAndEnd"));
  assert.ok(closed.includes("approveTrialAndActivate"));
  assert.ok(closed.includes("rejectActivation"));

  const capped = availableActions({
    wallet: WALLET_A,
    contract,
    trialUnit: submittedTrial({ actionDeadline: 2_000, revisionCount: 2 }),
    now: 1_000,
  });
  assert.ok(!capped.includes("requestTrialRevision"));
});

test("pay/end uses settleTrialAndEnd only, never activate or dispute instructions", () => {
  assert.equal(clientMethodForAction("settleTrialAndEnd"), "settleTrialAndEnd");
  assert.equal(clientMethodForAction("approveTrialAndActivate"), "approveTrialAndActivate");
  assert.equal(clientMethodForAction("rejectActivation"), "rejectActivation");
  assert.match(client, /async settleTrialAndEnd\(/);
  assert.match(client, /\.settleTrialAndEnd\(\)/);
  assert.match(detail, /case "settleTrialAndEnd":/);
  assert.match(detail, /client\.settleTrialAndEnd\(contract\.address\)/);
  assert.doesNotMatch(
    detail.split('case "settleTrialAndEnd":')[1].split("case ")[0],
    /approveTrialAndActivate|rejectActivation|recoverResolutionCase/
  );
  assert.equal(needsConfirmation("settleTrialAndEnd"), true);
  assert.equal(confirmTitle("settleTrialAndEnd"), "Pay trial & don't continue?");
});

test("dispute trial still uses rejectActivation and recovers a Resolution Case when Disputed", () => {
  assert.match(detail, /client\.rejectActivation\(contract\.address\)/);
  assert.equal(shouldRecoverAfterAction("rejectActivation", "Disputed"), true);
  assert.equal(shouldRecoverAfterAction("settleTrialAndEnd", "Cancelled"), false);
  assert.equal(shouldRecoverAfterAction("settleTrialAndEnd", "Disputed"), false);
  assert.equal(shouldAttemptCaseRecover("Cancelled", "employer"), false);
  assert.equal(shouldAttemptCaseRecover("Disputed", "employer"), true);
  assert.equal(
    noticeKindForAction("rejectActivation", { workUnitStatus: "Submitted" }),
    "activation_rejected_disputed"
  );
});

test("pay/end confirmation states trial entitlement, remainder, and no immediate transfer", () => {
  const streaming = settleTrialAndEndConfirmation({
    contract: pendingTrialContract("Streaming"),
    decimals: 0,
  });
  assert.equal(streaming.trialAmountLabel, "50");
  assert.equal(streaming.employerRefundableLabel, "950");
  assert.ok(streaming.points.some((line) => /Trial entitlement: 50/.test(line)));
  assert.ok(streaming.points.some((line) => /Employer refundable remainder: 950/.test(line)));
  assert.ok(streaming.points.includes(TRIAL_EXIT_COPY.mainWillNotStart));
  assert.ok(streaming.points.includes(TRIAL_EXIT_COPY.noDispute));
  assert.ok(streaming.points.includes(TRIAL_EXIT_COPY.noImmediateTransfer));
  assert.doesNotMatch(TRIAL_EXIT_COPY.noImmediateTransfer, /immediate wallet payment/i);
  assert.match(TRIAL_EXIT_COPY.streamingDoesNotStart, /does not start the payment stream/);
  assert.match(detail, /settleTrialAndEndConfirmation/);
  assert.match(detail, /TRIAL_EXIT_COPY\.streamingDoesNotStart/);

  const hourly = settleTrialAndEndConfirmation({
    contract: pendingTrialContract("Hourly"),
    decimals: 0,
  });
  assert.ok(hourly.points.includes(TRIAL_EXIT_COPY.hourlyDoesNotActivate));
  assert.match(TRIAL_EXIT_COPY.hourlyDoesNotActivate, /does not activate Hourly work sessions/);
  assert.match(detail, /TRIAL_EXIT_COPY\.hourlyDoesNotActivate/);

  const notice = NOTICE_CATALOG.trial_settled_and_ended;
  assert.equal(noticeKindForAction("settleTrialAndEnd"), "trial_settled_and_ended");
  assert.match(notice.body, /did not start/i);
  assert.match(notice.body, /No dispute was opened/);
  assert.match(notice.body, /Collect pay|Claim refund/);
  assert.doesNotMatch(notice.body, /transferred to your wallet|immediate payment/i);

  const freelancer = availableActions({
    wallet: WALLET_B,
    contract: pendingTrialContract(),
    trialUnit: submittedTrial(),
    now: 1_000,
  });
  assert.ok(!freelancer.includes("settleTrialAndEnd"));
});
