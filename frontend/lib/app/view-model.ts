import { PublicKey } from "@solana/web3.js";

import { CONTRACT_TYPE_GUIDES } from "@/lib/app/contract-type-guide";
import { walletSetIncludesParty } from "@/lib/app/account-wallet-identity";
import {
  formatReviewPeriod,
  formatRevisionRemaining,
  formatUnix,
} from "@/lib/app/datetime";
import {
  availableActions,
  contractStatusLabel,
  equivalentHourlyRateDisplayOnly,
  estimatedStreamAccrualForContract,
  isStreamCurrentlyAccruing,
  mayAttemptCompletion,
  paymentModeLabel,
  remainingEmployerRefund,
  remainingFreelancerClaim,
  roleForContract,
  streamDurationSeconds,
  streamElapsedSeconds,
  streamRemainingSeconds,
  clampStreamNow,
  isStreamEnded,
  projectedFinalStreamClaim,
  workUnitStatusDetail,
  type ContractRole,
  type ContractStatus,
  type ContractType,
  type PaymentModeName,
  type ContractView,
  type UiAction,
  type WorkUnitStatus,
  type WorkUnitView,
} from "@/lib/streampay-v2";

import { allowsSettlementClaims } from "@/lib/streampay-v2/types";
import {
  STREAMING_ENDED_LABEL,
  STREAMING_ENDED_SHORT_LABEL,
  type StreamingEarnedBasis,
} from "@/lib/app/stream-display";

export { roleForContract };

export type RoleFilter = "all" | "hiring" | "working" | "resolving";
export type StatusFilter = "all" | ContractStatus;

export type GroupedContracts = {
  all: ContractView[];
  hiring: ContractView[];
  working: ContractView[];
  /** Contracts where the wallet is the on-chain resolver (Contracts page only). */
  resolving?: ContractView[];
};

export function groupContractsByRole(
  wallet: PublicKey,
  contracts: ContractView[]
): GroupedContracts {
  const hiring: ContractView[] = [];
  const working: ContractView[] = [];
  const seen = new Set<string>();
  const all: ContractView[] = [];

  for (const contract of contracts) {
    const key = contract.address.toBase58();
    if (!seen.has(key)) {
      seen.add(key);
      all.push(contract);
    }
    const role = roleForContract(wallet, contract);
    if (role === "employer") hiring.push(contract);
    if (role === "freelancer") working.push(contract);
  }
  return { all, hiring, working };
}

/**
 * Groups contracts across every verified wallet linked to one PREMIFLOW account.
 *
 * A contract may appear in both Hiring and Working when different linked
 * wallets belonging to the same account occupy both roles.
 */
export function groupContractsByWallets(
  wallets: readonly PublicKey[],
  contracts: ContractView[]
): GroupedContracts {
  const hiring: ContractView[] = [];
  const working: ContractView[] = [];
  const seen = new Set<string>();
  const all: ContractView[] = [];

  for (const contract of contracts) {
    const key = contract.address.toBase58();

    if (!seen.has(key)) {
      seen.add(key);
      all.push(contract);
    }

    if (walletSetIncludesParty(wallets, contract.employer)) {
      hiring.push(contract);
    }

    if (walletSetIncludesParty(wallets, contract.freelancer)) {
      working.push(contract);
    }
  }

  return { all, hiring, working };
}

export function filterContracts(
  grouped: GroupedContracts,
  role: RoleFilter,
  status: StatusFilter
): ContractView[] {
  const base =
    role === "hiring"
      ? grouped.hiring
      : role === "working"
        ? grouped.working
        : role === "resolving"
          ? (grouped.resolving ?? [])
          : grouped.all;
  if (status === "all") return base;
  return base.filter((c) => c.status === status);
}

export function presentStatus(status: ContractStatus): string {
  return contractStatusLabel(status);
}

/**
 * Display status for lists, cards and badges. An on-chain Active Streaming
 * contract at or after end_time reads "Streaming ended" ("Ended" when compact),
 * matching ContractDetail. The on-chain status itself is never changed.
 */
export function presentContractStatus(
  contract: Pick<ContractView, "status" | "paymentMode" | "startTime" | "endTime">,
  now?: number,
  options: { compact?: boolean } = {}
): string {
  if (now !== undefined && isStreamEnded(contract, now)) {
    return options.compact ? STREAMING_ENDED_SHORT_LABEL : STREAMING_ENDED_LABEL;
  }
  return presentStatus(contract.status);
}

/**
 * Short user-facing Actions section copy. Availability still comes from
 * `availableActions` — this only explains the current wait or next step.
 *
 * Pass the full availability list (including unit-scoped actions) so Fixed /
 * Milestone guidance can distinguish submit / review / revise / complete.
 */
