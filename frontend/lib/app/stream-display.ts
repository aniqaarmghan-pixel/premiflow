/**
 * Display-only stream accrual using millisecond elapsed time.
 * Never pass this result as a settlement instruction argument.
 */
export function estimateStreamAccrualDisplayMs(
  mainAmount: bigint,
  startTime: number,
  endTime: number,
  nowMs: number
): bigint {
  if (startTime <= 0 || endTime <= 0) return 0n;
  const startMs = startTime * 1000;
  const endMs = endTime * 1000;
  if (nowMs <= startMs) return 0n;
  const duration = BigInt(endMs - startMs);
  if (duration <= 0n) return 0n;
  if (nowMs >= endMs) return mainAmount;
  return (mainAmount * BigInt(nowMs - startMs)) / duration;
}

export const STREAMING_PAY_EXPLAINER =
  "Streaming pay accrues automatically with time while the contract is Active. Accrued value is a display estimate. Update earnings records newly accrued value as available for collection — it does not transfer tokens. Collect moves already released tokens from escrow to the freelancer wallet and does not end the stream.";

export const STREAMING_RELEASE_LABEL = "Update earnings";
export const STREAMING_RELEASE_HINT =
  "This records newly accrued streaming pay as available for collection. It does not transfer tokens.";
export const STREAMING_COLLECT_HINT =
  "Collect does not end the stream. While the contract stays Active, more pay can accrue, then be released and collected again.";
export const STREAMING_ZERO_AVAILABLE_HINT =
  "Zero available to collect does not mean the stream is complete while the contract remains Active.";

export const STREAMING_TRIAL_STARTED_HEADLINE =
  "Trial approved — main contract started.";

export const STREAMING_TRIAL_STARTED_BODY =
  "The trial amount was recorded for the freelancer and the streaming clock has started. Tokens remain in escrow until collected.";

export function streamingTrialStartedCopy(
  contract: Pick<
    { paymentMode: string; trialAmount: bigint; status: string; startTime: number },
    "paymentMode" | "trialAmount" | "status" | "startTime"
  >
): { headline: string; body: string } | null {
  if (contract.paymentMode !== "Streaming") return null;
  if (contract.trialAmount <= 0n) return null;
  if (contract.status !== "Active") return null;
  if (contract.startTime <= 0) return null;
  return {
    headline: STREAMING_TRIAL_STARTED_HEADLINE,
    body: STREAMING_TRIAL_STARTED_BODY,
  };
}

export const STREAMING_DASHBOARD_LABELS = {
  totalFundedStream: "Total funded stream amount",
  duration: "Contract duration",
  startTime: "Start time",
  endTime: "End time",
  elapsed: "Time elapsed",
  remaining: "Time remaining",
  hourlyRate: "Equivalent hourly rate",
  earnedSoFar: "Earned so far (accrued)",
  alreadyRecorded: "Released / recorded",
  alreadyCollected: "Collected",
  availableToCollect: "Available to collect",
  remainingEscrow: "Remaining escrow",
} as const;

/**
 * How the Streaming "earned" figure is derived. Only `estimate` (Active) uses the
 * live clock; every other status shows a frozen on-chain amount.
 */
export type StreamingEarnedBasis = "estimate" | "settled" | "disputed" | "frozen";

export const STREAMING_FROZEN_EARNED_LABELS = {
  settled: "Final earned (settled on-chain)",
  disputed: "Earned at dispute (released on-chain)",
  frozen: "Earned so far (not accruing)",
} as const;

export const STREAMING_FROZEN_NOTES = {
  settled:
    "Final on-chain freelancer settlement (includes any paid trial). The stream stopped when the contract ended and no longer accrues.",
  disputed:
    "Frozen at the amount released on-chain when the dispute opened. No further streaming pay accrues while Disputed.",
  frozen: "Streaming pay is not accruing in this status.",
} as const;

export const STREAMING_FROZEN_CLOCK_LABELS = {
  elapsed: "Time elapsed (stopped)",
  remaining: "Time left when stopped",
} as const;

export const STREAMING_CLOCK_NOT_RUNNING = "Not running";

export function streamingEarnedLabel(basis: StreamingEarnedBasis): string {
  return basis === "estimate"
    ? STREAMING_DASHBOARD_LABELS.earnedSoFar
    : STREAMING_FROZEN_EARNED_LABELS[basis];
}

export function streamingFrozenNote(basis: StreamingEarnedBasis): string | null {
  return basis === "estimate" ? null : STREAMING_FROZEN_NOTES[basis];
}

/** Streaming with a paid trial: the earned figure includes trial pay already released. */
export function streamingTrialIncludedNote(trialText: string): string {
  return `Includes trial pay of ${trialText} already released.`;
}

export const STREAMING_ENDED_LABEL = "Streaming ended";
export const STREAMING_COLLECT_FINAL_LABEL = "Collect final pay";
export const STREAMING_EMPLOYER_FINAL_AWAITING =
  "Final payment awaiting freelancer collection";
export const STREAMING_EMPLOYER_FINAL_COLLECTED =
  "Final streaming pay has been collected by the freelancer.";
export const STREAMING_ENDED_FREELANCER_HINT =
  "The stream reached its end time and stopped accruing. Collect final pay records the remaining earned pay up to the end time and transfers it to your wallet in one transaction.";
export const STREAMING_ENDED_FREELANCER_DONE =
  "The stream reached its end time. All earned pay has been collected.";
export const STREAMING_ENDED_EMPLOYER_HINT =
  "The stream reached its end time and stopped accruing. Earned pay is fixed at the end time and needs no approval. The freelancer collects it with their wallet.";
export const STREAMING_FINAL_EARNED_LABEL = "Final earned (at end time)";
export const STREAMING_FINAL_TO_COLLECT_LABEL = "Final pay to collect";

export function streamingStatusLabel(input: {
  live: boolean;
  ended: boolean;
  status: string;
}): string {
  if (input.ended) return STREAMING_ENDED_LABEL;
  if (input.live) return "Accruing";
  return input.status;
}

export function streamingEndedRoleCopy(
  role: string | undefined,
  finalClaimable: bigint
): { headline: string; body: string } | null {
  if (role === "freelancer") {
    return finalClaimable > 0n
      ? { headline: STREAMING_COLLECT_FINAL_LABEL, body: STREAMING_ENDED_FREELANCER_HINT }
      : { headline: STREAMING_ENDED_LABEL, body: STREAMING_ENDED_FREELANCER_DONE };
  }
  if (role === "employer") {
    return {
      headline:
        finalClaimable > 0n
          ? STREAMING_EMPLOYER_FINAL_AWAITING
          : STREAMING_EMPLOYER_FINAL_COLLECTED,
      body: STREAMING_ENDED_EMPLOYER_HINT,
    };
  }
  return null;
}
export const STREAMING_ENDED_SHORT_LABEL = "Ended";
