/**
 * PREMIFLOW platform fee: display helpers for create review and contract
 * summaries. Display only; never feeds a transaction. All math is base-unit
 * bigint via `lib/streampay-v2/fees.ts` (mirrors the on-chain `fees.rs`).
 *
 * Business rule: the freelancer receives the full agreed amount. The employer
 * funds the agreed amount plus the PREMIFLOW fee on top.
 */
import {
  DEFAULT_PLATFORM_FEE_BPS,
  employerTotal,
  feeReserveFor,
} from "@/lib/streampay-v2/fees";
import type { PaymentModeName } from "@/lib/streampay-v2";

export const PLATFORM_FEE_NAME = "PREMIFLOW fee";
/** Intended launch fee shown at create time (on-chain FeeConfig is authoritative). */
export const INTENDED_PLATFORM_FEE_BPS = DEFAULT_PLATFORM_FEE_BPS;

export const EMPLOYER_FEE_NOTE =
  "You fund the agreed amount plus the PREMIFLOW fee. The freelancer receives the full agreed amount.";
export const FREELANCER_FEE_NOTE =
  "You receive the full agreed amount. The employer pays the PREMIFLOW fee separately, on top of the agreed amount.";

export type PlatformFeeSummary = {
  /** Principal the freelancer can receive in full. */
  agreedAmount: bigint;
  fee: bigint;
  employerTotal: bigint;
  feeBps: number;
  /** False for contracts without a fee (e.g. older feeBps = 0 contracts). */
  charged: boolean;
};

/** Integer bps to a percent label: 300 -> "3%", 250 -> "2.5%", 125 -> "1.25%". */
export function feePercentLabel(bps: number): string {
  const safe = Number.isInteger(bps) && bps > 0 ? bps : 0;
  const whole = Math.trunc(safe / 100);
  const frac = safe % 100;
  if (frac === 0) return `${whole}%`;
  const digits = String(frac).padStart(2, "0").replace(/0$/, "");
  return `${whole}.${digits}%`;
}

export function feeRowLabel(bps: number): string {
  return `${PLATFORM_FEE_NAME} (${feePercentLabel(bps)})`;
}

/**
 * Create-time summary. `principal` is the full funded principal the protocol
 * escrows: Fixed/Milestone/Streaming total (stream principal, not accrual);
 * Hourly maximum work budget + trial. Never the hourly rate.
 */
export function createFeeSummary(
  principal: bigint,
  feeBps: number = INTENDED_PLATFORM_FEE_BPS
): PlatformFeeSummary {
  const agreed = principal > 0n ? principal : 0n;
  const fee = feeReserveFor(agreed, feeBps);
  return {
    agreedAmount: agreed,
    fee,
    employerTotal: employerTotal(agreed, feeBps),
    feeBps,
    charged: fee > 0n,
  };
}

/** Summary for an existing contract from its on-chain fee fields. */
export function contractFeeSummary(contract: {
  totalAmount: bigint;
  feeBps?: number;
  feeReserve?: bigint;
}): PlatformFeeSummary {
  const bps = contract.feeBps ?? 0;
  if (!bps) {
    return {
      agreedAmount: contract.totalAmount,
      fee: 0n,
      employerTotal: contract.totalAmount,
      feeBps: 0,
      charged: false,
    };
  }
  const fee = contract.feeReserve ?? feeReserveFor(contract.totalAmount, bps);
  return {
    agreedAmount: contract.totalAmount,
    fee,
    employerTotal: contract.totalAmount + fee,
    feeBps: bps,
    charged: fee > 0n,
  };
}

/** Label for the principal row per mode. */
export function agreedAmountLabel(mode: PaymentModeName, hasTrial: boolean): string {
  if (mode === "Hourly") {
    return hasTrial ? "Agreed amount (max budget + trial)" : "Agreed amount (max budget)";
  }
  if (mode === "Streaming") return "Agreed amount (full stream)";
  return "Agreed amount";
}
