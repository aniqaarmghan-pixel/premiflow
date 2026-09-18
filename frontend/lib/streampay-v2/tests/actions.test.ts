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
