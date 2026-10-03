import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STREAMING_COLLECT_FINAL_LABEL,
  STREAMING_EMPLOYER_FINAL_AWAITING,
  STREAMING_EMPLOYER_FINAL_COLLECTED,
  STREAMING_ENDED_LABEL,
  estimateStreamAccrualDisplayMs,
  streamingEndedRoleCopy,
  streamingStatusLabel,
} from "../stream-display";
import { streamingDashboard } from "../view-model";
import { availableActions } from "../../streampay-v2/actions";
import {
  clampStreamNow,
  isStreamEnded,
  projectedFinalStreamClaim,
} from "../../streampay-v2";
import { makeContract, WALLET_A, WALLET_B } from "../../streampay-v2/tests/fixtures";

const START = 1_000;
const END = 2_000;
const stream = (over: Parameters<typeof makeContract>[0] = {}) =>
  makeContract({
    paymentMode: "Streaming",
    status: "Active",
    startTime: START,
    endTime: END,
    durationSeconds: 1_000,
    mainAmount: 1_000n,
    totalAmount: 1_000n,
    releasedAmount: 0n,
    streamReleasedAmount: 0n,
    withdrawnAmount: 0n,
    ...over,
  });
const employerActions = (c: ReturnType<typeof stream>, now: number) =>
  availableActions({ wallet: WALLET_A, contract: c, now });
const freelancerActions = (c: ReturnType<typeof stream>, now: number) =>
  availableActions({ wallet: WALLET_B, contract: c, now });
const label = (c: ReturnType<typeof stream>, now: number) => {
  const dash = streamingDashboard(c, now);
  return streamingStatusLabel({ live: dash.live, ended: dash.ended, status: c.status });
};

test("before end: accrues linearly, Accruing label, no final-pay copy", () => {
  const c = stream();
  const dash = streamingDashboard(c, 1_500);
  assert.equal(dash.displayEarned, 500n);
  assert.equal(dash.ended, false);
  assert.equal(dash.live, true);
  assert.equal(dash.finalClaimable, 0n);
  assert.equal(label(c, 1_500), "Accruing");
  assert.equal(estimateStreamAccrualDisplayMs(1_000n, START, END, 1_500_000), 500n);
  assert.equal(isStreamEnded(c, 1_500), false);
  const f = freelancerActions(c, 1_500);
  assert.ok(f.includes("releaseStreamAccrual"));
  assert.equal(f.includes("withdrawFreelancer"), false);
  const e = employerActions(c, 1_500);
  assert.equal(e.includes("approveWorkUnit"), false);
  assert.equal(e.includes("withdrawFreelancer"), false);
});

test("exact end: accrual stops at end_time, Streaming ended, freelancer can Collect final pay", () => {
  const c = stream();
  const dash = streamingDashboard(c, END);
  assert.equal(dash.displayEarned, 1_000n);
  assert.equal(dash.earnedSoFar, 1_000n);
  assert.equal(dash.ended, true);
  assert.equal(dash.live, false);
  assert.equal(dash.remainingSeconds, 0);
  assert.equal(dash.finalClaimable, 1_000n);
  assert.equal(label(c, END), STREAMING_ENDED_LABEL);
  const f = freelancerActions(c, END);
  assert.ok(f.includes("withdrawFreelancer"));
  assert.ok(f.includes("releaseStreamAccrual"), "kept so Collect prepends the release");
  assert.deepEqual(streamingEndedRoleCopy("freelancer", dash.finalClaimable)?.headline, STREAMING_COLLECT_FINAL_LABEL);
  const e = employerActions(c, END);
  assert.equal(e.includes("releaseStreamAccrual"), false);
  assert.equal(e.includes("approveWorkUnit"), false);
  assert.equal(e.includes("withdrawFreelancer"), false);
  assert.equal(streamingEndedRoleCopy("employer", dash.finalClaimable)?.headline, STREAMING_EMPLOYER_FINAL_AWAITING);
});

test("after end: earned never increases past end_time", () => {
  const c = stream();
  const atEnd = streamingDashboard(c, END);
  for (const now of [END + 1, END + 3_600, END * 10]) {
    const dash = streamingDashboard(c, now);
    assert.equal(dash.displayEarned, atEnd.displayEarned);
    assert.equal(dash.elapsedSeconds, 1_000);
    assert.equal(dash.remainingSeconds, 0);
    assert.equal(dash.finalClaimable, 1_000n);
    assert.equal(label(c, now), STREAMING_ENDED_LABEL);
    assert.equal(clampStreamNow(c, now), END);
    assert.equal(employerActions(c, now).includes("releaseStreamAccrual"), false);
    assert.ok(freelancerActions(c, now).includes("withdrawFreelancer"));
  }
  assert.equal(estimateStreamAccrualDisplayMs(1_000n, START, END, 99_000_000), 1_000n);
  assert.equal(clampStreamNow(c, 1_500), 1_500);
});

test("after end: final claim uses canonical materialized amount minus withdrawn", () => {
  const partial = stream({ releasedAmount: 400n, streamReleasedAmount: 400n, withdrawnAmount: 400n });
  assert.equal(projectedFinalStreamClaim(partial, END + 50), 600n);
  assert.equal(streamingDashboard(partial, END + 50).finalClaimable, 600n);
  const withTrial = stream({
    totalAmount: 1_100n,
    trialAmount: 100n,
    releasedAmount: 100n,
    streamReleasedAmount: 0n,
  });
  assert.equal(streamingDashboard(withTrial, END + 5).displayEarned, 1_100n);
  assert.equal(projectedFinalStreamClaim(withTrial, END + 5), 1_100n);
});

test("after end, fully collected: no Collect, employer sees collected copy", () => {
  const done = stream({ releasedAmount: 1_000n, streamReleasedAmount: 1_000n, withdrawnAmount: 1_000n });
  assert.equal(freelancerActions(done, END + 10).includes("withdrawFreelancer"), false);
  assert.equal(streamingDashboard(done, END + 10).finalClaimable, 0n);
  assert.equal(streamingEndedRoleCopy("employer", 0n)?.headline, STREAMING_EMPLOYER_FINAL_COLLECTED);
  assert.equal(employerActions(done, END + 10).includes("approveWorkUnit"), false);
});

test("UI wiring: ended label, Collect final pay, release hidden once ended, collect prepends release", () => {
  const show = readFileSync("components/contracts/StreamShowcase.tsx", "utf8");
  assert.match(show, /streamingStatusLabel\(\{ live, ended: dash\.ended, status: contract\.status \}\)/);
  assert.match(show, /dash\.ended\s*\?\s*STREAMING_COLLECT_FINAL_LABEL/);
  assert.match(show, /showRelease = Boolean\(canRelease && onRelease && !dash\.ended\)/);
  assert.match(show, /streamingEndedRoleCopy\(role, dash\.finalClaimable\)/);
  assert.doesNotMatch(show, /\{live \? "Accruing" : contract\.status\}/);
  const detail = readFileSync("components/contracts/ContractDetail.tsx", "utf8");
  assert.match(detail, /isStreamEnded\(contract, now\)\s*\?\s*STREAMING_ENDED_LABEL/);
  assert.match(detail, /releaseAccrualFirst:\s*\n\s*contract\.paymentMode === "Streaming" &&\s*\n\s*contract\.status === "Active" &&\s*\n\s*actions\.includes\("releaseStreamAccrual"\)/);
  const ix = readFileSync("lib/streampay-v2/instructions.ts", "utf8");
  assert.match(ix, /params\.releaseAccrualFirst\s*\n\s*\? withdraw\.preInstructions\(/);
});
