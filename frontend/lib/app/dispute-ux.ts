import type { PublicKey } from "@solana/web3.js";

import { findResolver, resolverLabel } from "@/lib/app/premiflow";
import {
  isStreamEnded,
  projectedContestedRemainder,
  projectedFinalStreamClaim,
  remainingEmployerRefund,
  remainingFreelancerClaim,
  type ContractRole,
  type ContractView,
  type UiAction,
} from "@/lib/streampay-v2";
import type { ParsedClientError } from "@/lib/streampay-v2/errors";

export const OPEN_DISPUTE_TITLE = "Open dispute?";

export const OPEN_DISPUTE_COPY = {
  lead: "This will freeze the contract for dispute resolution.",
  noTransfer: "No tokens are transferred by opening the dispute.",
  noRefund: "Opening the dispute does not refund the employer.",
  noPay: "Opening the dispute does not pay the freelancer.",
  resolver:
    "The designated resolver will decide how the disputed amount is divided between the employer and freelancer.",
  releasedStay:
    "Already released amounts remain part of the contract's existing accounting.",
  wallet: "Phantom will ask you to approve the transaction.",
  contestedLabel: "Amount currently subject to dispute",
  streamingNote:
    "For an active Streaming contract, accrued pay is accounted for before the remaining amount becomes disputed. The program uses on-chain time, so this displayed amount can change before confirmation.",
} as const;

export const DISPUTED_STATE_COPY = {
  heading: "Dispute in progress",
  frozen: "This contract is frozen while the dispute is being resolved.",
  noTransfer: "Opening the dispute did not transfer tokens.",
  next: "The designated resolver records how the disputed amount is divided. After that, the freelancer collects any claimable pay and the employer claims any refund.",
} as const;

export const RESOLVE_DISPUTE_COPY = {
  heading: "Resolve dispute",
  youAre: "You are the designated resolver for this contract.",
  decides:
    "The resolver decides how the disputed settlement is allocated between the freelancer and employer.",
  noEscrow:
    "Resolving records settlement accounting. It does not send the escrow to the resolver.",
  inputLabel: "Freelancer award from disputed amount",
  inputHint:
    "Enter how much of the disputed amount should be added to the freelancer settlement. The rest of the disputed amount becomes employer-refundable. Zero is allowed and awards the entire disputed amount to the employer.",
  wallet: "Phantom will ask you to approve the transaction.",
  collectAfter:
    "After resolution, the freelancer must use Collect pay to move claimable tokens to their wallet.",
  refundAfter:
    "After resolution, the employer must use Claim refund to move refundable tokens to their wallet.",
} as const;

export const POST_RESOLUTION_COLLECT_COPY = {
  intro:
    "The resolver recorded your settlement. Collect pay transfers your claimable tokens from escrow to your wallet.",
  wallet: "Phantom will ask you to approve the transfer.",
} as const;

export const POST_RESOLUTION_REFUND_COPY = {
  intro:
    "The resolver recorded the employer refund. Claim refund transfers the claimable tokens from escrow to your wallet.",
  wallet: "Phantom will ask you to approve the transfer.",
} as const;

export const DISPUTE_LIFECYCLE_STEPS = [
  "Employer or freelancer opens a dispute. The contract becomes Disputed. No tokens move.",
  "The designated resolver records how the disputed amount is divided. That records settlement; it does not transfer tokens.",
  "If the freelancer has claimable pay, they collect it from escrow.",
  "If the employer has a refundable amount, they claim it from escrow.",
] as const;

export type ResolverPresentation = {
  roleTitle: string;
  displayName: string;
  address: string;
  isTrustedLabel: boolean;
};

export function presentResolver(address: string | PublicKey): ResolverPresentation {
  const raw = typeof address === "string" ? address : address.toBase58();
  const trusted = findResolver(address);
  return {
    roleTitle: "Designated resolver",
    displayName: trusted ? trusted.name : resolverLabel(address),
    address: raw,
    isTrustedLabel: trusted != null,
  };
}

/**
 * Display/UX contested remainder. Streaming + Active uses the same projected
 * materialization already used to gate Open dispute. Not a guaranteed on-chain
 * result: Solana Clock can move before confirmation.
 */
export function displayContestedAmount(contract: ContractView, now: number): bigint {
  if (contract.status === "Disputed" || contract.status === "Resolved") {
    return contract.contestedAmount;
  }
  return projectedContestedRemainder(contract, now);
}

