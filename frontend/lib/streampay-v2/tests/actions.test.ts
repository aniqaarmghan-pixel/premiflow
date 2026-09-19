import assert from "node:assert/strict";
import test from "node:test";

import { availableActions, hasLifecycleMutation } from "../actions";
import {
  decodeContractStatus,
  decodePaymentMode,
  decodeStartMode,
  decodeWorkUnitStatus,
  encodePaymentMode,
  encodeStartMode,
} from "../types";
import {
  RESOLVER,
  WALLET_A,
  WALLET_B,
  WALLET_C,
  makeContract,
  makeWorkUnit,
} from "./fixtures";

test("Anchor enum conversion", () => {
  assert.equal(decodePaymentMode({ streaming: {} }), "Streaming");
  assert.equal(decodePaymentMode({ milestone: {} }), "Milestone");
  assert.equal(decodePaymentMode({ fixed: {} }), "Fixed");
  assert.equal(decodeContractStatus({ pendingAcceptance: {} }), "PendingAcceptance");
  assert.equal(
    decodeContractStatus({ pendingEmployerApproval: {} }),
    "PendingEmployerApproval"
  );
  assert.equal(decodeStartMode({ onActivation: {} }), "OnActivation");
  assert.equal(decodeWorkUnitStatus({ submitted: {} }), "Submitted");
  assert.deepEqual(encodePaymentMode("Streaming"), { streaming: {} });
  assert.deepEqual(encodeStartMode("OnActivation"), { onActivation: {} });
});

test("action availability for representative states", () => {
  const pending = makeContract({ status: "PendingAcceptance" });
  const freelancerActions = availableActions({
    wallet: WALLET_B,
    contract: pending,
    now: 1_000,
  });
  assert.ok(freelancerActions.includes("acceptContract"));
  assert.ok(freelancerActions.includes("declineContract"));
  assert.ok(
    !availableActions({ wallet: WALLET_A, contract: pending, now: 1_000 }).includes(
      "acceptContract"
    )
  );

  const submitted = makeWorkUnit({ status: "Submitted", actionDeadline: 2_000 });
  const active = makeContract({ status: "Active", paymentMode: "Fixed" });
  const employerReview = availableActions({
    wallet: WALLET_A,
    contract: active,
    workUnit: submitted,
    now: 1_000,
  });
  assert.ok(employerReview.includes("approveWorkUnit"));
  assert.ok(employerReview.includes("requestWorkRevision"));

  const defined = makeWorkUnit({ kind: "Fixed", status: "Defined" });
  const freelancerSubmit = availableActions({
    wallet: WALLET_B,
    contract: active,
    workUnit: defined,
    now: 1_700_000_100,
  });
  assert.ok(freelancerSubmit.includes("submitWorkUnit"));
  assert.ok(!freelancerSubmit.includes("approveWorkUnit"));
});

test("request revision follows the review window and revision cap", () => {
  const active = makeContract({
    status: "Active",
    paymentMode: "Fixed",
    maxRevisions: 2,
  });
  const submitted = makeWorkUnit({
    kind: "Fixed",
    status: "Submitted",
    actionDeadline: 2_000,
    revisionCount: 0,
  });
  const before = availableActions({
    wallet: WALLET_A,
    contract: active,
    workUnit: submitted,
    now: 1_999,
  });
  assert.ok(before.includes("requestWorkRevision"));
  assert.ok(before.includes("approveWorkUnit"));
  assert.ok(!before.includes("finalizeReviewTimeout"));

  const atDeadline = availableActions({
    wallet: WALLET_A,
    contract: active,
    workUnit: submitted,
    now: 2_000,
  });
  assert.ok(!atDeadline.includes("requestWorkRevision"));
  assert.ok(atDeadline.includes("approveWorkUnit"));
  assert.ok(atDeadline.includes("finalizeReviewTimeout"));

  const afterDeadline = availableActions({
    wallet: WALLET_A,
    contract: active,
    workUnit: submitted,
    now: 2_001,
  });
  assert.ok(!afterDeadline.includes("requestWorkRevision"));
  assert.ok(afterDeadline.includes("approveWorkUnit"));
  assert.ok(afterDeadline.includes("finalizeReviewTimeout"));

  const capped = availableActions({
    wallet: WALLET_A,
    contract: active,
    workUnit: { ...submitted, revisionCount: 2 },
    now: 1_000,
  });
  assert.ok(!capped.includes("requestWorkRevision"));
  assert.ok(capped.includes("approveWorkUnit"));
});

