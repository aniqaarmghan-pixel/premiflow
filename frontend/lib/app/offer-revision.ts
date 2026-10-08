/**
 * Off-chain helpers for Request Changes ? Cancel & Revise ? Replacement Offer.
 * Never mutates funded PendingAcceptance terms on-chain. Chain cancel + new
 * create are separate; this module only tracks negotiation and prefill state.
 */
import type { CreateWizardDraft } from "@/lib/app/validation";
import type { IntentScope } from "@/lib/app/milestone-create-plan";
import type { ContractView } from "@/lib/streampay-v2";

export const OFFER_REVISION_COPY = {
  requestChangesTitle: "Need different terms before accepting?",
  requestChangesBody:
    "Request changes in the contract chat before accepting. Tell the employer exactly what should change ? amount, schedule, milestones, review window, or other terms.",
  requestChangesNote:
    "Negotiation message only. On-chain terms stay unchanged until the employer cancels this funded offer and sends a replacement. Requesting changes does not accept, decline, cancel, or move escrow funds.",
  changesRequestedEmployer:
    "Changes requested. The funded offer is unchanged. Cancel & Revise to return funds and send a replacement offer with a new contract id.",
  awaitingEmployerRevision:
    "Changes requested ? awaiting employer revision. The funded offer is still unchanged on-chain.",
  cancelReviseTitle: "Cancel & Revise",
  cancelReviseLead:
    "This cancels the funded offer so you can send a replacement. It does not change the existing on-chain terms in place.",
  cancelReviseFunds:
    "Your funded principal and any unearned platform fee reserve become refundable. Claim refund returns them to your wallet before you create a new offer.",
  cancelReviseNoDispute: "No dispute is opened. The resolver is not involved. Tokens do not move during cancel.",
  cancelReviseNewOffer:
    "After refund, Create opens with the previous terms prefilled. Create & Send Offer always makes a new contract id ? the cancelled offer is never reused.",
  revisedLabel: "Revised",
  cancelledLabel: "Cancelled",
  handoffTitle: "Replacement offer from cancelled terms",
  handoffNote:
    "Prefill only. Review every step. Create & Send Offer funds a new contract; the cancelled offer stays closed.",
  blockedByIntent:
    "Finish or discard your unfinished Create setup before starting a replacement offer. The cancelled offer was left refundable and was not revived.",
} as const;

const CHANGES_PREFIX = "premiflow:offer-changes-requested:v1:";
const REVISED_PREFIX = "premiflow:offer-revised-label:v1:";
const REVISE_HANDOFF_PREFIX = "premiflow:offer-revise-handoff:v1:";
const REVISE_HANDOFF_VERSION = 1 as const;

function changesKey(scope: IntentScope, contractAddress: string): string {
  return `${CHANGES_PREFIX}${scope.cluster}:${scope.programId}:${contractAddress}`;
}

function revisedKey(scope: IntentScope, contractAddress: string): string {
  return `${REVISED_PREFIX}${scope.cluster}:${scope.programId}:${contractAddress}`;
}

function handoffKey(scope: IntentScope, employer: string): string {
  return `${REVISE_HANDOFF_PREFIX}${scope.cluster}:${scope.programId}:${employer}`;
}