export function actionsSectionGuidance(input: {
  status: ContractStatus;
  role: ContractRole;
  actions: readonly UiAction[];
  paymentMode?: PaymentModeName;
  /** Primary Fixed/Milestone unit under review, when known. */
  workUnitStatus?: WorkUnitStatus | null;
  /** Remaining freelancer claim in base units; used after approval. */
  claimRemaining?: bigint;
}): string {
  const { status, role, actions, paymentMode, workUnitStatus } = input;
  const claimRemaining = input.claimRemaining ?? 0n;

  if (status === "Disputed" && role !== "resolver") {
    return "This contract is frozen. Only the designated resolver can record the settlement.";
  }
  if (status === "Disputed" && role === "resolver") {
    return "Record how the contested amount is split between the freelancer and employer.";
  }

  if (status === "PendingEmployerApproval") {
    if (role === "freelancer") {
      return "No action needed right now. Waiting for the employer to activate the contract.";
    }
    if (role === "employer") {
      if (
        actions.includes("approveActivation") ||
        actions.includes("approveTrialAndActivate")
      ) {
        return "Activation is available. Approve activation to start the work window — required before work begins.";
      }
      if (actions.includes("rejectActivation") || actions.length > 0) {
        return "Review activation and trial status, then activate or respond when ready.";
      }
      return "Waiting for the next activation step on this contract.";
    }
  }

  if (status === "PendingAcceptance" && role === "freelancer") {
    return "Review the offer, then accept or decline before the acceptance deadline.";
  }
  if (status === "PendingAcceptance" && role === "employer") {
    return "Waiting for the freelancer to accept or decline this offer.";
  }

  if (status === "Active" && (paymentMode === "Fixed" || paymentMode === "Milestone")) {
    const underReview =
      actions.includes("approveWorkUnit") || workUnitStatus === "Submitted";
    const revising =
      workUnitStatus === "Revising" || actions.includes("voidStaleRevision");

    if (role === "employer") {
      if (actions.includes("completeContract")) {
        return "All deliverables are approved. Mark the contract finished when the work is complete.";
      }
      if (underReview) {
        return "Review the submitted deliverable. Approve it, or request a revision while the review window is open.";
      }
      if (revising) {
        return "Waiting for the freelancer to submit a revised official deliverable.";
      }
      return "Contract is active. Waiting for the freelancer to submit the deliverable.";
    }

    if (role === "freelancer") {
      if (actions.includes("completeContract")) {
        if (claimRemaining > 0n || actions.includes("withdrawFreelancer")) {
          return "Your deliverable has been approved. Payment is available to collect.";
        }
        return "Your deliverable has been approved. Mark the contract finished when you are ready, or wait for the employer.";
      }
      if (
        paymentMode === "Fixed" &&
        workUnitStatus === "Released" &&
        (claimRemaining > 0n || actions.includes("withdrawFreelancer"))
      ) {
        return "Your deliverable has been approved. Payment is available to collect.";
      }
      if (revising) {
        return "Revision requested. Prepare and resubmit your official deliverable before the revision deadline.";
      }
      if (underReview) {
        return "Your deliverable is under employer review. Payment is not transferred yet.";
      }
      return "Contract is active. Submit your deliverable before the deadline.";
    }
  }

  if (actions.length === 0) {
    return "No contract-level actions right now.";
  }
  return "Choose an action for this contract stage.";
}

/** Fixed and Milestone work units render their own cards with per-unit controls. */
export function workUnitsHaveOwnCards(paymentMode: PaymentModeName): boolean {
  return paymentMode !== "Streaming" && paymentMode !== "Hourly";
}

/**
 * Unit-scoped buttons for the contract-level Actions card. Empty when each
 * unit's card already shows them, so no unit action is rendered twice.
 */
export function summaryWorkUnitActions<U>(input: {
  paymentMode: PaymentModeName;
  units: readonly U[];
  actionsFor: (unit: U) => readonly UiAction[];
}): Array<{ action: UiAction; unit: U }> {
  if (workUnitsHaveOwnCards(input.paymentMode)) return [];
  return input.units.flatMap((unit) =>
    input.actionsFor(unit).map((action) => ({ action, unit }))
  );
}

export function presentType(type: ContractType | "Hourly"): string {
  return paymentModeLabel(type);
}

export function roleLabel(role: ContractRole): string {
  switch (role) {
    case "employer":
      return "Hiring";
    case "freelancer":
      return "Working";
    case "resolver":
      return "Resolver";
    case "none":
      return "Observer";
  }
}