test("open dispute requires a positive contested remainder", () => {
  const contested = makeContract({
    status: "Active",
    paymentMode: "Fixed",
    totalAmount: 10n,
    releasedAmount: 4n,
    refundedAmount: 0n,
  });
  assert.ok(
    availableActions({ wallet: WALLET_A, contract: contested, now: 1_000 }).includes(
      "openDispute"
    )
  );
  assert.ok(
    availableActions({ wallet: WALLET_B, contract: contested, now: 1_000 }).includes(
      "openDispute"
    )
  );
  assert.ok(
    !availableActions({ wallet: WALLET_C, contract: contested, now: 1_000 }).includes(
      "openDispute"
    )
  );

  const fullyReleased = makeContract({
    status: "Active",
    paymentMode: "Fixed",
    totalAmount: 10n,
    releasedAmount: 10n,
    refundedAmount: 0n,
    openReviewCount: 0,
    releasedUnitCount: 1,
    workUnitCount: 1,
    allocatedAmount: 10n,
    mainAmount: 10n,
  });
  const employerFull = availableActions({
    wallet: WALLET_A,
    contract: fullyReleased,
    now: 1_000,
  });
  const freelancerFull = availableActions({
    wallet: WALLET_B,
    contract: fullyReleased,
    now: 1_000,
  });
  assert.ok(!employerFull.includes("openDispute"));
  assert.ok(!freelancerFull.includes("openDispute"));
  assert.ok(employerFull.includes("completeContract"));
  assert.ok(freelancerFull.includes("completeContract"));

  const completed = makeContract({
    status: "Completed",
    totalAmount: 10n,
    releasedAmount: 10n,
    withdrawnAmount: 10n,
    refundedAmount: 0n,
    freelancerSettlementAmount: 10n,
    employerRefundableAmount: 0n,
  });
  assert.deepEqual(
    availableActions({ wallet: WALLET_A, contract: completed, now: 1_000 }),
    []
  );
  assert.deepEqual(
    availableActions({ wallet: WALLET_B, contract: completed, now: 1_000 }),
    []
  );
});

test("terminal states expose no mutation actions except legitimate claims", () => {
  const cancelled = makeContract({
    status: "Cancelled",
    releasedAmount: 60n,
    withdrawnAmount: 10n,
    freelancerSettlementAmount: 60n,
    employerRefundableAmount: 40n,
    refundedAmount: 0n,
  });
  const freelancer = availableActions({
    wallet: WALLET_B,
    contract: cancelled,
    now: 1_000,
  });
  const employer = availableActions({
    wallet: WALLET_A,
    contract: cancelled,
    now: 1_000,
  });
  assert.deepEqual(freelancer, ["withdrawFreelancer"]);
  assert.deepEqual(employer, ["claimEmployerRefund"]);
  assert.equal(hasLifecycleMutation(freelancer), false);
  assert.equal(hasLifecycleMutation(employer), false);

  const declined = makeContract({ status: "Declined" });
  assert.deepEqual(
    availableActions({ wallet: WALLET_A, contract: declined, now: 1_000 }),
    []
  );
  assert.deepEqual(
    availableActions({ wallet: WALLET_B, contract: declined, now: 1_000 }),
    []
  );
});

test("disputed state does not expose ordinary lifecycle actions", () => {
  const disputed = makeContract({
    status: "Disputed",
    releasedAmount: 20n,
    withdrawnAmount: 0n,
  });
  const employer = availableActions({
    wallet: WALLET_A,
    contract: disputed,
    now: 1_000,
  });
  const freelancer = availableActions({
    wallet: WALLET_B,
    contract: disputed,
    now: 1_000,
  });
  const resolver = availableActions({
    wallet: RESOLVER,
    contract: disputed,
    now: 1_000,
  });
  const stranger = availableActions({
    wallet: WALLET_C,
    contract: disputed,
    now: 1_000,
  });
  assert.deepEqual(employer, []);
  assert.deepEqual(freelancer, []);
  assert.deepEqual(resolver, ["resolveDispute"]);
  assert.deepEqual(stranger, []);
});
