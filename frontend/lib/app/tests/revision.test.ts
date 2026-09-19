import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { formatRevisionRemaining, isUnixDeadlinePassed } from "../datetime";
import { NOTICE_CATALOG, noticeKindForAction } from "../notices";
import {
  actionLabel,
  clientMethodForAction,
  confirmTitle,
  needsConfirmation,
  revisionDeadlinePresentation,
  revisionsUsedLabel,
  voidDeliverableCopy,
  voidStaleRevisionCopy,
} from "../view-model";
import { availableActions, workUnitStatusDetail, workUnitStatusLabel } from "../../streampay-v2";
import {
  DELIVERABLE_STATE_CHANGED_MESSAGE,
  parseClientError,
  withDeliverableRaceMessage,
} from "../../streampay-v2/errors";
import { StreamPayV2Client } from "../../streampay-v2/instructions";
import { WALLET_A, WALLET_B, makeContract, makeWorkUnit } from "../../streampay-v2/tests/fixtures";

test("revision remaining copy is minute-grained and marks expiry", () => {
  const deadline = 10_000;
  assert.equal(formatRevisionRemaining(deadline, 10_000 - 58 * 60), "58 minutes remaining");
  assert.equal(formatRevisionRemaining(deadline, 10_000 - 12 * 60), "12 minutes remaining");
  assert.equal(formatRevisionRemaining(deadline, 10_000 - 60), "1 minute remaining");
  assert.equal(formatRevisionRemaining(deadline, 10_000 - 30), "Less than 1 minute remaining");
  assert.equal(formatRevisionRemaining(deadline, 10_000), "Revision deadline passed");
  assert.equal(formatRevisionRemaining(deadline, 10_001), "Revision deadline passed");
  assert.equal(isUnixDeadlinePassed(deadline, 9_999), false);
  assert.equal(isUnixDeadlinePassed(deadline, 10_000), true);
});

test("freelancer before-deadline revision presentation uses on-chain actionDeadline", () => {
  const view = revisionDeadlinePresentation({
    actionDeadline: 1_700_000_000,
    now: 1_699_999_000,
    role: "freelancer",
  });
  assert.ok(view);
  assert.equal(view.heading, "Revision requested");
  assert.equal(view.deadlineLabel, "Resubmit by");
  assert.equal(view.expired, false);
  assert.match(view.detail, /Submit the revised official deliverable before the deadline/);
  assert.doesNotMatch(view.detail, /review_duration/);
});

test("freelancer after-deadline warning keeps resubmit possible", () => {
  const view = revisionDeadlinePresentation({
    actionDeadline: 2_000,
    now: 2_000,
    role: "freelancer",
  });
  assert.ok(view);
  assert.equal(view.heading, "Revision deadline passed");
  assert.equal(view.remainingText, "Revision deadline passed");
  assert.equal(view.expired, true);
  assert.match(view.detail, /employer can now end this revision/i);
  assert.match(view.detail, /still try to resubmit/i);
  assert.match(view.detail, /confirmed on-chain/i);

  const actions = availableActions({
    wallet: WALLET_B,
    contract: makeContract({ status: "Active", paymentMode: "Fixed" }),
    workUnit: makeWorkUnit({
      kind: "Fixed",
      status: "Revising",
      actionDeadline: 2_000,
      revisionCount: 1,
    }),
    now: 2_500,
  });
  assert.ok(actions.includes("submitWorkUnit"));
  assert.equal(
    actionLabel("submitWorkUnit", { workUnitStatus: "Revising" }),
    "Submit revised deliverable"
  );
});

test("employer before-deadline copy waits and does not offer void", () => {
  const view = revisionDeadlinePresentation({
    actionDeadline: 5_000,
    now: 4_000,
    role: "employer",
  });
  assert.ok(view);
  assert.equal(view.heading, "Waiting for revised deliverable");
  assert.equal(view.deadlineLabel, "Revision deadline");
  assert.equal(view.expired, false);
  assert.ok(
    !availableActions({
      wallet: WALLET_A,
      contract: makeContract({ status: "Active", paymentMode: "Fixed" }),
      workUnit: makeWorkUnit({
        kind: "Fixed",
        status: "Revising",
        actionDeadline: 5_000,
      }),
      now: 4_000,
    }).includes("voidStaleRevision")
  );
});

test("End expired revision maps only to voidStaleRevision", () => {
  assert.equal(actionLabel("voidStaleRevision"), "End expired revision");
  assert.equal(confirmTitle("voidStaleRevision"), "End expired revision?");
  assert.equal(clientMethodForAction("voidStaleRevision"), "voidStaleRevision");
  assert.equal(typeof StreamPayV2Client.prototype.voidStaleRevision, "function");
  assert.ok(needsConfirmation("voidStaleRevision"));
  assert.ok(!needsConfirmation("requestWorkRevision"));
});

test("void confirmation copy forbids token movement, refund, and release", () => {
  const copy = voidStaleRevisionCopy();
  assert.equal(copy.title, "End expired revision?");
  const body = copy.points.join(" ");
  assert.match(body, /deadline has passed/i);
  assert.match(body, /marks this deliverable as Void/i);
  assert.match(body, /does not approve or release payment/i);
  assert.match(body, /does not transfer or refund tokens/i);
  assert.match(body, /cannot be resubmitted/i);
  assert.match(body, /contract remains Active/i);
  assert.doesNotMatch(body, /automatic cancellation|automatically cancel/i);
  assert.doesNotMatch(body, /automatic refund|automatically refund/i);
  assert.doesNotMatch(body, /completed/i);
  assert.match(copy.wallet, /Phantom will ask for approval/i);
});

