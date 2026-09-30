import { PublicKey } from "@solana/web3.js";

import { toDatetimeLocalValue } from "@/lib/app/datetime";
import {
  assertResolverDistinct,
  findResolver,
  lockedCreatePayment,
} from "@/lib/app/premiflow";
import { canonicalHourlyEarned } from "@/lib/streampay-v2/hourly";
import { parseAuthorizedTime, parseEngagementDuration } from "@/lib/app/hourly-ux";
import {
  uiAmountToBaseUnits,
  type AuthorizedTimeUnit,
  type PaymentModeName,
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
  paymentMode: PaymentModeName;
  freelancer: string;
  resolver: string;
  mint: string;
  decimals: number;
  totalAmountUi: string;
  hourlyRateUi: string;
  authorizedTimeValue: string;
  authorizedTimeUnit: AuthorizedTimeUnit;
  engagementDurationValue: string;
  engagementDurationUnit: AuthorizedTimeUnit;
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

export function withLockedCreatePayment(draft: CreateWizardDraft): CreateWizardDraft {
  const locked = lockedCreatePayment();
  return {
    ...draft,
    mint: locked.mint.toBase58(),
    resolver: locked.resolver.address.toBase58(),
    decimals: locked.decimals,
  };
}

/** Mint, resolver, and decimals come from trusted config, never from the form. */
export function applyCreateDraftPatch(
  prev: CreateWizardDraft,
  partial: Partial<CreateWizardDraft>
): CreateWizardDraft {
  const { mint: _mint, resolver: _resolver, decimals: _decimals, ...unlocked } = partial;
  const merged = { ...prev, ...unlocked };
  if (merged.paymentMode === "Hourly") {
    const engagement = parseEngagementDuration(
      merged.engagementDurationValue,
      merged.engagementDurationUnit
    );
    if (engagement.seconds) merged.durationSeconds = engagement.seconds;
  }
  return withLockedCreatePayment(merged);
}

export function defaultCreateDraft(): CreateWizardDraft {
  return withLockedCreatePayment({
    paymentMode: "Fixed",
    freelancer: "",
    resolver: "",
    mint: "",
    decimals: 0,
    totalAmountUi: "",
    hourlyRateUi: "",
    authorizedTimeValue: "8",
    authorizedTimeUnit: "hours",
    engagementDurationValue: "1",
    engagementDurationUnit: "days",
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
  });
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

/**
 * Party validation that does not require an employer wallet yet.
 * Used while an authenticated PREMIFLOW user is drafting a contract.
 */
export function validateDraftParties(
  freelancerRaw: string,
  resolverRaw: string
): FieldErrors {
  const errors: FieldErrors = {};
  const freelancer = tryParsePubkey(freelancerRaw);
  const resolver = tryParsePubkey(resolverRaw);

  if (!freelancer) {
    errors.freelancer = "Enter a valid freelancer wallet.";
  }

  if (!resolver) {
    errors.resolver = "A PREMIFLOW resolver is not configured.";
  } else if (!findResolver(resolver)) {
    errors.resolver = "Choose a supported PREMIFLOW resolver.";
  } else if (freelancer && resolver.equals(freelancer)) {
    errors.resolver = "Resolver must be different from the freelancer.";
  }

  return errors;
}

/**
 * Full on-chain party validation once the employer wallet is known.
 */
export function validateParties(
  employer: PublicKey,
  freelancerRaw: string,
  resolverRaw: string
): FieldErrors {
  const errors = validateDraftParties(freelancerRaw, resolverRaw);
  const freelancer = tryParsePubkey(freelancerRaw);
  const resolver = tryParsePubkey(resolverRaw);

  if (freelancer && freelancer.equals(employer)) {
    errors.freelancer = "Freelancer must be different from the connected wallet.";
  }

  if (resolver && findResolver(resolver)) {
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

/**
 * Parse the resolver's freelancer award from a UI decimal string.
 * Allows zero (Rust accepts `0..=contested`). Rejects empty, signed,
 * non-decimal, excess precision, and NaN-like input before Phantom.
 */
export function parseDisputeAwardInput(
  awardUi: string,
  decimals: number,
  contestedAmount: bigint
): { amount?: bigint; error?: string } {
  const trimmed = awardUi.trim();
  if (trimmed.length === 0) {
    return { error: "Enter the freelancer award from the disputed amount." };
  }
  if (trimmed === "NaN" || trimmed === "Infinity" || trimmed === "-Infinity") {
    return { error: "Award is not a valid number." };
  }
  try {
    const amount = uiAmountToBaseUnits(trimmed, decimals);
    const invalid = validateDisputeAward(amount, contestedAmount);
    if (invalid) return { error: invalid };
    return { amount };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Award is invalid.",
    };
  }
}

function validateCreateDraftWithPartyErrors(
  errors: FieldErrors,
  draft: CreateWizardDraft,
  nowSeconds: number
): FieldErrors {
  try {
    const locked = lockedCreatePayment();
    if (draft.mint !== locked.mint.toBase58()) {
      errors.mint = "Payment token is configured by PREMIFLOW and cannot be changed.";
    }
    if (draft.decimals !== locked.decimals) {
      errors.decimals = "Mint decimals must match the configured PREMIFLOW token.";
    }
    if (draft.resolver !== locked.resolver.address.toBase58()) {
      errors.resolver = "Resolver is configured by PREMIFLOW and cannot be changed.";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "PREMIFLOW payment configuration is missing.";
    if (!errors.mint) errors.mint = message;
    if (!errors.resolver) errors.resolver = message;
  }
  if (!Number.isInteger(draft.decimals) || draft.decimals < 0 || draft.decimals > 18) {
    errors.decimals = "Mint decimals must be between 0 and 18.";
  }

  let hourlyMain = 0n;
  if (draft.paymentMode === "Hourly") {
    const rate = validateAmountUi(draft.hourlyRateUi, draft.decimals, "Hourly rate");
    if (rate.error) errors.hourlyRateUi = rate.error;
    const authorized = parseAuthorizedTime(
      draft.authorizedTimeValue,
      draft.authorizedTimeUnit
    );
    if (authorized.error) errors.authorizedTimeValue = authorized.error;
    if (rate.amount && authorized.seconds) {
      try {
        hourlyMain = canonicalHourlyEarned(rate.amount, BigInt(authorized.seconds));
        if (hourlyMain === 0n) {
          errors.hourlyRateUi =
            "This rate and authorized time produce a zero work budget.";
        }
      } catch (err) {
        errors.hourlyRateUi =
          err instanceof Error ? err.message : "Hourly budget is invalid.";
      }
    }
  } else {
    const total = validateAmountUi(draft.totalAmountUi, draft.decimals, "Amount");
    if (total.error) errors.totalAmountUi = total.error;
  }

  let trial = 0n;
  if (draft.trialEnabled) {
    const parsed = validateAmountUi(draft.trialAmountUi, draft.decimals, "Trial amount");
    if (parsed.error) errors.trialAmountUi = parsed.error;
    else trial = parsed.amount ?? 0n;
    if (draft.paymentMode !== "Hourly") {
      const total = validateAmountUi(draft.totalAmountUi, draft.decimals, "Amount");
      if (total.amount && trial >= total.amount) {
        errors.trialAmountUi = "Trial must be less than the total funded amount.";
      }
    }
  }

  if (draft.title.trim().length === 0) errors.title = "Add a short title.";
  if (draft.description.trim().length === 0) {
    errors.description = "Describe the work.";
  }

  if (draft.paymentMode === "Hourly") {
    const engagement = parseEngagementDuration(
      draft.engagementDurationValue,
      draft.engagementDurationUnit
    );
    if (engagement.error) {
      errors.engagementDurationValue = engagement.error;
    } else if (
      engagement.seconds != null &&
      (engagement.seconds < MIN_DURATION_SECONDS ||
        engagement.seconds > MAX_DURATION_SECONDS)
    ) {
      errors.engagementDurationValue = `Engagement window must be between ${MIN_DURATION_SECONDS}s and ${MAX_DURATION_SECONDS}s.`;
    }
  } else if (
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

  if (draft.paymentMode === "Milestone") {
    const total = validateAmountUi(draft.totalAmountUi, draft.decimals, "Amount");
    if (!total.amount) {
      return errors;
    }
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

/**
 * Validate a contract draft before an employer wallet has been connected.
 * This keeps normal drafting/review validation active without granting any
 * on-chain authority.
 */
export function validateCreateDraftBase(
  draft: CreateWizardDraft,
  nowSeconds: number
): FieldErrors {
  return validateCreateDraftWithPartyErrors(
    validateDraftParties(draft.freelancer, draft.resolver),
    draft,
    nowSeconds
  );
}

/**
 * Full create validation used once the employer wallet is known.
 */
export function validateCreateDraft(
  employer: PublicKey,
  draft: CreateWizardDraft,
  nowSeconds: number
): FieldErrors {
  return validateCreateDraftWithPartyErrors(
    validateParties(employer, draft.freelancer, draft.resolver),
    draft,
    nowSeconds
  );
}

export function employerRemainder(
  contestedAmount: bigint,
  freelancerAward: bigint
): bigint {
  if (freelancerAward > contestedAmount) return 0n;
  return contestedAmount - freelancerAward;
}
