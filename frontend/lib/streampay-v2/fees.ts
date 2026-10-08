/**
 * Platform fee math mirroring `programs/streampay/src/v2/fees.rs`.
 * Integer-only bigint math; employer pays the fee, freelancer gets 100% of principal.
 */
export const FEE_BPS_DENOMINATOR = 10_000n;
export const MAX_FEE_BPS = 1_000;
export const DEFAULT_PLATFORM_FEE_BPS = 300;
const U64_MAX = (1n << 64n) - 1n;

function checkU64(v: bigint): bigint {
  if (v < 0n || v > U64_MAX) throw new RangeError("value out of u64 range");
  return v;
}

/** floor(amount * feeBps / 10_000) */
export function feeOn(amount: bigint, feeBps: number): bigint {
  if (!Number.isInteger(feeBps) || feeBps < 0 || BigInt(feeBps) > FEE_BPS_DENOMINATOR) {
    throw new RangeError("invalid fee bps");
  }
  return checkU64((checkU64(amount) * BigInt(feeBps)) / FEE_BPS_DENOMINATOR);
}

export function feeReserveFor(principal: bigint, feeBps: number): bigint {
  return feeOn(principal, feeBps);
}

/** Principal + fee reserve the employer funds at creation. */
export function employerTotal(principal: bigint, feeBps: number): bigint {
  return checkU64(principal + feeReserveFor(principal, feeBps));
}

export function feeDueOnRelease(
  newWithdrawn: bigint,
  feePaid: bigint,
  feeReserve: bigint,
  feeBps: number
): bigint {
  const owed = feeOn(newWithdrawn, feeBps);
  if (owed > feeReserve) throw new RangeError("fee exceeds reserve");
  if (owed < feePaid) throw new RangeError("fee already overpaid");
  return owed - feePaid;
}

export function unearnedFeeReturned(
  totalPrincipal: bigint,
  refunded: bigint,
  feeReserve: bigint,
  feeBps: number
): bigint {
  if (refunded > totalPrincipal) throw new RangeError("refund exceeds principal");
  const keep = feeOn(totalPrincipal - refunded, feeBps);
  if (keep > feeReserve) throw new RangeError("fee exceeds reserve");
  return feeReserve - keep;
}

export function feeRefundDue(
  totalPrincipal: bigint,
  oldRefunded: bigint,
  newRefunded: bigint,
  feeReserve: bigint,
  feeBps: number
): bigint {
  const after = unearnedFeeReturned(totalPrincipal, newRefunded, feeReserve, feeBps);
  const before = unearnedFeeReturned(totalPrincipal, oldRefunded, feeReserve, feeBps);
  if (after < before) throw new RangeError("refund decreased");
  return after - before;
}

/* ---------------- Plans (mirror programs/streampay/src/v2/fees.rs) ---------------- */

export type PlanTier = "Free" | "Pro" | "Premium";
export const PLAN_TIERS: readonly PlanTier[] = ["Free", "Pro", "Premium"];
/** Free plan pays the configured base rate (3%). */
export const FREE_FEE_BPS = DEFAULT_PLATFORM_FEE_BPS;
export const PRO_FEE_BPS = 100;
export const PREMIUM_FEE_BPS = 0;
/** The contract stores the freelancer rate in one byte, in units of 10 bps. */
export const FREELANCER_FEE_RATE_UNIT_BPS = 10;

/** Each participant's own plan sets only their own rate (program-determined on-chain). */
export function planFeeBps(tier: PlanTier, baseBps: number = DEFAULT_PLATFORM_FEE_BPS): number {
  if (tier === "Premium") return PREMIUM_FEE_BPS;
  if (tier === "Pro") return Math.min(PRO_FEE_BPS, baseBps);
  return baseBps;
}

/** Decode the frozen `freelancer_fee_rate` byte (0 on pre-upgrade contracts = no freelancer fee). */
export function freelancerFeeRateBps(rate: number | undefined | null): number {
  return Math.max(0, Math.trunc(rate ?? 0)) * FREELANCER_FEE_RATE_UNIT_BPS;
}

/**
 * Freelancer fee for one withdrawal: fee on cumulative gross principal withdrawn
 * after, minus fee on cumulative principal withdrawn before. Telescopes, so the
 * total never drifts or double-charges, and unreceived principal is never charged.
 */
export function freelancerFeeDue(withdrawnBefore: bigint, withdrawnAfter: bigint, bps: number): bigint {
  if (withdrawnAfter < withdrawnBefore) throw new RangeError("withdrawn amount cannot decrease");
  return feeOn(withdrawnAfter, bps) - feeOn(withdrawnBefore, bps);
}

/** Freelancer net for a gross amount at a rate (integer base units). */
export function freelancerNet(gross: bigint, bps: number): bigint {
  return gross - feeOn(gross, bps);
}

/** Mirrors Rust `freelancer_fee_rate_for`: floor to 10-bps steps, capped at MAX_FEE_BPS. */
export function freelancerFeeRateFor(bps: number): number {
  const capped = Math.min(Math.max(0, Math.trunc(bps)), MAX_FEE_BPS);
  return Math.min(Math.floor(capped / FREELANCER_FEE_RATE_UNIT_BPS), 255);
}

/**
 * Exactly what `create_contract` / `create_hourly_contract` freeze, from the
 * same inputs the program reads: the on-chain FeeConfig `fee_bps` (0 when the
 * FeeConfig account is absent) and each wallet's effective on-chain plan.
 * Employer bps are stored as-is; the freelancer rate is stored in 10-bps steps.
 */
export function createContractFeeRates(params: {
  baseFeeBps: number;
  employerTier: PlanTier;
  freelancerTier: PlanTier;
}): { employerFeeBps: number; freelancerFeeBps: number } {
  const base = Math.min(Math.max(0, Math.trunc(params.baseFeeBps)), MAX_FEE_BPS);
  return {
    employerFeeBps: planFeeBps(params.employerTier, base),
    freelancerFeeBps: freelancerFeeRateBps(freelancerFeeRateFor(planFeeBps(params.freelancerTier, base))),
  };
}
