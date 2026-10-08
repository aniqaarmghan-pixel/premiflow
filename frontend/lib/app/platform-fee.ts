/**
 * PREMIFLOW platform fee: display helpers for create review and contract
 * summaries. Display only; never feeds a transaction. All math is base-unit
 * bigint via `lib/streampay-v2/fees.ts` (mirrors the on-chain `fees.rs`).
 *
 * Business rule (symmetric, plan-based): each participant's own plan sets only
 * their own fee. The employer funds the contract amount plus the employer fee;
 * the freelancer fee is deducted from principal actually withdrawn. Rates are
 * frozen on-chain at contract creation. Pre-upgrade contracts carry no
 * freelancer fee.
 */
import {
  DEFAULT_PLATFORM_FEE_BPS,
  employerTotal,
  feeOn,
  feeReserveFor,
} from "@/lib/streampay-v2/fees";
import type { PaymentModeName } from "@/lib/streampay-v2";

export const PLATFORM_FEE_NAME = "PREMIFLOW platform fee";
/** Free-plan rate shown at create time (on-chain plan + FeeConfig are authoritative). */
export const INTENDED_PLATFORM_FEE_BPS = DEFAULT_PLATFORM_FEE_BPS;

export const EMPLOYER_FEE_NOTE =
  "Employer: you fund the contract amount plus your PREMIFLOW platform fee at your plan's rate.";
export const FREELANCER_FEE_NOTE =
  "Freelancer: your PREMIFLOW platform fee is deducted from principal you actually withdraw, at your plan's rate. Refunded or unreleased principal is never charged.";
export const LEGACY_FREELANCER_FEE_NOTE =
  "This contract was created before plan-based freelancer fees, so the freelancer receives the full released amount.";
export const CREATE_RATES_NOTE =
  "Rates come from the on-chain fee config and each wallet's current on-chain plan, the same sources the program reads. Both rates are frozen on-chain when the contract is created.";
export const CREATE_RATES_LOADING_NOTE = "Loading on-chain plan and fee rates\u2026";
export const CREATE_RATES_UNAVAILABLE_NOTE =
  "On-chain fee rates could not be loaded, so no rate is shown. The program sets both rates when the contract is created.";
export const FROZEN_RATES_NOTE = "Both rates were frozen when this contract was created.";
export const NETWORK_FEE_NOTE =
  "Solana network fees are separate from PREMIFLOW platform fees and are paid to the network.";

export type PlatformFeeSummary = {
  /** Gross contract principal. */
  agreedAmount: bigint;
  /** Employer platform fee (on top of principal). */
  fee: bigint;
  employerTotal: bigint;
  feeBps: number;
  /** Freelancer platform fee if the full principal is withdrawn (deducted). */
  freelancerFee: bigint;
  freelancerFeeBps: number;
  freelancerNet: bigint;
  /** False when neither side pays a platform fee (e.g. older feeBps = 0 contracts). */
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

/** Row label used on both sides: "Platform fee (3%)". */
export function feeRowLabel(bps: number): string {
  return `Platform fee (${feePercentLabel(bps)})`;
}

function summarize(agreed: bigint, fee: bigint, feeBps: number, freelancerFeeBps: number): PlatformFeeSummary {
  const freelancerFee = feeOn(agreed, freelancerFeeBps);
  return {
    agreedAmount: agreed,
    fee,
    employerTotal: agreed + fee,
    feeBps,
    freelancerFee,
    freelancerFeeBps,
    freelancerNet: agreed - freelancerFee,
    charged: fee > 0n || freelancerFee > 0n,
  };
}

/**
 * Create-time summary. `principal` is the full funded principal the protocol
 * escrows: Fixed/Milestone/Streaming total (stream principal, not accrual);
 * Hourly maximum work budget + trial. Never the hourly rate.
 */
export function createFeeSummary(
  principal: bigint,
  employerFeeBps: number = INTENDED_PLATFORM_FEE_BPS,
  freelancerFeeBps: number = INTENDED_PLATFORM_FEE_BPS
): PlatformFeeSummary {
  const agreed = principal > 0n ? principal : 0n;
  const fee = feeReserveFor(agreed, employerFeeBps);
  const summary = summarize(agreed, fee, employerFeeBps, freelancerFeeBps);
  return { ...summary, employerTotal: employerTotal(agreed, employerFeeBps) };
}

/** Summary for an existing contract from its frozen on-chain fee fields. */
export function contractFeeSummary(contract: {
  totalAmount: bigint;
  feeBps?: number;
  feeReserve?: bigint;
  freelancerFeeBps?: number;
}): PlatformFeeSummary {
  const bps = contract.feeBps ?? 0;
  const freelancerBps = contract.freelancerFeeBps ?? 0;
  const fee = bps ? (contract.feeReserve ?? feeReserveFor(contract.totalAmount, bps)) : 0n;
  return summarize(contract.totalAmount, fee, bps, freelancerBps);
}

/** Label for the principal row per mode. */
export function agreedAmountLabel(mode: PaymentModeName, hasTrial: boolean): string {
  if (mode === "Hourly") {
    return hasTrial ? "Contract amount (max budget + trial)" : "Contract amount (max budget)";
  }
  if (mode === "Streaming") return "Contract amount (full stream)";
  return "Contract amount";
}
