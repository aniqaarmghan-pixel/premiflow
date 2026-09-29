import type { PublicKey } from "@solana/web3.js";

import {
  remainingEmployerRefund,
  remainingFreelancerClaim,
  type ContractRole,
  type ContractStatus,
  type ContractView,
} from "@/lib/streampay-v2";
import { baseUnitsToUiAmount } from "@/lib/streampay-v2/format";

import { formatUnix } from "./datetime";
import { formatTokenAmount } from "./money";
import { parseDisputeAwardInput } from "./validation";
import { presentStatus, presentType, type GroupedContracts } from "./view-model";

/**
 * Resolver (designated dispute resolver) UX helpers.
 *
 * Frontend visibility is never authorization: the program's
 * `has_one = resolver` constraint on resolve_dispute is authoritative. These
 * helpers only decide what to show and pre-check obvious mistakes before a
 * wallet prompt.
 */
export const RESOLVER_UX_COPY = {
  tab: "Resolver cases",
  assignedHeading: "Dispute assigned to you",
  assignedBody: "You are the designated resolver for this contract.",
  accountingHeading: "Contract, parties and accounting",
  settlementHeading: "Record settlement",
  settlementBody:
    "Split the amount under dispute between the freelancer and the employer. Your wallet signs resolve_dispute and the program re-checks that you are the designated resolver.",
  freelancerHint: "Added to the freelancer settlement.",
  employerHint: "Becomes employer-refundable.",
  decimalsLoading: "Loading token decimals. Settlement controls appear once exact amounts are available.",
  reviewSettlement: "Review settlement",
  settlementNoTransfer:
    "Recording a settlement does not move tokens. Afterwards the freelancer collects and the employer claims their refund.",
  partyClaimGuidance:
    "Next: the freelancer uses Collect pay for their settlement and the employer uses Claim refund. Tokens move only when they do.",
  settlementRecorded: "Settlement recorded",
  settlementRecordedBody:
    "The settlement is recorded on-chain. No tokens moved yet: the freelancer collects their claimable amount and the employer claims their refund from this contract.",
  overviewTitle: "Assigned disputes",
  openResolving: "Open resolver cases",
  noneAwaiting: "No disputes are awaiting your decision.",
  emptyTitle: "No assigned disputes",
  emptyBody: "Contracts appear here after they enter the dispute process and this wallet is their designated resolver.",
  noCase:
    "The parties have not created a case workspace yet. The on-chain facts on this page are authoritative.",
  visibilityNote:
    "Visibility in PREMIFLOW is not authorization. The program only accepts resolve_dispute from the on-chain resolver.",
} as const;

export type WalletContractRoles = {
  isEmployer: boolean;
  isFreelancer: boolean;
  isResolver: boolean;
};

type RoleFields = Pick<ContractView, "employer" | "freelancer" | "resolver">;

/** Roles from the confirmed on-chain Contract account; a wallet can hold several. */
export function contractRolesForWallet(
  wallet: PublicKey | null | undefined,
  contract: RoleFields
): WalletContractRoles {
  if (!wallet) return { isEmployer: false, isFreelancer: false, isResolver: false };
  return {
    isEmployer: contract.employer.equals(wallet),
    isFreelancer: contract.freelancer.equals(wallet),
    isResolver: contract.resolver.equals(wallet),
  };
}

const RESOLVER_STATUS_RANK: Partial<Record<ContractStatus, number>> = {
  Disputed: 0,
  Resolved: 1,
};

function statusRank(status: ContractStatus): number {
  return RESOLVER_STATUS_RANK[status] ?? 2;
}

/** Disputed first, then Resolved, then others; newest dispute first. */
export function sortResolverCases(cases: readonly ContractView[]): ContractView[] {
  return [...cases].sort((a, b) => {
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    if (a.disputedAt !== b.disputedAt) return b.disputedAt - a.disputedAt;
    return a.address.toBase58().localeCompare(b.address.toBase58());
  });
}