export function markOfferChangesRequested(
  storage: Storage | null,
  scope: IntentScope,
  contractAddress: string
): boolean {
  if (!storage || !contractAddress) return false;
  try {
    storage.setItem(changesKey(scope, contractAddress), String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

export function isOfferChangesRequested(
  storage: Storage | null,
  scope: IntentScope,
  contractAddress: string
): boolean {
  if (!storage || !contractAddress) return false;
  try {
    return storage.getItem(changesKey(scope, contractAddress)) != null;
  } catch {
    return false;
  }
}

export function clearOfferChangesRequested(
  storage: Storage | null,
  scope: IntentScope,
  contractAddress: string
): void {
  if (!storage || !contractAddress) return;
  try {
    storage.removeItem(changesKey(scope, contractAddress));
  } catch {
    /* ignore */
  }
}

export function markOfferRevised(
  storage: Storage | null,
  scope: IntentScope,
  cancelledAddress: string,
  replacementAddress: string
): boolean {
  if (!storage || !cancelledAddress || !replacementAddress) return false;
  try {
    storage.setItem(
      revisedKey(scope, cancelledAddress),
      JSON.stringify({ replacementAddress, at: Date.now() })
    );
    return true;
  } catch {
    return false;
  }
}

export function isOfferRevisedLabel(
  storage: Storage | null,
  scope: IntentScope,
  contractAddress: string
): boolean {
  if (!storage || !contractAddress) return false;
  try {
    return storage.getItem(revisedKey(scope, contractAddress)) != null;
  } catch {
    return false;
  }
}

export type ReviseHandoff = {
  version: typeof REVISE_HANDOFF_VERSION;
  revisedFrom: string;
  draft: CreateWizardDraft;
  savedAt: number;
};

export function saveReviseHandoff(
  storage: Storage | null,
  scope: IntentScope,
  employer: string,
  revisedFrom: string,
  draft: CreateWizardDraft
): boolean {
  if (!storage || !employer || !revisedFrom) return false;
  try {
    const payload: ReviseHandoff = {
      version: REVISE_HANDOFF_VERSION,
      revisedFrom,
      draft,
      savedAt: Date.now(),
    };
    storage.setItem(handoffKey(scope, employer), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadReviseHandoff(
  storage: Storage | null,
  scope: IntentScope,
  employer: string
): ReviseHandoff | null {
  if (!storage || !employer) return null;
  try {
    const raw = storage.getItem(handoffKey(scope, employer));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviseHandoff;
    if (parsed?.version !== REVISE_HANDOFF_VERSION || !parsed.revisedFrom || !parsed.draft) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearReviseHandoff(
  storage: Storage | null,
  scope: IntentScope,
  employer: string
): void {
  if (!storage || !employer) return;
  try {
    storage.removeItem(handoffKey(scope, employer));
  } catch {
    /* ignore */
  }
}

/** Build a create draft prefill from a cancelled PendingAcceptance-era contract. */
export function draftFromCancelledOffer(input: {
  contract: Pick<
    ContractView,
    | "freelancer"
    | "paymentMode"
    | "totalAmount"
    | "trialAmount"
    | "mainAmount"
    | "reviewDuration"
    | "activationReviewDuration"
    | "maxRevisions"
    | "acceptanceDeadline"
    | "createdAt"
    | "checkpointInterval"
    | "startMode"
  >;
  base: CreateWizardDraft;
  title: string;
  description: string;
  totalAmountUi: string;
  trialAmountUi: string;
}): CreateWizardDraft {
  const { contract, base } = input;
  return {
    ...base,
    freelancer: contract.freelancer.toBase58(),
    paymentMode: contract.paymentMode,
    totalAmountUi: input.totalAmountUi,
    trialEnabled: contract.trialAmount > 0n,
    trialAmountUi: input.trialAmountUi,
    reviewDuration: Number(contract.reviewDuration) || base.reviewDuration,
    activationReviewDuration:
      Number(contract.activationReviewDuration) || base.activationReviewDuration,
    maxRevisions: Number(contract.maxRevisions) || base.maxRevisions,
    checkpointInterval: Number(contract.checkpointInterval) || base.checkpointInterval,
    startMode: contract.startMode || base.startMode,
    title: input.title,
    description: input.description,
  };
}

export function presentOfferTerminalLabel(input: {
  status: string;
  revised: boolean;
}): string {
  if (input.status === "Cancelled" && input.revised) return OFFER_REVISION_COPY.revisedLabel;
  if (input.status === "Cancelled") return OFFER_REVISION_COPY.cancelledLabel;
  return input.status;
}
