import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";

import { formatReviewPeriod } from "../datetime";
import { NOTICE_CATALOG, noticeKindForAction } from "../notices";
import { assertMetadataUri } from "../../streampay-v2/metadata";
import { availableActions } from "../../streampay-v2/actions";
import { readFileSync } from "node:fs";

import {
  actionLabel,
  actionsSectionGuidance,
  completeContractCopy,
  dashboardSummary,
  filterContracts,
  financialProgress,
  groupContractsByRole,
  lifecycleStages,
  officialDeliverableCopy,
  presentStatus,
  presentType,
  roleLabel,
  terminalMutationActions,
  withdrawFreelancerCopy,
} from "../view-model";
import {
  isTxBusy,
  txPhaseDetail,
  txPhaseLabel,
  txReducer,
  initialTxState,
} from "../tx-state";
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
  makeWorkUnit,
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
  state = txReducer(state, { type: "start" });
  assert.equal(state.phase, "preparing");
  assert.equal(isTxBusy(state.phase), true);
  assert.equal(txPhaseLabel("preparing"), "Preparing transaction…");
  state = txReducer(state, { type: "wallet" });
  assert.equal(state.phase, "awaiting_wallet");
  assert.equal(isTxBusy(state.phase), true);
  assert.equal(txPhaseLabel("awaiting_wallet"), "Waiting for wallet approval…");
  assert.equal(
    txPhaseDetail("awaiting_wallet"),
    "Review and approve the transaction in your wallet."
  );
  assert.equal(txPhaseLabel("submitting"), "Submitting transaction…");
  state = txReducer(state, { type: "submit" });
  assert.equal(txPhaseLabel("submitting"), "Submitting transaction…");
  state = txReducer(state, { type: "confirm", signature: "sig" });
  assert.equal(txPhaseLabel("confirming"), "Confirming on Devnet…");
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
  state = txReducer(state, {
    type: "fail",
    message: "Nothing was submitted.",
    diagnostic:
      "Wallet approval: 54.2s · Remaining: 7 blocks · Blockhash: invalid · Threshold: ≤10 refused",
  });
  assert.equal(state.phase, "failed");
  assert.equal(state.message, "Nothing was submitted.");
  assert.equal(
    state.diagnostic,
    "Wallet approval: 54.2s · Remaining: 7 blocks · Blockhash: invalid · Threshold: ≤10 refused"
  );
});

test("actions section guidance for PendingEmployerApproval", () => {
  assert.equal(
    actionsSectionGuidance({
      status: "PendingEmployerApproval",
      role: "freelancer",
      actions: [],
    }),
    "No action needed right now. Waiting for the employer to activate the contract."
  );
  assert.match(
    actionsSectionGuidance({
      status: "PendingEmployerApproval",
      role: "employer",
      actions: ["approveActivation", "rejectActivation"],
    }),
    /Activation is available/i
  );
  assert.match(
    actionsSectionGuidance({
      status: "PendingEmployerApproval",
      role: "employer",
      actions: ["approveActivation", "rejectActivation"],
    }),
    /before work begins/i
  );
  assert.equal(
    actionsSectionGuidance({
      status: "Active",
      role: "freelancer",
      actions: ["submitWorkUnit"],
      paymentMode: "Fixed",
      workUnitStatus: "Defined",
    }),
    "Contract is active. Submit your deliverable before the deadline."
  );
  assert.equal(
    actionsSectionGuidance({
      status: "Active",
      role: "employer",
      actions: ["cancelActiveContract"],
      paymentMode: "Fixed",
      workUnitStatus: "Defined",
    }),
    "Contract is active. Waiting for the freelancer to submit the deliverable."
  );
  assert.equal(
    actionsSectionGuidance({
      status: "Active",
      role: "employer",
      actions: ["approveWorkUnit", "requestWorkRevision"],
      paymentMode: "Fixed",
      workUnitStatus: "Submitted",
    }),
    "Review the submitted deliverable. Approve it, or request a revision while the review window is open."
  );
  assert.equal(
    actionsSectionGuidance({
      status: "Active",
      role: "employer",
      actions: [],
      paymentMode: "Fixed",
      workUnitStatus: "Revising",
    }),
    "Waiting for the freelancer to submit a revised official deliverable."
  );
  assert.equal(
    actionsSectionGuidance({
      status: "Active",
      role: "employer",
      actions: ["completeContract"],
      paymentMode: "Fixed",
      workUnitStatus: "Released",
    }),
    "All deliverables are approved. Mark the contract finished when the work is complete."
  );
  assert.equal(
    actionsSectionGuidance({
      status: "Active",
      role: "freelancer",
      actions: ["completeContract", "withdrawFreelancer"],
      paymentMode: "Fixed",
      workUnitStatus: "Released",
      claimRemaining: 1_000_000n,
    }),
    "Your deliverable has been approved. Payment is available to collect."
  );
  assert.equal(
    actionsSectionGuidance({
      status: "Active",
      role: "freelancer",
      actions: ["completeContract"],
      paymentMode: "Fixed",
      workUnitStatus: "Released",
      claimRemaining: 0n,
    }),
    "Your deliverable has been approved. Mark the contract finished when you are ready, or wait for the employer."
  );
  assert.doesNotMatch(
    actionsSectionGuidance({
      status: "Active",
      role: "employer",
      actions: ["cancelActiveContract"],
      paymentMode: "Fixed",
      workUnitStatus: "Defined",
    }),
    /program still authorizes/i
  );
});

