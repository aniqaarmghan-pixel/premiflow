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