export type OpenDisputePresentation = {
  title: string;
  lead: string;
  points: readonly string[];
  contestedLabel: string;
  contestedAmount: bigint;
  streamingNote: string | null;
  clockCanChange: boolean;
  wallet: string;
  canSubmit: boolean;
};

export function openDisputePresentation(
  contract: ContractView,
  now: number
): OpenDisputePresentation {
  const contestedAmount = displayContestedAmount(contract, now);
  const streamingActive =
    contract.paymentMode === "Streaming" && contract.status === "Active";
  return {
    title: OPEN_DISPUTE_TITLE,
    lead: OPEN_DISPUTE_COPY.lead,
    points: [
      OPEN_DISPUTE_COPY.noTransfer,
      OPEN_DISPUTE_COPY.noRefund,
      OPEN_DISPUTE_COPY.noPay,
      OPEN_DISPUTE_COPY.resolver,
      OPEN_DISPUTE_COPY.releasedStay,
    ],
    contestedLabel: OPEN_DISPUTE_COPY.contestedLabel,
    contestedAmount,
    streamingNote: streamingActive ? OPEN_DISPUTE_COPY.streamingNote : null,
    clockCanChange: streamingActive,
    wallet: OPEN_DISPUTE_COPY.wallet,
    canSubmit: contestedAmount > 0n,
  };
}

export type ResolutionPreview = {
  contestedAmount: bigint;
  freelancerFromDispute: bigint;
  employerFromDispute: bigint;
  freelancerFinal: bigint;
  employerFinal: bigint;
  freelancerStillToCollect: bigint;
  employerStillToRefund: bigint;
  valid: boolean;
};

/**
 * Preview of `apply_dispute_resolution`. Award is the freelancer share of
 * `contested_amount`. Employer share is the remainder. No tokens move.
 */
export function resolutionPreview(
  contract: Pick<
    ContractView,
    | "contestedAmount"
    | "releasedAmount"
    | "refundedAmount"
    | "withdrawnAmount"
  >,
  freelancerContestedAward: bigint
): ResolutionPreview {
  const contestedAmount = contract.contestedAmount;
  const valid =
    freelancerContestedAward >= 0n && freelancerContestedAward <= contestedAmount;
  const freelancerFromDispute = valid ? freelancerContestedAward : 0n;
  const employerFromDispute = valid
    ? contestedAmount - freelancerContestedAward
    : 0n;
  const freelancerFinal = valid
    ? contract.releasedAmount + freelancerFromDispute
    : contract.releasedAmount;
  const employerFinal = valid
    ? contract.refundedAmount + employerFromDispute
    : contract.refundedAmount;
  const freelancerStillToCollect =
    freelancerFinal > contract.withdrawnAmount
      ? freelancerFinal - contract.withdrawnAmount
      : 0n;
  const employerStillToRefund =
    employerFinal > contract.refundedAmount
      ? employerFinal - contract.refundedAmount
      : 0n;
  return {
    contestedAmount,
    freelancerFromDispute,
    employerFromDispute,
    freelancerFinal,
    employerFinal,
    freelancerStillToCollect,
    employerStillToRefund,
    valid,
  };
}

export function shouldOfferOpenDispute(
  role: ContractRole,
  actions: readonly UiAction[]
): boolean {
  return (
    (role === "employer" || role === "freelancer") &&
    actions.includes("openDispute")
  );
}

export function shouldOfferResolveDispute(
  role: ContractRole,
  actions: readonly UiAction[]
): boolean {
  return role === "resolver" && actions.includes("resolveDispute");
}

export function postResolutionCollectAvailable(contract: ContractView): boolean {
  return (
    contract.status === "Resolved" && remainingFreelancerClaim(contract) > 0n
  );
}

export function postResolutionRefundAvailable(contract: ContractView): boolean {
  return (
    contract.status === "Resolved" && remainingEmployerRefund(contract) > 0n
  );
}

