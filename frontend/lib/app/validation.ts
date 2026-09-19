import { PublicKey } from "@solana/web3.js";

import { toDatetimeLocalValue } from "@/lib/app/datetime";
import {
  assertResolverDistinct,
  defaultPaymentToken,
  defaultResolver,
  findPaymentToken,
  findResolver,
} from "@/lib/app/premiflow";
import {
  uiAmountToBaseUnits,
  type ContractType,
  type StartMode,
} from "@/lib/streampay-v2";
import {
  MAX_ACCEPTANCE_WINDOW,
  MAX_ACTIVATION_REVIEW,
  MAX_DURATION_SECONDS,
  MAX_MILESTONES,
  MAX_REVIEW_DURATION,
  MAX_REVISIONS_LIMIT,
  MAX_URI_LEN,
  MIN_ACTIVATION_REVIEW,
  MIN_DURATION_SECONDS,
  MIN_REVIEW_DURATION,
} from "@/lib/streampay-v2/constants";

export type MilestoneDraft = {
  label: string;
  amountUi: string;
  dueOffsetSeconds: number;
};

export type CreateWizardDraft = {
  paymentMode: ContractType;
  freelancer: string;
  resolver: string;
  mint: string;
  decimals: number;
  totalAmountUi: string;
  trialEnabled: boolean;
  trialAmountUi: string;
  startMode: StartMode;
  scheduledStartLocal: string;
  durationSeconds: number;
  checkpointInterval: number;
  reviewDuration: number;
  activationReviewDuration: number;
  maxRevisions: number;
  acceptanceDeadlineLocal: string;
  title: string;
  description: string;
  deliverables: string;
  milestones: MilestoneDraft[];
};

export function defaultCreateDraft(): CreateWizardDraft {
  const token = defaultPaymentToken();
  const resolver = defaultResolver();
  return {
    paymentMode: "Fixed",
    freelancer: "",
    resolver: resolver.address.toBase58(),
    mint: token.mint.toBase58(),
    decimals: token.decimals,
    totalAmountUi: "",
    trialEnabled: false,
    trialAmountUi: "",
    startMode: "OnActivation",
    scheduledStartLocal: "",
    durationSeconds: 86_400,
    checkpointInterval: 3_600,
    reviewDuration: 3_600,
    activationReviewDuration: 3_600,
    maxRevisions: 2,
    acceptanceDeadlineLocal: toDatetimeLocalValue(172_800),
    title: "",
    description: "",
    deliverables: "",
    milestones: [
      { label: "Milestone 1", amountUi: "", dueOffsetSeconds: 43_200 },
    ],
  };
}

export type FieldErrors = Record<string, string>;

export function parsePubkey(raw: string, label: string): PublicKey {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  try {
    return new PublicKey(trimmed);
  } catch {
    throw new Error(`${label} is not a valid Solana address`);
  }
}

export function tryParsePubkey(raw: string): PublicKey | null {
  try {
    return new PublicKey(raw.trim());
  } catch {
    return null;
  }
}

export function validateParties(
  employer: PublicKey,
  freelancerRaw: string,
  resolverRaw: string
): FieldErrors {
  const errors: FieldErrors = {};
  const freelancer = tryParsePubkey(freelancerRaw);
  const resolver = tryParsePubkey(resolverRaw);
  if (!freelancer) errors.freelancer = "Enter a valid freelancer wallet.";
  else if (freelancer.equals(employer)) {
    errors.freelancer = "Freelancer must be different from the connected wallet.";
  }
  if (!resolver) errors.resolver = "A PREMIFLOW resolver is not configured.";
  else if (!findResolver(resolver)) {
    errors.resolver = "Choose a supported PREMIFLOW resolver.";
  } else {
    const distinct = assertResolverDistinct(resolver, employer, freelancer);
    if (distinct) errors.resolver = distinct;
  }
  return errors;
}