export function counterparty(
  wallet: PublicKey,
  contract: ContractView
): { label: string; address: PublicKey } {
  const role = roleForContract(wallet, contract);
  if (role === "employer") {
    return { label: "Freelancer", address: contract.freelancer };
  }
  if (role === "freelancer") {
    return { label: "Employer", address: contract.employer };
  }
  return { label: "Employer", address: contract.employer };
}

export type FinancialProgress = {
  total: bigint;
  released: bigint;
  withdrawn: bigint;
  refunded: bigint;
  refundableRemaining: bigint;
  claimRemaining: bigint;
  remainingInEscrow: bigint;
  releasedPct: number;
  withdrawnPct: number;
};

function pct(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  const scaled = Number((part * 10000n) / whole) / 100;
  return Math.max(0, Math.min(100, scaled));
}

/**
 * Display progress from on-chain fields. Not a settlement input.
 */
export function financialProgress(contract: ContractView): FinancialProgress {
  const remainingInEscrow =
    contract.totalAmount - contract.withdrawnAmount - contract.refundedAmount;
  return {
    total: contract.totalAmount,
    released: contract.releasedAmount,
    withdrawn: contract.withdrawnAmount,
    refunded: contract.refundedAmount,
    refundableRemaining: remainingEmployerRefund(contract),
    claimRemaining: remainingFreelancerClaim(contract),
    remainingInEscrow: remainingInEscrow < 0n ? 0n : remainingInEscrow,
    releasedPct: pct(contract.releasedAmount, contract.totalAmount),
    withdrawnPct: pct(contract.withdrawnAmount, contract.totalAmount),
  };
}

export type StreamingDashboard = {
  totalFundedStream: bigint;
  durationSeconds: number;
  startTime: number;
  endTime: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  equivalentHourlyRate: bigint;
  earnedSoFar: bigint;
  alreadyRecorded: bigint;
  alreadyCollected: bigint;
  availableToCollect: bigint;
  remainingEscrow: bigint;
  /** True only while Active and inside start..end (the only case that uses the live clock). */
  live: boolean;
  /** How earnedSoFar was derived: live estimate (Active) vs frozen on-chain figure. */
  earnedBasis: StreamingEarnedBasis;
  /** Unix time the clock figures are frozen at (0 while Active or when unknown). */
  frozenAt: number;
  /** Trial pay already released (releasedAmount minus stream-released), 0 without a trial. */
  trialPaid: bigint;
  /** Active Streaming at or after end_time (display only; no on-chain event). */
  ended: boolean;
  /** Canonical projected Collect amount once ended; 0n otherwise. */
  finalClaimable: bigint;
  /** Hero figure: frozen on-chain earned, or trial paid + live stream estimate while Active. */
  displayEarned: bigint;
};

/**
 * Streaming contract-detail dashboard. Amounts are display-only.
 * Earned so far uses the same floor formula as Rust `canonical_stream_accrued`.
 */
export function streamingDashboard(
  contract: ContractView,
  rawNow: number
): StreamingDashboard {
  // The display clock never advances past end_time, so accrual stops exactly there.
  const now = clampStreamNow(contract, rawNow);
  const ended = isStreamEnded(contract, rawNow);
  const durationSeconds = streamDurationSeconds(contract);
  const progress = financialProgress(contract);
  const frozen = streamFrozenState(contract, durationSeconds);
  const trialPaid =
    contract.releasedAmount > contract.streamReleasedAmount
      ? contract.releasedAmount - contract.streamReleasedAmount
      : 0n;
  return {
    totalFundedStream: contract.mainAmount,
    durationSeconds,
    startTime: contract.startTime,
    endTime: contract.endTime,
    elapsedSeconds: frozen ? frozen.elapsedSeconds : streamElapsedSeconds(contract, now),
    remainingSeconds: frozen
      ? frozen.remainingSeconds
      : streamRemainingSeconds(contract, now),
    equivalentHourlyRate: equivalentHourlyRateDisplayOnly(
      contract.mainAmount,
      durationSeconds
    ),
    earnedSoFar: frozen ? frozen.earned : estimatedStreamAccrualForContract(contract, now),
    alreadyRecorded: contract.releasedAmount,
    alreadyCollected: contract.withdrawnAmount,
    availableToCollect: remainingFreelancerClaim(contract),
    remainingEscrow: progress.remainingInEscrow,
    live: frozen === null && isStreamCurrentlyAccruing(contract, now),
    earnedBasis: frozen ? frozen.basis : "estimate",
    frozenAt: frozen ? frozen.at : 0,
    trialPaid,
    ended,
    finalClaimable: ended ? projectedFinalStreamClaim(contract, now) : 0n,
    displayEarned: frozen
      ? frozen.earned
      : trialPaid + estimatedStreamAccrualForContract(contract, now),
  };
}