test("Void work units use revision-ended wording, not paid or rejected", () => {
  assert.equal(workUnitStatusLabel("Void"), "Revision ended");
  assert.notEqual(workUnitStatusLabel("Void"), "Approved");
  assert.notEqual(workUnitStatusLabel("Void"), "Paid");
  assert.notEqual(workUnitStatusLabel("Released"), "Revision ended");
  const detail = workUnitStatusDetail("Void");
  assert.ok(detail);
  assert.match(detail, /ended after the revision deadline/i);
  assert.match(detail, /No payment was released/i);
  assert.doesNotMatch(detail, /refund/i);
  assert.equal(workUnitStatusDetail("Released"), null);
});

test("Fixed Void copy points at cancel-to-settle without claiming refund already happened", () => {
  const copy = voidDeliverableCopy({
    contract: makeContract({
      status: "Active",
      paymentMode: "Fixed",
      openReviewCount: 0,
      voidedUnitCount: 1,
      releasedUnitCount: 0,
      workUnitCount: 1,
      allocatedAmount: 100n,
      mainAmount: 100n,
      releasedAmount: 0n,
    }),
    unit: makeWorkUnit({ kind: "Fixed", status: "Void" }),
  });
  assert.ok(copy);
  assert.equal(copy.heading, "Revision ended");
  assert.match(copy.body, /No payment was released for it/);
  assert.doesNotMatch(copy.body, /refund/i);
  assert.doesNotMatch(copy.body, /escrow already returned|automatically cancelled|rejected|complete/i);
  assert.equal(copy.contractNote, "The contract is still active.");
  assert.equal(
    copy.nextStep,
    "The employer can now cancel the contract to begin settlement."
  );
});

test("Milestone Void copy does not tell the employer to cancel the whole contract", () => {
  const copy = voidDeliverableCopy({
    contract: makeContract({
      status: "Active",
      paymentMode: "Milestone",
      openReviewCount: 0,
      voidedUnitCount: 1,
      releasedUnitCount: 0,
      workUnitCount: 2,
      allocatedAmount: 100n,
      mainAmount: 100n,
    }),
    unit: makeWorkUnit({ kind: "Milestone", status: "Void", index: 0 }),
  });
  assert.ok(copy);
  assert.equal(copy.heading, "Revision ended");
  assert.match(copy.body, /No payment was released for it/);
  assert.equal(copy.contractNote, "The contract is still active.");
  assert.equal(copy.nextStep, null);
  assert.doesNotMatch(
    [copy.body, copy.contractNote, copy.nextStep].join(" "),
    /cancel the contract/i
  );
});

test("revision-count presentation stays used / maximum", () => {
  assert.equal(revisionsUsedLabel(1, 2), "1 / 2");
  assert.equal(revisionsUsedLabel(2, 2), "2 / 2");
  assert.equal(revisionsUsedLabel(0, 5), "0 / 5");
});

test("notice catalog covers revision deadline states without wiring playback", () => {
  assert.equal(noticeKindForAction("requestWorkRevision"), "revision_requested");
  assert.equal(noticeKindForAction("voidStaleRevision"), "expired_revision_ended");
  assert.equal(NOTICE_CATALOG.revision_approaching_deadline.title, "Revision deadline approaching");
  assert.equal(NOTICE_CATALOG.revision_deadline_passed.title, "Revision deadline passed");
  assert.equal(NOTICE_CATALOG.revised_deliverable_submitted.title, "Revised deliverable submitted");
  assert.match(NOTICE_CATALOG.expired_revision_ended.body, /No payment was released, transferred, or refunded/);
});

test("race failures for late submit and void surface a state-changed message", () => {
  const voided = parseClientError({
    message: "AnchorError thrown. Error Code: UnitVoided. Error Number: 6129.",
  });
  const submitRace = withDeliverableRaceMessage("submitWorkUnit", voided);
  assert.equal(submitRace.uiMessage, DELIVERABLE_STATE_CHANGED_MESSAGE);

  const notReview = parseClientError({
    message: "AnchorError thrown. Error Code: UnitNotUnderReview. Error Number: 6127.",
  });
  const voidRace = withDeliverableRaceMessage("voidStaleRevision", notReview);
  assert.equal(voidRace.uiMessage, DELIVERABLE_STATE_CHANGED_MESSAGE);

  const notStale = parseClientError({
    message: "AnchorError thrown. Error Code: UnitNotStale. Error Number: 6130.",
  });
  const tooEarly = withDeliverableRaceMessage("voidStaleRevision", notStale);
  assert.equal(tooEarly.uiMessage, "This work unit is not stale and cannot be voided.");
});

test("rollback artifacts exist locally and are not tracked source changes", () => {
  const repo = resolve(process.cwd(), "..");
  assert.ok(existsSync(resolve(repo, "artifacts/streampay-c478e91.so")));
  assert.ok(existsSync(resolve(repo, "artifacts/streampay-eac721e-rollback.so")));
  const tracked = execFileSync("git", ["ls-files", "artifacts"], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
  assert.equal(tracked, "");
  const diff = execFileSync("git", ["diff", "--name-only", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  });
  assert.doesNotMatch(diff, /artifacts\//);
  const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
    cwd: repo,
    encoding: "utf8",
  });
  assert.doesNotMatch(staged, /artifacts\//);
});
