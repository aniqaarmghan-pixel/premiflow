import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STREAMING_COLLECT_HINT,
  STREAMING_DASHBOARD_LABELS,
  STREAMING_PAY_EXPLAINER,
  STREAMING_RELEASE_HINT,
  STREAMING_RELEASE_LABEL,
  STREAMING_TRIAL_STARTED_BODY,
  STREAMING_TRIAL_STARTED_HEADLINE,
  STREAMING_ZERO_AVAILABLE_HINT,
  streamingTrialStartedCopy,
} from "../stream-display";
import {
  actionLabel,
  contractActionVariant,
  streamingDashboard,
  typeBlurb,
} from "../view-model";
import { availableActions } from "../../streampay-v2/actions";
import { makeContract, WALLET_A, WALLET_B } from "../../streampay-v2/tests/fixtures";

test("Streaming action labels use collect / release / finish wording", () => {
  assert.equal(actionLabel("releaseStreamAccrual"), "Release accrued pay");
  assert.equal(actionLabel("withdrawFreelancer"), "Collect pay");
  assert.equal(actionLabel("completeContract"), "Mark contract finished");
  assert.equal(contractActionVariant("completeContract"), "secondary");
  assert.equal(contractActionVariant("withdrawFreelancer"), "primary");
  assert.equal(contractActionVariant("openDispute"), "danger");
  assert.equal(actionLabel("submitWorkUnit"), "Submit official deliverable");
});

test("Streaming explainer and type blurb distinguish accrue, release, and collect", () => {
  assert.match(STREAMING_PAY_EXPLAINER, /accrues automatically with time/i);
  assert.match(STREAMING_PAY_EXPLAINER, /Release accrued pay records/i);
  assert.match(STREAMING_PAY_EXPLAINER, /does not transfer tokens/i);
  assert.match(STREAMING_PAY_EXPLAINER, /does not end the stream/i);
  assert.match(typeBlurb("Streaming"), /while the stream is active/i);
  assert.match(typeBlurb("Streaming"), /does not measure actual hours worked/i);
  assert.match(typeBlurb("Fixed"), /one total price/i);
  assert.match(typeBlurb("Milestone"), /stage by stage/i);
});

test("trial-start explanation appears only after Streaming trial activation", () => {
  const active = makeContract({
    paymentMode: "Streaming",
    status: "Active",
    trialAmount: 10n,
    startTime: 1_700_000_000,
  });
  const copy = streamingTrialStartedCopy(active);
  assert.deepEqual(copy, {
    headline: STREAMING_TRIAL_STARTED_HEADLINE,
    body: STREAMING_TRIAL_STARTED_BODY,
  });
  assert.equal(copy?.headline, "Trial approved — main contract started.");
  assert.match(
    copy?.body ?? "",
    /trial amount was recorded for the freelancer and the streaming clock has started/i
  );
  assert.match(copy?.body ?? "", /remain in escrow until collected/i);

  assert.equal(
    streamingTrialStartedCopy(
      makeContract({
        paymentMode: "Streaming",
        status: "PendingEmployerApproval",
        trialAmount: 10n,
        startTime: 0,
      })
    ),
    null
  );
  assert.equal(
    streamingTrialStartedCopy(
      makeContract({
        paymentMode: "Streaming",
        status: "Active",
        trialAmount: 0n,
        startTime: 1_700_000_000,
      })
    ),
    null
  );
  assert.equal(
    streamingTrialStartedCopy(
      makeContract({
        paymentMode: "Fixed",
        status: "Active",
        trialAmount: 10n,
        startTime: 1_700_000_000,
      })
    ),
    null
  );
});

test("streaming dashboard reports funded amount, clock, hourly rate, and balances", () => {
  const start = 1_000;
  const end = 4_600;
  const now = 2_800;
  const contract = makeContract({
    paymentMode: "Streaming",
    status: "Active",
    startTime: start,
    endTime: end,
    durationSeconds: 3_600,
    mainAmount: 360n,
    totalAmount: 370n,
    trialAmount: 10n,
    releasedAmount: 100n,
    streamReleasedAmount: 90n,
    withdrawnAmount: 40n,
    refundedAmount: 0n,
  });
  const dash = streamingDashboard(contract, now);
  assert.equal(dash.totalFundedStream, 360n);
  assert.equal(dash.durationSeconds, 3_600);
  assert.equal(dash.startTime, start);
  assert.equal(dash.endTime, end);
  assert.equal(dash.elapsedSeconds, 1_800);
  assert.equal(dash.remainingSeconds, 1_800);
  assert.equal(dash.equivalentHourlyRate, 360n);
  assert.equal(dash.earnedSoFar, 180n);
  assert.equal(dash.alreadyRecorded, 100n);
  assert.equal(dash.alreadyCollected, 40n);
  assert.equal(dash.availableToCollect, 60n);
  assert.equal(dash.remainingEscrow, 330n);
  assert.equal(STREAMING_DASHBOARD_LABELS.earnedSoFar, "Earned so far (accrued)");
  assert.equal(STREAMING_DASHBOARD_LABELS.alreadyRecorded, "Released / recorded");
  assert.equal(STREAMING_DASHBOARD_LABELS.availableToCollect, "Available to collect");
  assert.equal(STREAMING_DASHBOARD_LABELS.alreadyCollected, "Collected");
});