type StreamFrozenState = {
  basis: Exclude<StreamingEarnedBasis, "estimate">;
  earned: bigint;
  at: number;
  elapsedSeconds: number;
  remainingSeconds: number;
};

/**
 * Non-Active streams never extrapolate with the browser clock. Settled statuses show
 * the frozen on-chain freelancer settlement (falls back to released_amount); Disputed
 * shows released_amount (materialized when the dispute opened). Clock figures freeze
 * at disputed_at / terminated_at (end_time for Completed). Without a timestamp,
 * elapsed comes from stream_released / main_amount and no countdown is shown.
 */
function streamFrozenState(
  contract: ContractView,
  durationSeconds: number
): StreamFrozenState | null {
  if (contract.status === "Active") return null;
  const basis: StreamFrozenState["basis"] =
    contract.status === "Disputed"
      ? "disputed"
      : allowsSettlementClaims(contract.status)
        ? "settled"
        : "frozen";
  const earned =
    basis === "settled" && contract.freelancerSettlementAmount > 0n
      ? contract.freelancerSettlementAmount
      : contract.releasedAmount;
  const at =
    contract.disputedAt > 0
      ? contract.disputedAt
      : contract.terminatedAt > 0
        ? contract.terminatedAt
        : contract.status === "Completed"
          ? contract.endTime
          : 0;
  if (at > 0) {
    return {
      basis,
      earned,
      at,
      elapsedSeconds: streamElapsedSeconds(contract, at),
      remainingSeconds: streamRemainingSeconds(contract, at),
    };
  }
  let elapsedSeconds = 0;
  if (contract.startTime > 0 && contract.mainAmount > 0n && durationSeconds > 0) {
    const streamed =
      contract.streamReleasedAmount < contract.mainAmount
        ? contract.streamReleasedAmount
        : contract.mainAmount;
    elapsedSeconds = Number((BigInt(durationSeconds) * streamed) / contract.mainAmount);
  }
  return { basis, earned, at: 0, elapsedSeconds, remainingSeconds: 0 };
}

export function contractActionVariant(
  action: UiAction
): "primary" | "secondary" | "danger" {
  if (
    action === "openDispute" ||
    action === "cancelActiveContract" ||
    action === "rejectActivation"
  ) {
    return "danger";
  }
  if (
    action === "settleTrialAndEnd" ||
    action === "requestTrialRevision" ||
    action === "finalizeTrialReviewTimeout"
  ) {
    return "secondary";
  }
  if (
    action === "completeContract" ||
    action === "endHourlyContract" ||
    action === "expireAcceptance" ||
    action === "expireActivation"
  ) {
    return "secondary";
  }
  if (action === "stopHourlySession") return "danger";
  return "primary";
}

export type DashboardSummary = {
  active: number;
  hiring: number;
  working: number;
  pendingReviews: number;
  availableToWithdraw: bigint;
  availableRefund: bigint;
  streamingActive: number;
  /** Active Streaming past end_time (final pay awaiting collection); 0 without a clock. */
  streamingEnded: number;
};

export function dashboardSummary(
  wallet: PublicKey,
  grouped: GroupedContracts,
  now?: number
): DashboardSummary {
  let pendingReviews = 0;
  let availableToWithdraw = 0n;
  let availableRefund = 0n;
  let streamingActive = 0;
  let streamingEnded = 0;
  let active = 0;

  for (const contract of grouped.all) {
    // Ended streams are on-chain Active but no longer actively streaming.
    const ended = now !== undefined && isStreamEnded(contract, now);
    if (ended) streamingEnded += 1;
    if (contract.status === "Active" && !ended) active += 1;
    pendingReviews += contract.openReviewCount;
    if (roleForContract(wallet, contract) === "freelancer") {
      availableToWithdraw += remainingFreelancerClaim(contract);
    }
    if (roleForContract(wallet, contract) === "employer") {
      availableRefund += remainingEmployerRefund(contract);
    }
    if (contract.paymentMode === "Streaming" && contract.status === "Active" && !ended) {
      streamingActive += 1;
    }
  }

  return {
    active,
    hiring: grouped.hiring.length,
    working: grouped.working.length,
    pendingReviews,
    availableToWithdraw,
    availableRefund,
    streamingActive,
    streamingEnded,
  };
}

/**
 * Dashboard summary across all verified wallets linked to the account.
 * This is read-only identity logic; transaction authority is unchanged.
 */
