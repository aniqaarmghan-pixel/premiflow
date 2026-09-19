import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";

import {
  dashboardSummary,
  filterContracts,
  financialProgress,
  groupContractsByRole,
  lifecycleStages,
  presentStatus,
  presentType,
  roleLabel,
  terminalMutationActions,
} from "../view-model";
import { isTxBusy, txPhaseLabel, txReducer, initialTxState } from "../tx-state";
import {
  employerRemainder,
  milestonesFullyAllocated,
  validateCreateDraft,
  validateDisputeAward,
  validateMilestoneAllocation,
  validateParties,
  type CreateWizardDraft,
} from "../validation";
import {
  PREMIFLOW_RESOLVER,
  PREMIFLOW_TEST_TOKEN,
} from "../premiflow";
import {
  RESOLVER,
  WALLET_A,
  WALLET_B,
  WALLET_C,
  makeContract,
} from "../../streampay-v2/tests/fixtures";
import { estimateStreamAccrualDisplayMs } from "../stream-display";

const MINT = PREMIFLOW_TEST_TOKEN.mint.toBase58();

test("dashboard role grouping supports hiring and working at once", () => {
  const hiring = makeContract({
    employer: WALLET_A,
    freelancer: WALLET_B,
    address: WALLET_B,
  });
  const working = makeContract({
    employer: WALLET_C,
    freelancer: WALLET_A,
    address: WALLET_C,
    contractId: 2n,
  });
  const grouped = groupContractsByRole(WALLET_A, [hiring, working]);
  assert.equal(grouped.hiring.length, 1);
  assert.equal(grouped.working.length, 1);
  assert.equal(grouped.all.length, 2);
  assert.equal(roleLabel("employer"), "Hiring");
  assert.equal(roleLabel("freelancer"), "Working");
});

test("contract filtering by role and status", () => {
  const active = makeContract({ status: "Active", address: WALLET_B });
  const draft = makeContract({
    status: "Draft",
    paymentMode: "Milestone",
    address: WALLET_C,
    contractId: 2n,
  });
  const grouped = groupContractsByRole(WALLET_A, [active, draft]);
  assert.equal(filterContracts(grouped, "hiring", "all").length, 2);
  assert.equal(filterContracts(grouped, "hiring", "Active").length, 1);
  assert.equal(filterContracts(grouped, "working", "all").length, 0);
});

test("status and type presentation", () => {
  assert.equal(presentStatus("PendingEmployerApproval"), "Pending employer activation");
  assert.equal(presentType("Streaming"), "Streaming");
  assert.equal(presentType("Fixed"), "Fixed");
});

test("financial progress derivation", () => {
  const contract = makeContract({
    totalAmount: 100n,
    releasedAmount: 40n,
    withdrawnAmount: 10n,
    refundedAmount: 0n,
    status: "Active",
  });
  const progress = financialProgress(contract);
  assert.equal(progress.released, 40n);
  assert.equal(progress.claimRemaining, 30n);
  assert.equal(progress.remainingInEscrow, 90n);
  assert.equal(progress.releasedPct, 40);
});

test("transaction-state reducer", () => {
  let state = initialTxState;
  state = txReducer(state, { type: "wallet" });
  assert.equal(state.phase, "awaiting_wallet");
  assert.equal(isTxBusy(state.phase), true);
  state = txReducer(state, { type: "submit" });
  state = txReducer(state, { type: "success", signature: "sig" });
  assert.equal(state.phase, "success");
  assert.equal(txPhaseLabel("success"), "Success");
  state = txReducer(state, { type: "submit" });
  assert.equal(isTxBusy(state.phase), true);
  state = txReducer(state, { type: "reset" });
  assert.equal(state.phase, "ready");
  assert.equal(isTxBusy(state.phase), false);
  state = txReducer(state, {
    type: "pending",
    signature: "sig",
    message: "Check the signature before sending again.",
  });
  assert.equal(state.phase, "pending_confirmation");
  assert.equal(state.signature, "sig");
  assert.equal(isTxBusy(state.phase), true);
  assert.equal(txPhaseLabel("pending_confirmation"), "Confirmation unknown");
});

