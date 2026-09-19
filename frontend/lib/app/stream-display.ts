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
  "Streaming pay accrues automatically with time while the contract is active. Recording earned pay does not transfer tokens. The freelancer collects available pay separately.";

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
  earnedSoFar: "Earned so far",
  alreadyRecorded: "Recorded for collection",
  alreadyCollected: "Already collected",
  availableToCollect: "Available to collect",
  remainingEscrow: "Remaining escrow",
} as const;