test("streaming dashboard start and end boundaries and fully accrued remainder", () => {
  const contract = makeContract({
    paymentMode: "Streaming",
    status: "Active",
    startTime: 10,
    endTime: 20,
    durationSeconds: 10,
    mainAmount: 100n,
    totalAmount: 100n,
    releasedAmount: 0n,
    withdrawnAmount: 0n,
  });
  const before = streamingDashboard(contract, 10);
  assert.equal(before.earnedSoFar, 0n);
  assert.equal(before.elapsedSeconds, 0);
  assert.equal(before.remainingSeconds, 10);
  const after = streamingDashboard(contract, 20);
  assert.equal(after.earnedSoFar, 100n);
  assert.equal(after.elapsedSeconds, 10);
  assert.equal(after.remainingSeconds, 0);
  assert.equal(after.availableToCollect, 0n);
  assert.equal(after.remainingEscrow, 100n);
});

test("partially collected stream keeps available-to-collect as recorded minus withdrawn", () => {
  const contract = makeContract({
    paymentMode: "Streaming",
    status: "Active",
    startTime: 10,
    endTime: 20,
    durationSeconds: 10,
    mainAmount: 100n,
    totalAmount: 100n,
    releasedAmount: 50n,
    streamReleasedAmount: 50n,
    withdrawnAmount: 20n,
  });
  const dash = streamingDashboard(contract, 15);
  assert.equal(dash.earnedSoFar, 50n);
  assert.equal(dash.alreadyRecorded, 50n);
  assert.equal(dash.alreadyCollected, 20n);
  assert.equal(dash.availableToCollect, 30n);
  assert.equal(dash.remainingEscrow, 80n);
});

test("Streaming salary workspace distinguishes Release and Collect and keeps Active UX", () => {
  const source = readFileSync(
    new URL("../../../components/contracts/StreamShowcase.tsx", import.meta.url),
    "utf8"
  );
  const detail = readFileSync(
    new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /STREAMING_DASHBOARD_LABELS\.totalFundedStream/);
  assert.match(source, /startTime/);
  assert.match(source, /endTime/);
  assert.match(source, /earnedSoFar/);
  assert.match(source, /alreadyRecorded/);
  assert.match(source, /alreadyCollected/);
  assert.match(source, /availableToCollect/);
  assert.match(source, /remainingEscrow/);
  assert.match(source, /STREAMING_RELEASE_LABEL/);
  assert.match(source, /canCollect && onCollect/);
  assert.match(source, /STREAMING_RELEASE_HINT/);
  assert.match(STREAMING_RELEASE_HINT, /does not transfer tokens/i);
  assert.match(source, /STREAMING_COLLECT_HINT/);
  assert.match(source, /STREAMING_ZERO_AVAILABLE_HINT/);
  assert.match(source, /display estimate/);
  assert.doesNotMatch(source, /status\s*=\s*"Completed"/);
  assert.equal(STREAMING_RELEASE_LABEL, "Release accrued pay");
  assert.match(STREAMING_RELEASE_HINT, /does not transfer tokens/i);
  assert.match(STREAMING_COLLECT_HINT, /does not end the stream/i);
  assert.match(STREAMING_ZERO_AVAILABLE_HINT, /does not mean the stream is complete/i);
  assert.match(detail, /canCollect=\{actions\.includes\("withdrawFreelancer"\)\}/);
  assert.match(detail, /onCollect=\{\(\) => requestAction\("withdrawFreelancer"\)\}/);
  assert.match(detail, /onRelease=\{\(\) => requestAction\("releaseStreamAccrual"\)\}/);

  const mid = makeContract({
    paymentMode: "Streaming",
    status: "Active",
    startTime: 1_000,
    endTime: 4_600,
    durationSeconds: 3_600,
    mainAmount: 360n,
    totalAmount: 360n,
    releasedAmount: 90n,
    streamReleasedAmount: 90n,
    withdrawnAmount: 30n,
  });
  const freelancer = availableActions({
    wallet: WALLET_B,
    contract: mid,
    now: 2_800,
  });
  assert.ok(freelancer.includes("releaseStreamAccrual"));
  assert.ok(freelancer.includes("withdrawFreelancer"));
  const employer = availableActions({
    wallet: WALLET_A,
    contract: mid,
    now: 2_800,
  });
  assert.ok(employer.includes("releaseStreamAccrual"));
  assert.equal(employer.includes("withdrawFreelancer"), false);

  const afterCollectZero = streamingDashboard(
    makeContract({
      paymentMode: "Streaming",
      status: "Active",
      startTime: 1_000,
      endTime: 4_600,
      durationSeconds: 3_600,
      mainAmount: 360n,
      totalAmount: 360n,
      releasedAmount: 90n,
      streamReleasedAmount: 90n,
      withdrawnAmount: 90n,
    }),
    2_800
  );
  assert.equal(afterCollectZero.availableToCollect, 0n);
  assert.equal(mid.status, "Active");
  assert.match(source, /stillActive && dash\.availableToCollect === 0n/);
});