/** Contracts whose on-chain resolver is this wallet (deduped, sorted). */
export function resolverCasesForWallet(
  wallet: PublicKey | null | undefined,
  contracts: readonly ContractView[]
): ContractView[] {
  if (!wallet) return [];
  const seen = new Set<string>();
  const out: ContractView[] = [];
  for (const contract of contracts) {
    if (!contract.resolver.equals(wallet)) continue;
    // Only contracts that actually entered dispute belong in resolver case history.
    if (contract.disputedAt <= 0) continue;
    const key = contract.address.toBase58();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(contract);
  }
  return sortResolverCases(out);
}

/** Adds the Resolving set without changing All / Hiring / Working. */
export function withResolverCases(
  grouped: GroupedContracts,
  cases: readonly ContractView[]
): GroupedContracts {
  return { ...grouped, resolving: [...cases] };
}

export function assignedDisputeCount(cases: readonly ContractView[]): number {
  return cases.filter((contract) => contract.status === "Disputed").length;
}

export function shouldShowResolvingTab(caseCount: number, activeRole: string): boolean {
  return caseCount > 0 || activeRole === "resolving";
}

export function resolverCaseHref(address: string): string {
  return `/contracts/${address}#resolution`;
}

export type ResolverCaseCardModel = {
  address: string;
  href: string;
  title: string;
  typeLabel: string;
  employer: string;
  freelancer: string;
  status: ContractStatus;
  statusLabel: string;
  contestedLabel: string;
  disputedAtLabel: string | null;
  actionLabel: string;
  awaitingDecision: boolean;
};

export function resolverCaseCard(
  contract: ContractView,
  decimals: number | undefined
): ResolverCaseCardModel {
  const address = contract.address.toBase58();
  const awaitingDecision = contract.status === "Disputed";
  return {
    address,
    href: resolverCaseHref(address),
    title: `Contract #${contract.contractId.toString()}`,
    typeLabel: presentType(contract.paymentMode),
    employer: contract.employer.toBase58(),
    freelancer: contract.freelancer.toBase58(),
    status: contract.status,
    statusLabel: presentStatus(contract.status),
    contestedLabel: formatTokenAmount(contract.contestedAmount, decimals),
    disputedAtLabel: contract.disputedAt > 0 ? formatUnix(contract.disputedAt) : null,
    actionLabel: awaitingDecision ? "Review dispute" : "View case",
    awaitingDecision,
  };
}

type SettlementFields = Pick<
  ContractView,
  "status" | "contestedAmount" | "releasedAmount" | "withdrawnAmount" | "refundedAmount"
>;

export type ResolverSettlementOk = {
  ok: true;
  contested: bigint;
  award: bigint;
  employerAllocation: bigint;
  totalAllocation: bigint;
  freelancerFinal: bigint;
  freelancerClaimableAfter: bigint;
};

export type ResolverSettlementCheck = ResolverSettlementOk | { ok: false; error: string };

/**
 * Mirrors resolve_dispute invariants in exact base units (BigInt only):
 * 0 <= award <= contested, employer = contested - award,
 * released + award >= withdrawn.
 */
export function validateResolverSettlement(
  contract: SettlementFields,
  award: bigint
): ResolverSettlementCheck {
  if (contract.status !== "Disputed") {
    return { ok: false, error: "Settlement can only be recorded while the contract is Disputed." };
  }
  const contested = contract.contestedAmount;
  if (award < 0n) return { ok: false, error: "Freelancer allocation cannot be negative." };
  if (award > contested) {
    return { ok: false, error: "Freelancer allocation cannot exceed the amount under dispute." };
  }
  const employerAllocation = contested - award;
  const freelancerFinal = contract.releasedAmount + award;
  if (freelancerFinal < contract.withdrawnAmount) {
    return {
      ok: false,
      error: "Released pay plus the freelancer allocation must cover what the freelancer already withdrew.",
    };
  }
  const totalAllocation = award + employerAllocation;
  if (totalAllocation !== contested) {
    return { ok: false, error: "Allocations must add up to the amount under dispute." };
  }
  return {
    ok: true,
    contested,
    award,
    employerAllocation,
    totalAllocation,
    freelancerFinal,
    freelancerClaimableAfter: freelancerFinal - contract.withdrawnAmount,
  };
}

