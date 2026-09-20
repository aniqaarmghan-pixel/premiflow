import type { PublicResolutionCase } from "@/lib/server/cases/service";
import type { OffchainWorkflowStatus } from "@/lib/server/stores";
import type { ContractStatus, UiAction } from "@/lib/streampay-v2";

export const CASE_WORKSPACE_RECOVERY_FAILED =
  "Your dispute is active on-chain. PREMIFLOW could not load the case workspace yet. Retry case recovery.";

export const WORKFLOW_STATUS_LABELS: Record<OffchainWorkflowStatus, string> = {
  awaiting_statements: "Awaiting statements",
  ready_for_resolver: "Ready for resolver",
  under_review: "Under review",
  settlement_submitted: "Settlement submitted (off-chain intent only)",
};

export const PAYOUT_STATE_LABELS = {
  not_resolved: "Not resolved on-chain",
  unclaimed: "Settlement recorded; claims not yet collected",
  partially_claimed: "Some on-chain claims completed",
  claims_complete: "On-chain claims complete",
} as const;

export function shouldAttemptCaseRecover(
  chainStatus: ContractStatus,
  role: "employer" | "freelancer" | "resolver" | "none"
): boolean {
  return (
    (chainStatus === "Disputed" || chainStatus === "Resolved") &&
    (role === "employer" || role === "freelancer")
  );
}

export function shouldRecoverAfterAction(
  action: UiAction,
  chainStatus: ContractStatus
): boolean {
  if (chainStatus !== "Disputed" && chainStatus !== "Resolved") return false;
  return action === "openDispute" || action === "rejectActivation";
}

export function dbFailureAfterChainSuccessIsTransactionFailure(): boolean {
  return false;
}

export function displayedCaseStatusLabel(input: {
  chainStatus: ContractStatus;
  workflowStatus: OffchainWorkflowStatus;
  payoutState: keyof typeof PAYOUT_STATE_LABELS;
}): string {
  if (input.chainStatus === "Resolved") {
    return `Resolved (on-chain) · ${PAYOUT_STATE_LABELS[input.payoutState]}`;
  }
  if (input.chainStatus === "Disputed") {
    return `Disputed (on-chain) · ${WORKFLOW_STATUS_LABELS[input.workflowStatus]}`;
  }
  return input.chainStatus;
}

export function neverShowPaidFromDatabase(label: string): boolean {
  return !/\bpaid\b/i.test(label);
}

export type ResolutionCaseClientState =
  | "idle"
  | "loading"
  | "ready"
  | "unauthenticated"
  | "forbidden"
  | "recovery_failed"
  | "unavailable";

export type ResolutionCaseView = PublicResolutionCase;
