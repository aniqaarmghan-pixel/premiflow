import type { ContractStatus } from "@/lib/streampay-v2";

import type { OffchainWorkflowStatus, PartyStatementRecord } from "../stores";

/**
 * Off-chain workflow is organizational only.
 *
 * Mapping:
 * - awaiting_statements: Disputed on-chain and fewer than two party statements.
 * - ready_for_resolver: Disputed on-chain and both employer and freelancer have
 *   submitted statements. Missing statements never block resolve_dispute.
 * - under_review: reserved for R4 resolver review. Not auto-set in R2.
 * - settlement_submitted: reserved for later settlement-intent tracking. Not
 *   auto-set in R2. A DB event of this type is NOT proof a transaction succeeded.
 *
 * Resolved MUST be taken from on-chain Contract.status. Never show "Resolved"
 * merely because the database workflow or resolvedAt column says so.
 *
 * Never show "Paid". Claim progress is derived from on-chain withdrawnAmount
 * and refundedAmount compared with frozen settlement fields.
 */
export type ChainPayoutState =
  | "not_resolved"
  | "unclaimed"
  | "partially_claimed"
  | "claims_complete";

export type DisplayedResolutionStatus = {
  chainStatus: ContractStatus;
  workflowStatus: OffchainWorkflowStatus;
  resolvedFromChain: boolean;
  payoutState: ChainPayoutState;
};

export function workflowFromStatements(
  statements: readonly Pick<PartyStatementRecord, "partyRole">[]
): OffchainWorkflowStatus {
  const roles = new Set(statements.map((row) => row.partyRole));
  if (roles.has("employer") && roles.has("freelancer")) {
    return "ready_for_resolver";
  }
  return "awaiting_statements";
}

export function payoutStateFromChain(facts: {
  status: ContractStatus;
  withdrawnAmount: string;
  refundedAmount: string;
  freelancerSettlementAmount: string;
  employerRefundableAmount: string;
}): ChainPayoutState {
  if (facts.status !== "Resolved") return "not_resolved";
  const withdrawn = BigInt(facts.withdrawnAmount);
  const refunded = BigInt(facts.refundedAmount);
  const freelancerDue = BigInt(facts.freelancerSettlementAmount);
  const employerDue = BigInt(facts.employerRefundableAmount);
  const freelancerDone = freelancerDue === 0n || withdrawn >= freelancerDue;
  const employerDone = employerDue === 0n || refunded >= employerDue;
  if (freelancerDone && employerDone) return "claims_complete";
  if (withdrawn > 0n || refunded > 0n) return "partially_claimed";
  return "unclaimed";
}

export function displayedResolutionStatus(
  chainStatus: ContractStatus,
  workflowStatus: OffchainWorkflowStatus,
  payout: ChainPayoutState
): DisplayedResolutionStatus {
  return {
    chainStatus,
    workflowStatus,
    resolvedFromChain: chainStatus === "Resolved",
    payoutState: payout,
  };
}

export function chainSupportsResolutionCase(status: ContractStatus): boolean {
  return status === "Disputed" || status === "Resolved";
}
