import assert from "node:assert/strict";
import test from "node:test";

import {
  contestedRemainder,
  estimateStreamAccrualDisplayOnly,
  partitionContractsByRole,
  remainingEmployerRefund,
  remainingFreelancerClaim,
  roleForContract,
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