export function dashboardSummaryForWallets(
  wallets: readonly PublicKey[],
  grouped: GroupedContracts,
  now?: number
): DashboardSummary {
  let pendingReviews = 0;
  let availableToWithdraw = 0n;
  let availableRefund = 0n;
  let streamingActive = 0;
  let streamingEnded = 0;
  let active = 0;

  for (const contract of grouped.all) {
    // Ended streams are on-chain Active but no longer actively streaming.
    const ended = now !== undefined && isStreamEnded(contract, now);
    if (ended) streamingEnded += 1;
    if (contract.status === "Active" && !ended) active += 1;

    pendingReviews += contract.openReviewCount;

    if (walletSetIncludesParty(wallets, contract.freelancer)) {
      availableToWithdraw += remainingFreelancerClaim(contract);
    }

    if (walletSetIncludesParty(wallets, contract.employer)) {
      availableRefund += remainingEmployerRefund(contract);
    }

    if (
      contract.paymentMode === "Streaming" &&
      contract.status === "Active" &&
      !ended
    ) {
      streamingActive += 1;
    }
  }

  return {
    active,
    hiring: grouped.hiring.length,
    working: grouped.working.length,
    pendingReviews,
    availableToWithdraw,
    availableRefund,
    streamingActive,
    streamingEnded,
  };
}

export type LifecycleStage = {
  id: string;
  label: string;
  state: "done" | "current" | "future" | "blocked";
};

export function lifecycleStages(contract: ContractView): LifecycleStage[] {
  const disputed = contract.status === "Disputed";
  const stages: Array<{ id: string; label: string; reached: boolean }> = [
    { id: "created", label: "Created", reached: true },
  ];

  if (contract.paymentMode === "Milestone") {
    stages.push({
      id: "terms",
      label: "Terms locked",
      reached: contract.status !== "Draft",
    });
  }

  stages.push({
    id: "accepted",
    label: "Accepted",
    reached:
      contract.status !== "Draft" &&
      contract.status !== "PendingAcceptance" &&
      contract.status !== "Declined" &&
      contract.status !== "Expired",
  });

  if (contract.trialAmount > 0n) {
    stages.push({
      id: "trial",
      label: "Trial",
      reached:
        contract.status === "Active" ||
        contract.status === "Completed" ||
        contract.status === "Cancelled" ||
        contract.status === "Resolved" ||
        contract.status === "ActivationRejected" ||
        contract.status === "Disputed",
    });
  }

  stages.push({
    id: "active",
    label: "Active",
    reached:
      contract.status === "Active" ||
      contract.status === "Completed" ||
      contract.status === "Cancelled" ||
      contract.status === "Resolved",
  });

  stages.push({
    id: "payment",
    label: "Payment",
    reached: contract.releasedAmount > 0n || contract.status === "Completed",
  });

  if (contract.status === "Disputed" || contract.status === "Resolved") {
    stages.push({
      id: "dispute",
      label: contract.status === "Disputed" ? "Disputed" : "Dispute resolved",
      reached: true,
    });
  }

  stages.push({
    id: "complete",
    label: terminalLabel(contract.status),
    reached:
      contract.status === "Completed" ||
      contract.status === "Cancelled" ||
      contract.status === "Resolved" ||
      contract.status === "Declined" ||
      contract.status === "Expired" ||
      contract.status === "ActivationRejected",
  });

  const currentIndex = stages.reduce(
    (acc, stage, i) => (stage.reached ? i : acc),
    0
  );
  const finished =
    contract.status === "Completed" ||
    contract.status === "Cancelled" ||
    contract.status === "Resolved" ||
    contract.status === "Declined" ||
    contract.status === "Expired" ||
    contract.status === "ActivationRejected";

  return stages.map((stage, i) => {
    let state: LifecycleStage["state"] = "future";
    if (disputed && stage.id === "dispute") state = "current";
    else if (disputed && !stage.reached) state = "blocked";
    else if (stage.reached && i < currentIndex) state = "done";
    else if (stage.reached && i === currentIndex) {
      state = finished && !disputed ? "done" : "current";
    } else if (stage.reached) state = "done";
    return { id: stage.id, label: stage.label, state };
  });
}

function terminalLabel(status: ContractStatus): string {
  switch (status) {
    case "Cancelled":
      return "Cancelled";
    case "Resolved":
      return "Resolved";
    case "Declined":
      return "Declined";
    case "Expired":
      return "Expired";
    case "ActivationRejected":
      return "Not activated";
    default:
      return "Completed";
  }
}

