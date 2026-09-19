import { PublicKey } from "@solana/web3.js";

import { formatReviewPeriod } from "@/lib/app/datetime";
import {
  availableActions,
  contractStatusLabel,
  paymentModeLabel,
  remainingEmployerRefund,
  remainingFreelancerClaim,
  roleForContract,
  type ContractRole,
  type ContractStatus,
  type ContractType,
  type ContractView,
  type UiAction,
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

export function presentType(type: ContractType): string {
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
    if (disputed && !stage.reached) state = "blocked";
    else if (stage.reached && i < currentIndex) state = "done";
    else if (stage.reached && i === currentIndex) {
      state = finished && !disputed ? "done" : "current";
    } else if (stage.reached) state = "done";
    if (disputed && i === currentIndex) state = "blocked";
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

export function actionLabel(action: UiAction): string {
  switch (action) {
    case "addMilestone":
      return "Add milestone";
    case "finalizeTerms":
      return "Lock terms";
    case "acceptContract":
      return "Accept contract";
    case "declineContract":
      return "Decline";
    case "approveActivation":
      return "Activate";
    case "rejectActivation":
      return "Do not activate";
    case "submitTrialWork":
      return "Submit trial";
    case "requestTrialRevision":
      return "Request trial revision";
    case "approveTrialAndActivate":
      return "Approve trial & activate";
    case "submitWorkUnit":
      return "Submit official deliverable";
    case "requestWorkRevision":
      return "Request revision";
    case "approveWorkUnit":
      return "Approve work";
    case "finalizeReviewTimeout":
      return "Release after timeout";
    case "releaseStreamAccrual":
      return "Release accrued payment";
    case "cancelActiveContract":
      return "Cancel contract";
    case "withdrawFreelancer":
      return "Withdraw";
    case "claimEmployerRefund":
      return "Claim refund";
    case "openDispute":
      return "Open dispute";
    case "resolveDispute":
      return "Resolve dispute";
    case "completeContract":
      return "Complete contract";
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
    action === "releaseStreamAccrual" ||
    action === "finalizeReviewTimeout" ||
    action === "declineContract" ||
    action === "rejectActivation"
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

export function typeBlurb(type: ContractType): string {
  switch (type) {
    case "Fixed":
      return "One deliverable. One principal payment path, released after review.";
    case "Milestone":
      return "Several independently reviewed pieces of work, each with its own amount.";
    case "Streaming":
      return "Pay accrues with time while the contract is active. The program is the clock.";
  }
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
      "This does not pay the freelancer. Tokens leave escrow only when Withdraw is sent.",
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