test("contract detail uses Contract details heading and shared tx status", () => {
  const detail = readFileSync(
    new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
    "utf8"
  );
  assert.match(detail, />Contract details</);
  assert.doesNotMatch(detail, /Parties & terms/);
  assert.doesNotMatch(detail, /Buttons follow current availability/);
  assert.doesNotMatch(detail, /program still authorizes/);
  assert.match(detail, /actionsSectionGuidance/);
  assert.match(detail, /TransactionStatus state=\{tx\.state\}/);
  assert.match(detail, /id="actions"/);
  assert.match(detail, /Need help with this contract/);
  assert.match(detail, /Resolution & dispute information/);
  assert.match(detail, /disputeActive/);
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
    hourlyRateUi: "",
    authorizedTimeValue: "8",
    authorizedTimeUnit: "hours",
    engagementDurationValue: "1",
    engagementDurationUnit: "hours",
    trialEnabled: false,
    trialAmountUi: "0",
    startMode: "OnActivation",
    scheduledStartLocal: "",
    durationSeconds: 3600,
    checkpointInterval: 0,
    reviewDuration: 600,
    activationReviewDuration: 3600,
    maxRevisions: 2,
    acceptanceWindowSeconds: 172_800,
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
  assert.ok(blocked.some((s) => s.id === "dispute" && s.state === "current"));
  assert.ok(blocked.some((s) => s.state === "blocked"));
});

test("completed lifecycle renders terminal wording", () => {
  const completed = makeContract({
    status: "Completed",
    releasedAmount: 10n,
    withdrawnAmount: 10n,
    freelancerSettlementAmount: 10n,
    employerRefundableAmount: 0n,
  });
  const stages = lifecycleStages(completed);
  const last = stages.find((s) => s.id === "complete");
  assert.equal(last?.label, "Completed");
  assert.equal(last?.state, "done");
  assert.ok(!stages.some((s) => s.state === "current"));
});

test("complete contract confirmation copy does not imply payment", () => {
  const copy = completeContractCopy();
  assert.match(copy.intro, /records the final settlement/i);
  assert.ok(copy.points.some((line) => /does not transfer tokens/i.test(line)));
  assert.ok(copy.points.some((line) => /does not withdraw funds/i.test(line)));
  assert.ok(copy.points.some((line) => /does not refund funds/i.test(line)));
  assert.ok(copy.points.some((line) => /terminal Completed status/i.test(line)));
  assert.match(copy.notPayment, /does not pay the freelancer/i);
  assert.match(copy.wallet, /wallet will ask you to approve/i);
});

test("withdraw confirmation copy distinguishes release from transfer", () => {
  const copy = withdrawFreelancerCopy("10", "4", "6");
  assert.match(copy.intro, /transfers already-released tokens from the contract escrow/i);
  assert.equal(copy.released, "10");
  assert.equal(copy.withdrawn, "4");
  assert.equal(copy.remaining, "6");
  assert.ok(copy.points.some((line) => /does not itself move SPL tokens/i.test(line)));
  assert.match(copy.wallet, /Phantom will request transaction approval/i);
});

test("notice catalog covers the planned lifecycle events", () => {
  assert.equal(noticeKindForAction("acceptContract"), "contract_accepted");
  assert.equal(noticeKindForAction("submitWorkUnit"), "work_submitted");
  assert.equal(noticeKindForAction("approveWorkUnit"), "work_approved");
  assert.equal(noticeKindForAction("requestWorkRevision"), "revision_requested");
  assert.equal(noticeKindForAction("finalizeReviewTimeout"), "payment_released");
  assert.equal(noticeKindForAction("withdrawFreelancer"), "withdrawal_completed");
  assert.equal(noticeKindForAction("openDispute"), "dispute_opened");
  assert.equal(noticeKindForAction("resolveDispute"), "dispute_resolved");
  assert.equal(noticeKindForAction("completeContract"), "contract_completed");
  assert.match(NOTICE_CATALOG.contract_completed.body, /did not itself transfer tokens/i);
  assert.match(NOTICE_CATALOG.withdrawal_completed.body, /transferred to your wallet/i);
  assert.match(NOTICE_CATALOG.payment_released.body, /Released accounting increased/i);
  assert.match(NOTICE_CATALOG.contract_cancelled.body, /Tokens move only when withdraw or refund is claimed/i);
  assert.match(NOTICE_CATALOG.dispute_resolved.body, /Settlement accounting was recorded/i);
  assert.equal(noticeKindForAction("voidStaleRevision"), "expired_revision_ended");
  assert.ok(NOTICE_CATALOG.revision_deadline_passed);
  assert.ok(NOTICE_CATALOG.revised_deliverable_submitted);
  assert.equal(noticeKindForAction("approveActivation"), "activation_approved");
  assert.equal(noticeKindForAction("expireActivation"), "activation_window_ended");
  assert.match(NOTICE_CATALOG.activation_window_ended.body, /Claim refund/i);
  assert.equal(noticeKindForAction("approveWorkUnit"), "work_approved");
  assert.equal(
    noticeKindForAction("approveTrialAndActivate"),
    "trial_approved_and_activated"
  );
  assert.equal(noticeKindForAction("cancelActiveContract"), "contract_cancelled");
  assert.equal(
    noticeKindForAction("submitWorkUnit", { workUnitStatus: "Revising" }),
    "revised_deliverable_submitted"
  );
  assert.equal(noticeKindForAction("settleTrialAndEnd"), "trial_settled_and_ended");
  assert.equal(noticeKindForAction("finalizeTrialReviewTimeout"), "trial_review_timed_out");
  assert.match(NOTICE_CATALOG.trial_review_timed_out.body, /resolver is not involved/i);
});

