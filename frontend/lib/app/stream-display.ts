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