export function validateAmountUi(
  amountUi: string,
  decimals: number,
  label: string
): { amount?: bigint; error?: string } {
  try {
    const amount = uiAmountToBaseUnits(amountUi, decimals);
    if (amount === 0n) return { error: `${label} must be greater than zero.` };
    return { amount };
  } catch (err) {
    return { error: err instanceof Error ? err.message : `${label} is invalid.` };
  }
}

export type MilestoneAllocation = {
  allocated: bigint;
  remaining: bigint;
  errors: FieldErrors;
};

export function validateMilestoneAllocation(
  milestones: MilestoneDraft[],
  mainAmount: bigint,
  decimals: number,
  durationSeconds: number
): MilestoneAllocation {
  const errors: FieldErrors = {};
  if (milestones.length === 0) {
    errors.milestones = "Add at least one milestone.";
    return { allocated: 0n, remaining: mainAmount, errors };
  }
  if (milestones.length > MAX_MILESTONES) {
    errors.milestones = `At most ${MAX_MILESTONES} milestones.`;
  }

  let allocated = 0n;
  let lastDue = 0;
  milestones.forEach((m, i) => {
    if (!m.label.trim()) {
      errors[`milestone-${i}-label`] = "Give this milestone a name.";
    }
    const parsed = validateAmountUi(m.amountUi, decimals, "Amount");
    if (parsed.error) {
      errors[`milestone-${i}-amount`] = parsed.error;
    } else if (parsed.amount) {
      allocated += parsed.amount;
    }
    if (!Number.isInteger(m.dueOffsetSeconds) || m.dueOffsetSeconds <= 0) {
      errors[`milestone-${i}-due`] = "Due offset must be a positive number of seconds.";
    } else if (m.dueOffsetSeconds > durationSeconds) {
      errors[`milestone-${i}-due`] = "Due offset cannot exceed the contract duration.";
    } else if (m.dueOffsetSeconds <= lastDue) {
      errors[`milestone-${i}-due`] = "Each milestone must be due later than the previous one.";
    } else {
      lastDue = m.dueOffsetSeconds;
    }
  });

  if (allocated > mainAmount) {
    errors.milestones = "Allocated amounts exceed the main contract value.";
  }

  return {
    allocated,
    remaining: mainAmount > allocated ? mainAmount - allocated : 0n,
    errors,
  };
}

export function milestonesFullyAllocated(
  milestones: MilestoneDraft[],
  mainAmount: bigint,
  decimals: number,
  durationSeconds: number
): boolean {
  const result = validateMilestoneAllocation(
    milestones,
    mainAmount,
    decimals,
    durationSeconds
  );
  return (
    Object.keys(result.errors).length === 0 && result.allocated === mainAmount
  );
}

export function validateDisputeAward(
  freelancerAward: bigint,
  contestedAmount: bigint
): string | null {
  if (freelancerAward < 0n) return "Award cannot be negative.";
  if (freelancerAward > contestedAmount) {
    return "Award cannot exceed the contested amount.";
  }
  return null;
}