/** Parse the freelancer allocation (UI decimal string) with existing base-unit helpers. */
export function parseFreelancerAllocation(
  awardUi: string,
  decimals: number | undefined,
  contract: SettlementFields
): { award?: bigint; error?: string } {
  if (decimals == null) return { error: "Mint decimals are required for an exact allocation." };
  const parsed = parseDisputeAwardInput(awardUi, decimals, contract.contestedAmount);
  if (parsed.error || parsed.amount == null) {
    return { error: parsed.error ?? "Allocation is invalid." };
  }
  const check = validateResolverSettlement(contract, parsed.amount);
  if (!check.ok) return { error: check.error };
  return { award: parsed.amount };
}

/** Employer allocation input: the freelancer award is the exact remainder. */
export function freelancerAwardFromEmployerInput(
  employerUi: string,
  decimals: number | undefined,
  contested: bigint
): { award?: bigint; error?: string } {
  if (decimals == null) return { error: "Mint decimals are required for an exact allocation." };
  const parsed = parseDisputeAwardInput(employerUi, decimals, contested);
  if (parsed.error || parsed.amount == null) {
    return {
      error:
        employerUi.trim().length === 0
          ? "Enter the employer allocation."
          : "Employer allocation must be between 0 and the amount under dispute.",
    };
  }
  return { award: contested - parsed.amount };
}

export function allocationUi(amount: bigint, decimals: number): string {
  return baseUnitsToUiAmount(amount, decimals);
}

export function resolverSettlementSummary(
  check: ResolverSettlementOk,
  decimals: number | undefined
): Array<{ label: string; value: string }> {
  return [
    { label: "Amount under dispute", value: formatTokenAmount(check.contested, decimals) },
    { label: "Freelancer allocation", value: formatTokenAmount(check.award, decimals) },
    { label: "Employer allocation", value: formatTokenAmount(check.employerAllocation, decimals) },
    { label: "Total allocation", value: formatTokenAmount(check.totalAllocation, decimals) },
  ];
}

/** Settlement controls render only for the on-chain resolver of a Disputed contract. */
export function canShowResolverSettlementControls(
  wallet: PublicKey | null | undefined,
  contract: Pick<ContractView, "resolver" | "status">
): boolean {
  return Boolean(wallet) && contract.resolver.equals(wallet!) && contract.status === "Disputed";
}

export class ResolverPrecheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolverPrecheckError";
  }
}

/** Run against a fresh on-chain read immediately before building resolve_dispute. */
export function assertResolverPrecheck(
  wallet: PublicKey | null | undefined,
  onChain: Pick<ContractView, "resolver" | "status">
): void {
  if (!wallet) {
    throw new ResolverPrecheckError("Connect the designated resolver wallet to record a settlement.");
  }
  if (!onChain.resolver.equals(wallet)) {
    throw new ResolverPrecheckError(
      "The connected wallet is not the designated resolver for this contract."
    );
  }
  if (onChain.status !== "Disputed") {
    throw new ResolverPrecheckError(
      "This contract is no longer Disputed. Refresh to see the latest on-chain state."
    );
  }
}

/** Party statements are participant-owned: only employer/freelancer may edit their own. */
export function canEditPartyStatementForRole(role: ContractRole): boolean {
  return role === "employer" || role === "freelancer";
}

export function postResolutionSummary(contract: ContractView): {
  recorded: boolean;
  freelancerSettlement: bigint;
  employerRefundableTotal: bigint;
  freelancerClaimable: bigint;
  employerRefundable: bigint;
} {
  return {
    recorded: contract.status === "Resolved",
    freelancerSettlement: contract.freelancerSettlementAmount,
    employerRefundableTotal: contract.employerRefundableAmount,
    freelancerClaimable: remainingFreelancerClaim(contract),
    employerRefundable: remainingEmployerRefund(contract),
  };
}