export function contractCardNextHint(
  role: ContractRole,
  contract: ContractView,
  now = Math.floor(Date.now() / 1000)
): string {
  const { status, paymentMode } = contract;
  if (status === "PendingAcceptance" && now >= contract.acceptanceDeadline) {
    // accept_contract requires now < acceptance_deadline; decline and expire remain.
    if (role === "freelancer") return "Offer expired: decline to close it";
    if (role === "employer") return "Offer expired: expire it to reclaim funds";
  }
  if (status === "Draft" && role === "employer" && now >= contract.acceptanceDeadline) {
    return "Setup deadline passed: expire the draft to reclaim funds";
  }
  if (status === "PendingAcceptance" && role === "freelancer") {
    return "Next: accept or decline";
  }
  if (status === "PendingEmployerApproval" && role === "employer") {
    return "Next: review activation";
  }
  if (isStreamEnded(contract, now)) {
    const pending = projectedFinalStreamClaim(contract, now) > 0n;
    if (!pending) return "Stream ended: final pay collected";
    if (role === "freelancer") return "Next: collect final pay";
    if (role === "employer") return "Final payment awaiting freelancer collection";
    return "Streaming ended";
  }
  if (status === "Active" && paymentMode === "Streaming") {
    return "Next: watch the stream";
  }
  if (status === "Active" && role === "freelancer") {
    return "Next: submit work when ready";
  }
  if (status === "Active" && role === "employer") {
    return "Next: review deliverables";
  }
  if (status === "Disputed") {
    return role === "resolver"
      ? "Next: resolve the dispute"
      : "Next: waiting for the designated resolver";
  }
  if (status === "Resolved") {
    if (role === "freelancer" && remainingFreelancerClaim(contract) > 0n) {
      return "Next: collect pay";
    }
    if (role === "employer" && remainingEmployerRefund(contract) > 0n) {
      return "Next: claim refund";
    }
    return "Dispute resolved";
  }
  if (status === "Completed" || status === "Cancelled") {
    return "Next: withdraw or refund remaining claims";
  }
  return "Open contract";
}

export const DISPUTE_STATE_CHANGED_MESSAGE =
  "The contract state changed before this action was confirmed. Refresh and review the latest contract state.";

export const DISPUTE_NOTHING_REMAINS_MESSAGE =
  "Nothing remains to dispute. Accrued or already released amounts may now cover the funded total. Refresh and review the latest contract state.";

export const DISPUTE_UNAUTHORIZED_OPEN_MESSAGE =
  "Only the employer or freelancer on this contract can open a dispute.";

export const DISPUTE_UNAUTHORIZED_RESOLVE_MESSAGE =
  "Only the designated resolver can resolve this dispute.";

export const DISPUTE_INVALID_AWARD_MESSAGE =
  "The freelancer award must be between zero and the disputed amount.";

const OPEN_DISPUTE_RACE_CODES = [6111, 6113, 6156, 6159, 6160] as const;
const RESOLVE_DISPUTE_RACE_CODES = [6111, 6113] as const;

export function withDisputeRaceMessage(
  action: string | undefined,
  parsed: ParsedClientError
): ParsedClientError {
  if (!action) return parsed;

  if (action === "openDispute") {
    if (parsed.code === 6118) {
      return { ...parsed, uiMessage: DISPUTE_UNAUTHORIZED_OPEN_MESSAGE };
    }
    if (parsed.code === 6159) {
      return { ...parsed, uiMessage: DISPUTE_NOTHING_REMAINS_MESSAGE };
    }
    if (parsed.code !== undefined && (OPEN_DISPUTE_RACE_CODES as readonly number[]).includes(parsed.code)) {
      return { ...parsed, uiMessage: DISPUTE_STATE_CHANGED_MESSAGE };
    }
  }

  if (action === "resolveDispute") {
    if (parsed.code === 6118) {
      return { ...parsed, uiMessage: DISPUTE_UNAUTHORIZED_RESOLVE_MESSAGE };
    }
    if (parsed.code === 6161) {
      return { ...parsed, uiMessage: DISPUTE_INVALID_AWARD_MESSAGE };
    }
    if (
      parsed.code !== undefined &&
      (RESOLVE_DISPUTE_RACE_CODES as readonly number[]).includes(parsed.code)
    ) {
      return { ...parsed, uiMessage: DISPUTE_STATE_CHANGED_MESSAGE };
    }
  }

  return parsed;
}

export function shouldRefreshAfterDisputeFailure(action: UiAction): boolean {
  return action === "openDispute" || action === "resolveDispute";
}

export function resolverCopyImpliesEscrowReceipt(text: string): boolean {
  return /resolver (receives|received|is paid|holds escrow|gets the escrow)/i.test(
    text
  );
}