export function actionLabel(
  action: UiAction,
  context?: { workUnitStatus?: WorkUnitStatus }
): string {
  switch (action) {
    case "addMilestone":
      return "Add milestone";
    case "finalizeTerms":
      return "Lock terms";
    case "acceptContract":
      return "Accept contract";
    case "declineContract":
      return "Decline offer";
    case "expireAcceptance":
      return "Expire offer";
    case "expireActivation":
      return "End expired activation";
    case "approveActivation":
      return "Activate";
    case "rejectActivation":
      return context?.workUnitStatus === "Submitted" ||
        context?.workUnitStatus === "Revising"
        ? "Dispute trial"
        : context?.workUnitStatus === "Defined"
          ? "End before trial work"
          : "Do not start contract";
    case "submitTrialWork":
      return "Submit trial";
    case "requestTrialRevision":
      return "Request trial revision";
    case "approveTrialAndActivate":
      return "Approve trial & start contract";
    case "settleTrialAndEnd":
      return "Pay trial & don't continue";
    case "finalizeTrialReviewTimeout":
      return "Finalize expired trial review";
    case "submitWorkUnit":
      return context?.workUnitStatus === "Revising"
        ? "Submit revised deliverable"
        : "Submit official deliverable";
    case "requestWorkRevision":
      return "Request revision";
    case "approveWorkUnit":
      return "Approve work";
    case "voidStaleRevision":
      return "End expired revision";
    case "finalizeReviewTimeout":
      return "Release after timeout";
    case "releaseStreamAccrual":
      return "Update earnings";
    case "cancelActiveContract":
      return "Cancel contract";
    case "withdrawFreelancer":
      return "Collect pay";
    case "claimEmployerRefund":
      return "Claim refund";
    case "openDispute":
      return "Open dispute";
    case "resolveDispute":
      return "Resolve dispute";
    case "completeContract":
      return "Mark contract finished";
    case "startHourlySession":
      return "Start work";
    case "stopHourlySession":
      return "Stop work";
    case "endHourlyContract":
      return "End hourly contract";
  }
}

export function confirmTitle(
  action: UiAction,
  context?: { workUnitStatus?: WorkUnitStatus }
): string {
  if (action === "voidStaleRevision") return "End expired revision?";
  if (action === "openDispute") return "Open dispute?";
  if (action === "stopHourlySession") return "Stop work?";
  if (action === "endHourlyContract") return "End hourly contract?";
  if (action === "settleTrialAndEnd") return "Pay trial & don't continue?";
  if (action === "finalizeTrialReviewTimeout") return "Finalize expired trial review?";
  if (action === "expireAcceptance") return "Expire offer?";
  if (action === "expireActivation") return "End expired activation?";
  if (action === "declineContract") return "Decline offer?";
  if (action === "rejectActivation") return `${actionLabel(action, context)}?`;
  return actionLabel(action, context);
}

/** Client method on StreamPayV2Client used by the matching UI action. */
export function clientMethodForAction(action: UiAction): string {
  switch (action) {
    case "addMilestone":
      return "addMilestone";
    case "finalizeTerms":
      return "finalizeTerms";
    case "acceptContract":
      return "acceptContract";
    case "declineContract":
      return "declineContract";
    case "expireAcceptance":
      return "expireAcceptance";
    case "expireActivation":
      return "expireActivation";
    case "approveActivation":
      return "approveActivation";
    case "rejectActivation":
      return "rejectActivation";
    case "submitTrialWork":
      return "submitTrialWork";
    case "requestTrialRevision":
      return "requestTrialRevision";
    case "approveTrialAndActivate":
      return "approveTrialAndActivate";
    case "settleTrialAndEnd":
      return "settleTrialAndEnd";
    case "finalizeTrialReviewTimeout":
      return "finalizeTrialReviewTimeout";
    case "submitWorkUnit":
      return "submitWorkUnit";
    case "requestWorkRevision":
      return "requestWorkRevision";
    case "approveWorkUnit":
      return "approveWorkUnit";
    case "voidStaleRevision":
      return "voidStaleRevision";
    case "finalizeReviewTimeout":
      return "finalizeReviewTimeout";
    case "releaseStreamAccrual":
      return "releaseStreamAccrual";
    case "cancelActiveContract":
      return "cancelActiveContract";
    case "withdrawFreelancer":
      return "withdrawFreelancer";
    case "claimEmployerRefund":
      return "claimEmployerRefund";
    case "openDispute":
      return "openDispute";
    case "resolveDispute":
      return "resolveDispute";
    case "completeContract":
      return "completeContract";
    case "startHourlySession":
      return "startHourlySession";
    case "stopHourlySession":
      return "stopHourlySession";
    case "endHourlyContract":
      return "endHourlyContract";
  }
}