test("create-contract form validation", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
  const draft: CreateWizardDraft = {
    paymentMode: "Fixed",
    freelancer: WALLET_B.toBase58(),
    resolver: PREMIFLOW_RESOLVER.address.toBase58(),
    mint: MINT,
    decimals: 6,
    totalAmountUi: "10",
    trialEnabled: false,
    trialAmountUi: "0",
    startMode: "OnActivation",
    scheduledStartLocal: "",
    durationSeconds: 3600,
    checkpointInterval: 0,
    reviewDuration: 600,
    activationReviewDuration: 3600,
    maxRevisions: 2,
    acceptanceDeadlineLocal: future,
    title: "Landing page",
    description: "Ship the page",
    deliverables: "Figma + code",
    milestones: [],
  };
  const ok = validateCreateDraft(WALLET_A, draft, Math.floor(Date.now() / 1000));
  assert.deepEqual(ok, {});

  const self = validateParties(WALLET_A, WALLET_A.toBase58(), RESOLVER.toBase58());
  assert.ok(self.freelancer);

  const bad = validateCreateDraft(
    WALLET_A,
    { ...draft, freelancer: "nope", totalAmountUi: "-1" },
    Math.floor(Date.now() / 1000)
  );
  assert.ok(bad.freelancer);
  assert.ok(bad.totalAmountUi);
});

test("milestone allocation validation", () => {
  const result = validateMilestoneAllocation(
    [
      { label: "Design", amountUi: "40", dueOffsetSeconds: 100 },
      { label: "Build", amountUi: "60", dueOffsetSeconds: 200 },
    ],
    100n,
    0,
    300
  );
  assert.equal(result.allocated, 100n);
  assert.equal(result.remaining, 0n);
  assert.equal(Object.keys(result.errors).length, 0);
  assert.equal(
    milestonesFullyAllocated(
      [{ label: "Only", amountUi: "50", dueOffsetSeconds: 10 }],
      100n,
      0,
      60
    ),
    false
  );
});

test("dispute award validation", () => {
  assert.equal(validateDisputeAward(0n, 80n), null);
  assert.equal(validateDisputeAward(80n, 80n), null);
  assert.ok(validateDisputeAward(81n, 80n));
  assert.equal(employerRemainder(80n, 25n), 55n);
});

test("terminal states expose only legitimate claim actions", () => {
  const cancelled = makeContract({
    status: "Cancelled",
    releasedAmount: 60n,
    withdrawnAmount: 10n,
    freelancerSettlementAmount: 60n,
    employerRefundableAmount: 40n,
  });
  const now = 1_000;
  assert.deepEqual(terminalMutationActions(WALLET_B, cancelled, now), [
    "withdrawFreelancer",
  ]);
  assert.deepEqual(terminalMutationActions(WALLET_A, cancelled, now), [
    "claimEmployerRefund",
  ]);
  const disputed = makeContract({ status: "Disputed", contestedAmount: 10n });
  assert.deepEqual(terminalMutationActions(WALLET_A, disputed, now), []);
  assert.deepEqual(terminalMutationActions(RESOLVER, disputed, now), [
    "resolveDispute",
  ]);
});

test("dashboard summary uses actual grouped contracts", () => {
  const hiring = makeContract({
    status: "Active",
    openReviewCount: 2,
    address: new PublicKey("So11111111111111111111111111111111111111112"),
  });
  const working = makeContract({
    employer: WALLET_C,
    freelancer: WALLET_A,
    status: "Completed",
    releasedAmount: 100n,
    withdrawnAmount: 40n,
    freelancerSettlementAmount: 100n,
    employerRefundableAmount: 0n,
    address: WALLET_C,
    contractId: 9n,
  });
  const grouped = groupContractsByRole(WALLET_A, [hiring, working]);
  const summary = dashboardSummary(WALLET_A, grouped);
  assert.equal(summary.hiring, 1);
  assert.equal(summary.working, 1);
  assert.equal(summary.active, 1);
  assert.equal(summary.pendingReviews, 2);
  assert.equal(summary.availableToWithdraw, 60n);
});

test("lifecycle stages distinguish current and blocked dispute", () => {
  const active = makeContract({ status: "Active", releasedAmount: 10n });
  const stages = lifecycleStages(active);
  assert.ok(stages.some((s) => s.id === "payment" && s.state !== "future"));
  const disputed = makeContract({ status: "Disputed" });
  const blocked = lifecycleStages(disputed);
  assert.ok(blocked.some((s) => s.state === "blocked"));
});

test("stream display accrual is local estimate only", () => {
  const start = 1_000;
  const end = 1_100;
  assert.equal(estimateStreamAccrualDisplayMs(1000n, start, end, 1_000_000), 0n);
  assert.equal(estimateStreamAccrualDisplayMs(1000n, start, end, 1_050_000), 500n);
  assert.equal(estimateStreamAccrualDisplayMs(1000n, start, end, 1_100_000), 1000n);
  assert.equal(estimateStreamAccrualDisplayMs(1000n, 0, end, 1_050_000), 0n);
});
