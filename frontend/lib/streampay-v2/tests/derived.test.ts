import assert from "node:assert/strict";
import test from "node:test";

import {
  contestedRemainder,
  equivalentHourlyRateDisplayOnly,
  estimateStreamAccrualDisplayOnly,
  estimatedStreamAccrualForContract,
  partitionContractsByRole,
  projectedContestedRemainder,
  projectedMaterializedReleasedAmount,
  remainingEmployerRefund,
  remainingFreelancerClaim,
  roleForContract,
  streamDurationSeconds,
  streamElapsedSeconds,
  streamRemainingSeconds,
  workUnitStatusLabel,
} from "../derived";
import { WALLET_A, WALLET_B, WALLET_C, makeContract } from "./fixtures";

test("role detection supports employer", () => {
  const contract = makeContract();
  assert.equal(roleForContract(WALLET_A, contract), "employer");
});

test("role detection supports freelancer", () => {
  const contract = makeContract();
  assert.equal(roleForContract(WALLET_B, contract), "freelancer");
});

test("same wallet can have different roles across contracts", () => {
  const asEmployer = makeContract({
    employer: WALLET_A,
    freelancer: WALLET_B,
  });
  const asFreelancer = makeContract({
    employer: WALLET_C,
    freelancer: WALLET_A,
    contractId: 2n,
  });
  assert.equal(roleForContract(WALLET_A, asEmployer), "employer");
  assert.equal(roleForContract(WALLET_A, asFreelancer), "freelancer");
  const sets = partitionContractsByRole(WALLET_A, [asEmployer, asFreelancer]);
  assert.equal(sets.asEmployer.length, 1);
  assert.equal(sets.asFreelancer.length, 1);
  assert.equal(sets.asEmployer[0], asEmployer);
  assert.equal(sets.asFreelancer[0], asFreelancer);
});

test("remaining claim calculation exact", () => {
  const active = makeContract({
    status: "Active",
    releasedAmount: 100n,
    withdrawnAmount: 40n,
  });
  assert.equal(remainingFreelancerClaim(active), 60n);
  const settled = makeContract({
    status: "Cancelled",
    releasedAmount: 80n,
    withdrawnAmount: 25n,
    freelancerSettlementAmount: 80n,
    employerRefundableAmount: 20n,
  });
  assert.equal(remainingFreelancerClaim(settled), 55n);
  const disputed = makeContract({
    status: "Disputed",
    releasedAmount: 50n,
    withdrawnAmount: 10n,
  });
  assert.equal(remainingFreelancerClaim(disputed), 0n);
});

test("remaining refund calculation exact", () => {
  const cancelled = makeContract({
    status: "Cancelled",
    employerRefundableAmount: 40n,
    refundedAmount: 15n,
  });
  assert.equal(remainingEmployerRefund(cancelled), 25n);
  const active = makeContract({
    status: "Active",
    employerRefundableAmount: 0n,
    refundedAmount: 0n,
  });
  assert.equal(remainingEmployerRefund(active), 0n);
  const completed = makeContract({
    status: "Completed",
    employerRefundableAmount: 0n,
    refundedAmount: 0n,
    freelancerSettlementAmount: 100n,
  });
  assert.equal(remainingEmployerRefund(completed), 0n);
});

test("contested remainder matches freeze-for-dispute accounting", () => {
  assert.equal(
    contestedRemainder(
      makeContract({ totalAmount: 10n, releasedAmount: 4n, refundedAmount: 0n })
    ),
    6n
  );
  assert.equal(
    contestedRemainder(
      makeContract({ totalAmount: 10n, releasedAmount: 10n, refundedAmount: 0n })
    ),
    0n
  );
  assert.equal(
    contestedRemainder(
      makeContract({ totalAmount: 10n, releasedAmount: 6n, refundedAmount: 4n })
    ),
    0n
  );
});

test("void work unit label is revision-ended, not paid", () => {
  assert.equal(workUnitStatusLabel("Void"), "Revision ended");
  assert.equal(workUnitStatusLabel("Released"), "Released");
});