test("official deliverable label appears for a submittable Fixed unit", () => {
  assert.equal(actionLabel("submitWorkUnit"), "Submit official deliverable");
  const contract = makeContract({
    status: "Active",
    paymentMode: "Fixed",
    reviewDuration: 3_600,
    maxRevisions: 2,
    startTime: 1,
  });
  const unit = makeWorkUnit({ kind: "Fixed", status: "Defined" });
  const actions = availableActions({
    wallet: WALLET_B,
    contract,
    workUnit: unit,
    now: 2_000,
  });
  assert.ok(actions.includes("submitWorkUnit"));
  assert.equal(actionLabel("submitWorkUnit"), "Submit official deliverable");
  assert.ok(!actions.includes("cancelActiveContract"));
});

test("official deliverable copy uses contract review terms and does not overclaim", () => {
  const liveLike = officialDeliverableCopy(
    makeContract({ reviewDuration: 3_600, maxRevisions: 2 })
  );
  assert.equal(liveLike.title, "Submit official deliverable");
  assert.match(liveLike.intro, /official submission for employer review/i);
  assert.match(liveLike.intro, /different from sending a message or draft/i);
  assert.equal(liveLike.fieldLabel, "Final project / deliverable link");
  assert.match(liveLike.fieldHint, /Maximum 200 characters/);
  assert.match(liveLike.fieldHint, /does not host the file/i);
  assert.equal(liveLike.reviewPeriod, "1 hour");
  assert.equal(liveLike.revisionRequests, "2");
  assert.ok(liveLike.consequences.some((line) => /does not immediately transfer payment/i.test(line)));
  assert.ok(liveLike.consequences.some((line) => /cancellation is blocked/i.test(line)));
  assert.ok(liveLike.consequences.some((line) => /withdrawn separately/i.test(line)));
  assert.match(liveLike.acknowledgement, /version you want the employer to review/i);
  assert.match(liveLike.messagesHint, /belong in Messages/);
  assert.equal(
    liveLike.recordedReference,
    "Your main work link, or a note that you uploaded a file, is saved with the contract so both sides can see what was submitted."
  );
  assert.doesNotMatch(liveLike.recordedReference, /on-chain reference|transaction|blockchain proof/i);
  assert.doesNotMatch(liveLike.recordedReference, /cryptographically verified|immutable|proves the exact file/i);
  assert.doesNotMatch(liveLike.fieldHint, /permanently stored|file contents are immutable/i);

  const other = officialDeliverableCopy(
    makeContract({ reviewDuration: 600, maxRevisions: 5 })
  );
  assert.equal(other.reviewPeriod, "10 minutes");
  assert.equal(other.revisionRequests, "5");
});

test("review period formatting is human-readable", () => {
  assert.equal(formatReviewPeriod(3_600), "1 hour");
  assert.equal(formatReviewPeriod(7_200), "2 hours");
  assert.equal(formatReviewPeriod(90), "1 minute 30 seconds");
  assert.equal(formatReviewPeriod(0), "0 seconds");
});

test("existing URI validation still accepts a 200-character reference", () => {
  const ok = "https://example.com/" + "a".repeat(180);
  assert.equal(ok.length, 200);
  assert.equal(assertMetadataUri(ok), ok);
  assert.throws(() => assertMetadataUri(""));
  assert.throws(() => assertMetadataUri(ok + "x"));
});

test("official deliverable action remains submitWorkUnit for the transaction path", () => {
  assert.equal(actionLabel("submitWorkUnit"), "Submit official deliverable");
  assert.notEqual("submitWorkUnit", actionLabel("submitWorkUnit"));
});

test("stream display accrual is local estimate only", () => {
  const start = 1_000;
  const end = 1_100;
  assert.equal(estimateStreamAccrualDisplayMs(1000n, start, end, 1_000_000), 0n);
  assert.equal(estimateStreamAccrualDisplayMs(1000n, start, end, 1_050_000), 500n);
  assert.equal(estimateStreamAccrualDisplayMs(1000n, start, end, 1_100_000), 1000n);
  assert.equal(estimateStreamAccrualDisplayMs(1000n, 0, end, 1_050_000), 0n);
});
