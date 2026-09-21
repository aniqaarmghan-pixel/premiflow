import { PublicKey } from "@solana/web3.js";

import { CONTRACT_TYPE_GUIDES } from "@/lib/app/contract-type-guide";
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
  mayAttemptCompletion,
  paymentModeLabel,
  remainingEmployerRefund,
  remainingFreelancerClaim,
  roleForContract,
  streamDurationSeconds,
  streamElapsedSeconds,
  streamRemainingSeconds,
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

export { roleForContract };

export type RoleFilter = "all" | "hiring" | "working";
export type StatusFilter = "all" | ContractStatus;

export type GroupedContracts = {
  all: ContractView[];
  hiring: ContractView[];
  working: ContractView[];
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
        : grouped.all;
  if (status === "all") return base;
  return base.filter((c) => c.status === status);
}

export function presentStatus(status: ContractStatus): string {
  return contractStatusLabel(status);
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
};

/**
 * Streaming contract-detail dashboard. Amounts are display-only.
 * Earned so far uses the same floor formula as Rust `canonical_stream_accrued`.
 */
export function streamingDashboard(
  contract: ContractView,
  now: number
): StreamingDashboard {
  const durationSeconds = streamDurationSeconds(contract);
  const progress = financialProgress(contract);
  return {
    totalFundedStream: contract.mainAmount,
    durationSeconds,
    startTime: contract.startTime,
    endTime: contract.endTime,
    elapsedSeconds: streamElapsedSeconds(contract, now),
    remainingSeconds: streamRemainingSeconds(contract, now),
    equivalentHourlyRate: equivalentHourlyRateDisplayOnly(
      contract.mainAmount,
      durationSeconds
    ),
    earnedSoFar: estimatedStreamAccrualForContract(contract, now),
    alreadyRecorded: contract.releasedAmount,
    alreadyCollected: contract.withdrawnAmount,
    availableToCollect: remainingFreelancerClaim(contract),
    remainingEscrow: progress.remainingInEscrow,
  };
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
};

export function dashboardSummary(
  wallet: PublicKey,
  grouped: GroupedContracts
): DashboardSummary {
  let pendingReviews = 0;
  let availableToWithdraw = 0n;
  let availableRefund = 0n;
  let streamingActive = 0;
  let active = 0;

  for (const contract of grouped.all) {
    if (contract.status === "Active") active += 1;
    pendingReviews += contract.openReviewCount;
    if (roleForContract(wallet, contract) === "freelancer") {
      availableToWithdraw += remainingFreelancerClaim(contract);
    }
    if (roleForContract(wallet, contract) === "employer") {
      availableRefund += remainingEmployerRefund(contract);
    }
    if (contract.paymentMode === "Streaming" && contract.status === "Active") {
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
      return "Release accrued pay";
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
    recordedReference: "The submission reference is recorded with the contract.",
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