test("display stream accrual matches the Rust floor formula", () => {
  assert.equal(estimateStreamAccrualDisplayOnly(10n, 0, 3, 0), 0n);
  assert.equal(estimateStreamAccrualDisplayOnly(10n, 0, 3, 1), 3n);
  assert.equal(estimateStreamAccrualDisplayOnly(10n, 0, 3, 2), 6n);
  assert.equal(estimateStreamAccrualDisplayOnly(10n, 0, 3, 3), 10n);
  assert.equal(estimateStreamAccrualDisplayOnly(10n, 0, 3, 100), 10n);
  assert.equal(estimateStreamAccrualDisplayOnly(7n, 0, 10, 5), 3n);
  const huge = 10_000_000_000_000_000n;
  assert.equal(
    estimateStreamAccrualDisplayOnly(huge, 0, 3, 1),
    (huge * 1n) / 3n
  );
});

function streamingContract(
  overrides: Parameters<typeof makeContract>[0] = {}
) {
  return makeContract({
    paymentMode: "Streaming",
    status: "Active",
    startTime: 1_000,
    endTime: 4_600,
    durationSeconds: 3_600,
    mainAmount: 100n,
    totalAmount: 100n,
    trialAmount: 0n,
    releasedAmount: 0n,
    streamReleasedAmount: 0n,
    withdrawnAmount: 0n,
    refundedAmount: 0n,
    ...overrides,
  });
}

test("stream clock is zero before start and exact at the end boundary", () => {
  const contract = streamingContract();
  assert.equal(streamDurationSeconds(contract), 3_600);
  assert.equal(streamElapsedSeconds(contract, 1_000), 0);
  assert.equal(streamRemainingSeconds(contract, 1_000), 3_600);
  assert.equal(estimatedStreamAccrualForContract(contract, 1_000), 0n);
  assert.equal(streamElapsedSeconds(contract, 999), 0);
  assert.equal(estimatedStreamAccrualForContract(contract, 999), 0n);
  assert.equal(streamElapsedSeconds(contract, 4_600), 3_600);
  assert.equal(streamRemainingSeconds(contract, 4_600), 0);
  assert.equal(estimatedStreamAccrualForContract(contract, 4_600), 100n);
  assert.equal(estimatedStreamAccrualForContract(contract, 9_999), 100n);
});

test("equivalent hourly rate is main_amount scaled to one hour", () => {
  assert.equal(equivalentHourlyRateDisplayOnly(100n, 3_600), 100n);
  assert.equal(equivalentHourlyRateDisplayOnly(100n, 7_200), 50n);
  assert.equal(equivalentHourlyRateDisplayOnly(7n, 10), (7n * 3600n) / 10n);
  assert.equal(equivalentHourlyRateDisplayOnly(100n, 0), 0n);
});

test("fully accrued unrecorded stream materializes the whole main amount", () => {
  const contract = streamingContract({
    startTime: 10,
    endTime: 20,
    durationSeconds: 10,
    mainAmount: 100n,
    totalAmount: 100n,
  });
  assert.equal(estimatedStreamAccrualForContract(contract, 20), 100n);
  assert.equal(projectedMaterializedReleasedAmount(contract, 20), 100n);
  assert.equal(projectedContestedRemainder(contract, 20), 0n);
  assert.equal(contestedRemainder(contract), 100n);
});

test("partially collected stream does not change contested remainder", () => {
  const contract = streamingContract({
    startTime: 10,
    endTime: 20,
    durationSeconds: 10,
    releasedAmount: 50n,
    streamReleasedAmount: 50n,
    withdrawnAmount: 20n,
    mainAmount: 100n,
    totalAmount: 100n,
  });
  assert.equal(remainingFreelancerClaim(contract), 30n);
  assert.equal(projectedContestedRemainder(contract, 15), 50n);
  assert.equal(projectedContestedRemainder(contract, 15), contestedRemainder(contract));
});

test("projected contested remainder is zero after full stream materialize plus trial", () => {
  const contract = streamingContract({
    trialAmount: 10n,
    mainAmount: 100n,
    totalAmount: 110n,
    releasedAmount: 10n,
    streamReleasedAmount: 0n,
    startTime: 10,
    endTime: 20,
    durationSeconds: 10,
  });
  assert.equal(projectedMaterializedReleasedAmount(contract, 20), 110n);
  assert.equal(projectedContestedRemainder(contract, 20), 0n);
  assert.equal(contestedRemainder(contract), 100n);
});

test("Fixed contested remainder ignores stream clocks", () => {
  const contract = makeContract({
    paymentMode: "Fixed",
    status: "Active",
    totalAmount: 10n,
    releasedAmount: 4n,
    startTime: 0,
    endTime: 10,
    mainAmount: 10n,
  });
  assert.equal(projectedContestedRemainder(contract, 10), 6n);
  assert.equal(projectedContestedRemainder(contract, 10), contestedRemainder(contract));
});