export function isEconomicAction(action: UiAction): boolean {
  return (
    action === "cancelActiveContract" ||
    action === "withdrawFreelancer" ||
    action === "claimEmployerRefund" ||
    action === "openDispute" ||
    action === "resolveDispute" ||
    action === "completeContract" ||
    action === "approveWorkUnit" ||
    action === "approveTrialAndActivate" ||
    action === "settleTrialAndEnd" ||
    action === "finalizeTrialReviewTimeout" ||
    action === "releaseStreamAccrual" ||
    action === "finalizeReviewTimeout" ||
    action === "declineContract" ||
    action === "expireAcceptance" ||
    action === "expireActivation" ||
    action === "rejectActivation" ||
    action === "stopHourlySession" ||
    action === "endHourlyContract"
  );
}

export function needsConfirmation(action: UiAction): boolean {
  return (
    isEconomicAction(action) ||
    action === "submitWorkUnit" ||
    action === "submitTrialWork" ||
    action === "requestTrialRevision" ||
    action === "voidStaleRevision"
  );
}

export function terminalMutationActions(
  wallet: PublicKey,
  contract: ContractView,
  now: number
): UiAction[] {
  return availableActions({ wallet, contract, now }).filter(
    (action) =>
      action === "withdrawFreelancer" ||
      action === "claimEmployerRefund" ||
      action === "resolveDispute"
  );
}

export function typeBlurb(type: PaymentModeName): string {
  return CONTRACT_TYPE_GUIDES[type].selectedExplanation;
}

export type OfficialDeliverableCopy = {
  title: string;
  intro: string;
  fieldLabel: string;
  fieldHint: string;
  reviewPeriodLabel: string;
  reviewPeriod: string;
  revisionRequestsLabel: string;
  revisionRequests: string;
  consequences: readonly string[];
  acknowledgement: string;
  messagesHint: string;
  recordedReference: string;
};

/**
 * Official Fixed/Milestone submission copy. Review numbers come from the
 * contract account. Does not describe file-content proofs the program does not
 * make.
 */
export function officialDeliverableCopy(
  contract: Pick<ContractView, "reviewDuration" | "maxRevisions">
): OfficialDeliverableCopy {
  return {
    title: actionLabel("submitWorkUnit"),
    intro:
      "This is your official submission for employer review. It is different from sending a message or draft.",
    fieldLabel: "Final project / deliverable link",
    fieldHint:
      "Paste a link to the final project, file, repository, design, deployment, or other deliverable. Maximum 200 characters. PREMIFLOW does not host the file.",
    reviewPeriodLabel: "Review period",
    reviewPeriod: formatReviewPeriod(contract.reviewDuration),
    revisionRequestsLabel: "Revision requests allowed",
    revisionRequests: String(contract.maxRevisions),
    consequences: [
      "Employer review begins.",
      "Normal contract cancellation is blocked while this deliverable is under review.",
      "The employer may approve, request a revision, or open a dispute.",
      "Submitting does not immediately transfer payment.",
      "Approved or released payment is withdrawn separately.",
    ],
    acknowledgement:
      "By submitting, you confirm this is the version you want the employer to review.",
    messagesHint:
      "Drafts and progress updates belong in Messages. Use this action only when you are ready to start official review.",
    recordedReference:
      "Your main work link, or a note that you uploaded a file, is saved with the contract so both sides can see what was submitted.",
  };
}

export type CompleteContractCopy = {
  intro: string;
  points: readonly string[];
  wallet: string;
  notPayment: string;
};

export type VoidStaleRevisionCopy = {
  title: string;
  points: readonly string[];
  wallet: string;
};

export function voidStaleRevisionCopy(): VoidStaleRevisionCopy {
  return {
    title: "End expired revision?",
    points: [
      "The revision deadline has passed.",
      "This marks this deliverable as Void.",
      "It does not approve or release payment.",
      "It does not transfer or refund tokens.",
      "After it succeeds, this revision cannot be resubmitted.",
      "The contract remains Active.",
      "Other contract actions may become available depending on the remaining contract state.",
    ],
    wallet: "Phantom will ask for approval.",
  };
}

export type RevisionDeadlinePresentation = {
  heading: string;
  deadlineLabel: string;
  deadlineText: string;
  remainingText: string;
  detail: string;
  expired: boolean;
};

/**
 * Uses WorkUnit.actionDeadline only. Does not derive a deadline from review_duration.
 */