export function validateCreateDraft(
  employer: PublicKey,
  draft: CreateWizardDraft,
  nowSeconds: number
): FieldErrors {
  const errors = validateParties(employer, draft.freelancer, draft.resolver);
  if (!tryParsePubkey(draft.mint) || !findPaymentToken(draft.mint)) {
    errors.mint = "Select a supported PREMIFLOW payment token.";
  } else {
    const token = findPaymentToken(draft.mint);
    if (token && draft.decimals !== token.decimals) {
      errors.decimals = "Mint decimals must match the selected PREMIFLOW token.";
    }
  }
  if (!Number.isInteger(draft.decimals) || draft.decimals < 0 || draft.decimals > 18) {
    errors.decimals = "Mint decimals must be between 0 and 18.";
  }

  const total = validateAmountUi(draft.totalAmountUi, draft.decimals, "Amount");
  if (total.error) errors.totalAmountUi = total.error;

  let trial = 0n;
  if (draft.trialEnabled) {
    const parsed = validateAmountUi(draft.trialAmountUi, draft.decimals, "Trial amount");
    if (parsed.error) errors.trialAmountUi = parsed.error;
    else trial = parsed.amount ?? 0n;
    if (total.amount && trial >= total.amount) {
      errors.trialAmountUi = "Trial must be less than the total funded amount.";
    }
  }

  if (draft.title.trim().length === 0) errors.title = "Add a short title.";
  if (draft.description.trim().length === 0) {
    errors.description = "Describe the work.";
  }

  if (
    draft.durationSeconds < MIN_DURATION_SECONDS ||
    draft.durationSeconds > MAX_DURATION_SECONDS
  ) {
    errors.durationSeconds = `Duration must be between ${MIN_DURATION_SECONDS}s and ${MAX_DURATION_SECONDS}s.`;
  }
  if (
    draft.reviewDuration < MIN_REVIEW_DURATION ||
    draft.reviewDuration > MAX_REVIEW_DURATION
  ) {
    errors.reviewDuration = "Review window is outside the permitted range.";
  }
  if (
    draft.activationReviewDuration < MIN_ACTIVATION_REVIEW ||
    draft.activationReviewDuration > MAX_ACTIVATION_REVIEW
  ) {
    errors.activationReviewDuration =
      "Activation review window is outside the permitted range.";
  }
  if (draft.maxRevisions < 0 || draft.maxRevisions > MAX_REVISIONS_LIMIT) {
    errors.maxRevisions = `Revisions must be 0–${MAX_REVISIONS_LIMIT}.`;
  }

  if (draft.paymentMode === "Streaming") {
    if (draft.checkpointInterval <= 0) {
      errors.checkpointInterval = "Checkpoint interval must be positive.";
    } else if (draft.durationSeconds % draft.checkpointInterval !== 0) {
      errors.checkpointInterval =
        "Checkpoint interval must divide the duration evenly.";
    }
  }

  const acceptance = Date.parse(draft.acceptanceDeadlineLocal);
  if (Number.isNaN(acceptance)) {
    errors.acceptanceDeadlineLocal = "Set an acceptance deadline.";
  } else {
    const seconds = Math.floor(acceptance / 1000);
    if (seconds <= nowSeconds) {
      errors.acceptanceDeadlineLocal = "Acceptance deadline must be in the future.";
    } else if (seconds - nowSeconds > MAX_ACCEPTANCE_WINDOW) {
      errors.acceptanceDeadlineLocal = "Acceptance window is too long.";
    }
  }

  if (draft.startMode === "Scheduled") {
    const start = Date.parse(draft.scheduledStartLocal);
    if (Number.isNaN(start)) {
      errors.scheduledStartLocal = "Set a scheduled start.";
    } else if (!Number.isNaN(acceptance) && start / 1000 < acceptance / 1000) {
      errors.scheduledStartLocal =
        "Scheduled start must not precede the acceptance deadline.";
    }
  }

  if (draft.paymentMode === "Milestone" && total.amount) {
    const main = total.amount - trial;
    const alloc = validateMilestoneAllocation(
      draft.milestones,
      main,
      draft.decimals,
      draft.durationSeconds
    );
    Object.assign(errors, alloc.errors);
    if (Object.keys(alloc.errors).length === 0 && alloc.allocated !== main) {
      errors.milestones = "Milestone amounts must sum to the main contract value.";
    }
  }

  if (draft.deliverables.length > MAX_URI_LEN * 4) {
    errors.deliverables = "Keep the deliverables list shorter.";
  }

  return errors;
}

export function employerRemainder(
  contestedAmount: bigint,
  freelancerAward: bigint
): bigint {
  if (freelancerAward > contestedAmount) return 0n;
  return contestedAmount - freelancerAward;
}
