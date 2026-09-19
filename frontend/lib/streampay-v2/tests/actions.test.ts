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

function postVoidFixedContract() {
  return makeContract({
    status: "Active",
    paymentMode: "Fixed",
    openReviewCount: 0,
    voidedUnitCount: 1,
    releasedUnitCount: 0,
    workUnitCount: 1,
    allocatedAmount: 100n,
    mainAmount: 100n,
    totalAmount: 100n,
    releasedAmount: 0n,
    withdrawnAmount: 0n,
    refundedAmount: 0n,
  });
}

function postVoidFixedUnit() {
  return makeWorkUnit({
    kind: "Fixed",
    status: "Void",
    actionDeadline: 1_000,
    revisionCount: 1,
  });
}

test("post-Void Fixed unit hides stale-revision and resubmit actions", () => {
  const contract = postVoidFixedContract();
  const unit = postVoidFixedUnit();
  const employer = availableActions({
    wallet: WALLET_A,
    contract,
    workUnit: unit,
    now: 2_000,
  });
  const freelancer = availableActions({
    wallet: WALLET_B,
    contract,
    workUnit: unit,
    now: 2_000,
  });
  assert.ok(!employer.includes("voidStaleRevision"));
  assert.ok(!freelancer.includes("voidStaleRevision"));
  assert.ok(!freelancer.includes("submitWorkUnit"));
  assert.ok(!employer.includes("submitWorkUnit"));
});

test("post-Void Fixed gating matches Rust cancel, complete, dispute, and withdraw rules", () => {
  const contract = postVoidFixedContract();
  const unit = postVoidFixedUnit();
  const employer = availableActions({
    wallet: WALLET_A,
    contract,
    workUnit: unit,
    now: 2_000,
  });
  const freelancer = availableActions({
    wallet: WALLET_B,
    contract,
    workUnit: unit,
    now: 2_000,
  });
  assert.ok(employer.includes("cancelActiveContract"));
  assert.ok(!freelancer.includes("cancelActiveContract"));
  assert.ok(!employer.includes("completeContract"));
  assert.ok(!freelancer.includes("completeContract"));
  assert.ok(employer.includes("openDispute"));
  assert.ok(freelancer.includes("openDispute"));
  assert.ok(!freelancer.includes("withdrawFreelancer"));
  assert.ok(!employer.includes("claimEmployerRefund"));
});

function revisingUnit(overrides: Parameters<typeof makeWorkUnit>[0] = {}) {
  return makeWorkUnit({
    kind: "Fixed",
    status: "Revising",
    actionDeadline: 2_000,
    revisionCount: 1,
    ...overrides,
  });
}

test("employer does not see End expired revision before the revision deadline", () => {
  const active = makeContract({ status: "Active", paymentMode: "Fixed" });
  const actions = availableActions({
    wallet: WALLET_A,
    contract: active,
    workUnit: revisingUnit(),
    now: 1_999,
  });
  assert.ok(!actions.includes("voidStaleRevision"));
});

test("employer sees End expired revision at the revision deadline", () => {
  const active = makeContract({ status: "Active", paymentMode: "Fixed" });
  const actions = availableActions({
    wallet: WALLET_A,
    contract: active,
    workUnit: revisingUnit(),
    now: 2_000,
  });
  assert.ok(actions.includes("voidStaleRevision"));
});

test("employer sees End expired revision after the revision deadline", () => {
  const active = makeContract({ status: "Active", paymentMode: "Milestone" });
  const actions = availableActions({
    wallet: WALLET_A,
    contract: active,
    workUnit: revisingUnit({ kind: "Milestone" }),
    now: 2_001,
  });
  assert.ok(actions.includes("voidStaleRevision"));
});

test("freelancer never sees End expired revision", () => {
  const active = makeContract({ status: "Active", paymentMode: "Fixed" });
  const before = availableActions({
    wallet: WALLET_B,
    contract: active,
    workUnit: revisingUnit(),
    now: 1_999,
  });
  const after = availableActions({
    wallet: WALLET_B,
    contract: active,
    workUnit: revisingUnit(),
    now: 2_001,
  });
  assert.ok(!before.includes("voidStaleRevision"));
  assert.ok(!after.includes("voidStaleRevision"));
  assert.ok(before.includes("submitWorkUnit"));
  assert.ok(after.includes("submitWorkUnit"));
});

test("Submitted, Void, and Released units do not offer End expired revision", () => {
  const active = makeContract({ status: "Active", paymentMode: "Fixed" });
  for (const status of ["Submitted", "Void", "Released"] as const) {
    const actions = availableActions({
      wallet: WALLET_A,
      contract: active,
      workUnit: makeWorkUnit({
        kind: "Fixed",
        status,
        actionDeadline: 1_000,
      }),
      now: 2_000,
    });
    assert.ok(!actions.includes("voidStaleRevision"), status);
  }
});

test("Trial and Streaming checkpoint units do not offer End expired revision", () => {
  const fixed = makeContract({ status: "Active", paymentMode: "Fixed" });
  const trial = availableActions({
    wallet: WALLET_A,
    contract: fixed,
    workUnit: revisingUnit({ kind: "Trial" }),
    now: 2_001,
  });
  assert.ok(!trial.includes("voidStaleRevision"));

  const streaming = makeContract({ status: "Active", paymentMode: "Streaming" });
  const checkpoint = availableActions({
    wallet: WALLET_A,
    contract: streaming,
    workUnit: revisingUnit({ kind: "Checkpoint" }),
    now: 2_001,
  });
  assert.ok(!checkpoint.includes("voidStaleRevision"));
});

test("terminal contracts do not offer End expired revision", () => {
  const unit = revisingUnit();
  for (const status of ["Completed", "Cancelled", "Disputed", "Resolved"] as const) {
    const contract = makeContract({
      status,
      paymentMode: "Fixed",
      freelancerSettlementAmount: 10n,
      employerRefundableAmount: 0n,
    });
    const actions = availableActions({
      wallet: WALLET_A,
      contract,
      workUnit: unit,
      now: 2_001,
    });
    assert.ok(!actions.includes("voidStaleRevision"), status);
  }
});

test("voiding one Milestone does not hide remaining Defined unit submission", () => {
  const contract = makeContract({
    status: "Active",
    paymentMode: "Milestone",
    openReviewCount: 0,
    voidedUnitCount: 1,
    releasedUnitCount: 0,
    workUnitCount: 2,
    allocatedAmount: 100n,
    mainAmount: 100n,
  });
  const voided = makeWorkUnit({
    kind: "Milestone",
    status: "Void",
    index: 0,
  });
  const remaining = makeWorkUnit({
    kind: "Milestone",
    status: "Defined",
    index: 1,
  });
  const employerVoided = availableActions({
    wallet: WALLET_A,
    contract,
    workUnit: voided,
    now: 2_000,
  });
  const freelancerRemaining = availableActions({
    wallet: WALLET_B,
    contract,
    workUnit: remaining,
    now: 2_000,
  });
  assert.ok(!employerVoided.includes("voidStaleRevision"));
  assert.ok(employerVoided.includes("cancelActiveContract"));
  assert.ok(!employerVoided.includes("completeContract"));
  assert.ok(freelancerRemaining.includes("submitWorkUnit"));
  assert.ok(!freelancerRemaining.includes("voidStaleRevision"));
});