export function revisionDeadlinePresentation(input: {
  actionDeadline: number;
  now: number;
  role: ContractRole;
}): RevisionDeadlinePresentation | null {
  if (input.actionDeadline <= 0) return null;
  const expired = input.now >= input.actionDeadline;
  const remainingText = formatRevisionRemaining(input.actionDeadline, input.now);
  const deadlineText = formatUnix(input.actionDeadline);
  if (input.role === "freelancer") {
    return {
      heading: expired ? "Revision deadline passed" : "Revision requested",
      deadlineLabel: "Resubmit by",
      deadlineText,
      remainingText,
      detail: expired
        ? "The employer can now end this revision. You may still try to resubmit until that action is confirmed on-chain."
        : "Employer requested changes to this deliverable. Submit the revised official deliverable before the deadline.",
      expired,
    };
  }
  if (input.role === "employer") {
    return {
      heading: expired ? "Revision deadline passed" : "Waiting for revised deliverable",
      deadlineLabel: "Revision deadline",
      deadlineText,
      remainingText,
      detail: expired
        ? "You can end this expired revision without approving, releasing, transferring, or refunding tokens."
        : "Waiting for the freelancer to submit a revised official deliverable.",
      expired,
    };
  }
  return {
    heading: expired ? "Revision deadline passed" : "Revision requested",
    deadlineLabel: "Revision deadline",
    deadlineText,
    remainingText,
    detail: "",
    expired,
  };
}

export function revisionsUsedLabel(used: number, maximum: number): string {
  return `${used} / ${maximum}`;
}

export type VoidDeliverableCopy = {
  heading: string;
  body: string;
  contractNote: string | null;
  nextStep: string | null;
};

/**
 * Void is unit-local. Cancel-to-settle wording is Fixed-only, and only when
 * cancel is already allowed and successful completion is not.
 */
export function voidDeliverableCopy(input: {
  contract: Pick<
    ContractView,
    | "status"
    | "paymentMode"
    | "openReviewCount"
    | "workUnitCount"
    | "releasedUnitCount"
    | "allocatedAmount"
    | "mainAmount"
    | "trialAmount"
    | "endTime"
  >;
  unit: Pick<WorkUnitView, "status">;
  now?: number;
}): VoidDeliverableCopy | null {
  if (input.unit.status !== "Void") return null;
  const body = workUnitStatusDetail("Void") ?? "";
  if (input.contract.status !== "Active") {
    return {
      heading: "Revision ended",
      body,
      contractNote: null,
      nextStep: null,
    };
  }
  const cancelAvailable = input.contract.openReviewCount === 0;
  const completionAvailable = mayAttemptCompletion(input.contract, input.now ?? 0);
  const nextStep =
    input.contract.paymentMode === "Fixed" &&
    cancelAvailable &&
    !completionAvailable
      ? "The employer can now cancel the contract to begin settlement."
      : null;
  return {
    heading: "Revision ended",
    body,
    contractNote: "The contract is still active.",
    nextStep,
  };
}

export function completeContractCopy(): CompleteContractCopy {
  return {
    intro:
      "Completing the contract records the final settlement on-chain and marks the agreement terminal.",
    points: [
      "Records final settlement amounts from current on-chain accounting.",
      "Does not transfer tokens.",
      "Does not withdraw funds.",
      "Does not refund funds.",
      "Moves the contract into terminal Completed status.",
    ],
    wallet: "Your wallet will ask you to approve this transaction.",
    notPayment:
      "This does not pay the freelancer. Tokens leave escrow only when Collect pay is sent.",
  };
}

export type WithdrawFreelancerCopy = {
  intro: string;
  released: string;
  withdrawn: string;
  remaining: string;
  points: readonly string[];
  wallet: string;
};

export function withdrawFreelancerCopy(
  released: string,
  withdrawn: string,
  remaining: string
): WithdrawFreelancerCopy {
  return {
    intro:
      "Withdraw transfers already-released tokens from the contract escrow to your token account.",
    released,
    withdrawn,
    remaining,
    points: [
      "Released amount is an accounting credit. Withdrawn amount is tokens that have already left escrow.",
      "Approving work, releasing after timeout, or completing the contract does not itself move SPL tokens.",
      "This withdraws only the currently claimable remainder.",
    ],
    wallet: "Phantom will request transaction approval.",
  };
}

export function splitTrialUnits(units: WorkUnitView[]): {
  trial: WorkUnitView | null;
  main: WorkUnitView[];
} {
  const trial = units.find((u) => u.kind === "Trial") ?? null;
  const main = units
    .filter((u) => u.kind !== "Trial")
    .sort((a, b) => a.index - b.index);
  return { trial, main };
}
