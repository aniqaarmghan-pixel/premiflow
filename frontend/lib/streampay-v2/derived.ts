import { PublicKey } from "@solana/web3.js";

import {
  allowsSettlementClaims,
  type ContractRole,
  type ContractStatus,
  type ContractType,
  type ContractView,
  type WorkUnitStatus,
  type WorkUnitView,
} from "./types";

export type WalletContractSets = {
  asEmployer: ContractView[];
  asFreelancer: ContractView[];
};

export function roleForContract(
  wallet: PublicKey,
  contract: Pick<ContractView, "employer" | "freelancer" | "resolver">
): ContractRole {
  if (wallet.equals(contract.employer)) return "employer";
  if (wallet.equals(contract.freelancer)) return "freelancer";
  if (wallet.equals(contract.resolver)) return "resolver";
  return "none";
}

/**
 * Partition contracts by this wallet's role. A wallet may appear in both
 * employer and freelancer sets at once; role is per contract, never global.
 */
export function partitionContractsByRole(
  wallet: PublicKey,
  contracts: ContractView[]
): WalletContractSets {
  const asEmployer: ContractView[] = [];
  const asFreelancer: ContractView[] = [];
  for (const contract of contracts) {
    if (wallet.equals(contract.employer)) asEmployer.push(contract);
    if (wallet.equals(contract.freelancer)) asFreelancer.push(contract);
  }
  return { asEmployer, asFreelancer };
}

function saturatingSub(left: bigint, right: bigint): bigint {
  return left >= right ? left - right : 0n;
}

/**
 * Display/UX remainder matching Rust `freeze_for_dispute` contested math:
 * `total_amount - released_amount - refunded_amount`.
 * Streaming freeze materializes accrual first; this helper does not.
 */
export function contestedRemainder(
  contract: Pick<ContractView, "totalAmount" | "releasedAmount" | "refundedAmount">
): bigint {
  return saturatingSub(
    contract.totalAmount,
    contract.releasedAmount + contract.refundedAmount
  );
}

/**
 * Remaining freelancer SPL the program would currently allow to withdraw.
 * Display/UX only — the program is authoritative.
 */
export function remainingFreelancerClaim(contract: ContractView): bigint {
  if (contract.status === "Active") {
    return saturatingSub(contract.releasedAmount, contract.withdrawnAmount);
  }
  if (allowsSettlementClaims(contract.status)) {
    return saturatingSub(
      contract.freelancerSettlementAmount,
      contract.withdrawnAmount
    );
  }
  return 0n;
}

/**
 * Remaining employer refund after a frozen settlement.
 * Active contracts have no refund path.
 */
export function remainingEmployerRefund(contract: ContractView): bigint {
  if (!allowsSettlementClaims(contract.status)) return 0n;
  return saturatingSub(
    contract.employerRefundableAmount,
    contract.refundedAmount
  );
}

/**
 * Floor(main_amount * elapsed / duration). Matches Rust `canonical_stream_accrued`.
 * DISPLAY ONLY. Never pass this result as a settlement instruction argument.
 */
export function estimateStreamAccrualDisplayOnly(
  mainAmount: bigint,
  startTime: number,
  endTime: number,
  now: number
): bigint {
  if (now <= startTime) return 0n;
  const duration = BigInt(endTime) - BigInt(startTime);
  if (duration <= 0n) {
    throw new Error("invalid stream duration");
  }
  if (now >= endTime) return mainAmount;
  const elapsed = BigInt(now) - BigInt(startTime);
  return (mainAmount * elapsed) / duration;
}

export function estimatedStreamAccrualForContract(
  contract: ContractView,
  now: number
): bigint {
  if (contract.paymentMode !== "Streaming") return 0n;
  if (contract.status !== "Active" && contract.status !== "Cancelled") {
    if (contract.startTime === 0) return 0n;
  }
  if (contract.startTime === 0 || contract.endTime === 0) return 0n;
  return estimateStreamAccrualDisplayOnly(
    contract.mainAmount,
    contract.startTime,
    contract.endTime,
    now
  );
}

export function isStreamCurrentlyAccruing(
  contract: ContractView,
  now: number
): boolean {
  return (
    contract.paymentMode === "Streaming" &&
    contract.status === "Active" &&
    contract.startTime > 0 &&
    now >= contract.startTime &&
    now < contract.endTime
  );
}

export function isReviewDeadlineActive(
  workUnit: WorkUnitView,
  now: number
): boolean {
  return workUnit.status === "Submitted" && now < workUnit.actionDeadline;
}

/**
 * UX heuristic for whether `complete_contract` is worth showing.
 * The program still decides eligibility.
 */
export function mayAttemptCompletion(
  contract: ContractView,
  now: number
): boolean {
  if (contract.status !== "Active") return false;
  if (contract.paymentMode === "Streaming") {
    return now >= contract.endTime && contract.endTime > 0;
  }
  if (contract.openReviewCount !== 0) return false;
  if (contract.workUnitCount === 0) return false;
  if (contract.allocatedAmount !== contract.mainAmount) return false;
  const trialUnits = contract.trialAmount > 0n ? 1 : 0;
  return contract.releasedUnitCount === contract.workUnitCount + trialUnits;
}

export function contractStatusLabel(status: ContractStatus): string {
  switch (status) {
    case "Draft":
      return "Draft";
    case "PendingAcceptance":
      return "Pending freelancer acceptance";
    case "PendingEmployerApproval":
      return "Pending employer activation";
    case "Active":
      return "Active";
    case "Completed":
      return "Completed";
    case "Declined":
      return "Declined";
    case "Expired":
      return "Expired";
    case "Cancelled":
      return "Cancelled";
    case "ActivationRejected":
      return "Activation rejected";
    case "Disputed":
      return "Disputed";
    case "Resolved":
      return "Resolved";
  }
}

export function paymentModeLabel(mode: ContractType): string {
  switch (mode) {
    case "Streaming":
      return "Streaming";
    case "Milestone":
      return "Milestone";
    case "Fixed":
      return "Fixed";
  }
}

export function workUnitStatusLabel(status: WorkUnitStatus): string {
  switch (status) {
    case "Defined":
      return "Awaiting submission";
    case "Submitted":
      return "Under review";
    case "Revising":
      return "Revision requested";
    case "Released":
      return "Released";
    case "Void":
      return "Void";
  }
}
