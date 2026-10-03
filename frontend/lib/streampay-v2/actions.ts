import { PublicKey } from "@solana/web3.js";

import {
  isActivationWindowOpen,
  isHourlyEngagementExpired,
  isReviewDeadlineActive,
  isStreamCurrentlyAccruing,
  isStreamEnded,
  mayAttemptCompletion,
  projectedFinalStreamClaim,
  projectedContestedRemainder,
  remainingEmployerRefund,
  remainingFreelancerClaim,
  roleForContract,
} from "./derived";
import type { ContractView, HourlyStateView, WorkUnitView } from "./types";
import { hasActiveHourlySession, remainingAuthorizedSeconds } from "./hourly";
import { MAX_HOURLY_SESSIONS } from "./constants";

export type UiAction =
  | "addMilestone"
  | "finalizeTerms"
  | "acceptContract"
  | "declineContract"
  | "expireAcceptance"
  | "expireActivation"
  | "approveActivation"
  | "rejectActivation"
  | "submitTrialWork"
  | "requestTrialRevision"
  | "approveTrialAndActivate"
  | "settleTrialAndEnd"
  | "finalizeTrialReviewTimeout"
  | "submitWorkUnit"
  | "requestWorkRevision"
  | "approveWorkUnit"
  | "voidStaleRevision"
  | "finalizeReviewTimeout"
  | "releaseStreamAccrual"
  | "cancelActiveContract"
  | "withdrawFreelancer"
  | "claimEmployerRefund"
  | "openDispute"
  | "resolveDispute"
  | "completeContract"
  | "startHourlySession"
  | "stopHourlySession"
  | "endHourlyContract";

export type ActionAvailabilityInput = {
  wallet: PublicKey;
  contract: ContractView;
  workUnit?: WorkUnitView | null;
  trialUnit?: WorkUnitView | null;
  hourlyState?: HourlyStateView | null;
  now: number;
};

const LIFECYCLE_ACTIONS: readonly UiAction[] = [
  "addMilestone",
  "finalizeTerms",
  "acceptContract",
  "declineContract",
  "expireAcceptance",
  "expireActivation",
  "approveActivation",
  "rejectActivation",
  "submitTrialWork",
  "requestTrialRevision",
  "approveTrialAndActivate",
  "settleTrialAndEnd",
  "finalizeTrialReviewTimeout",
  "submitWorkUnit",
  "requestWorkRevision",
  "approveWorkUnit",
  "voidStaleRevision",
  "cancelActiveContract",
  "openDispute",
] as const;

/**
 * UX convenience only. The on-chain program remains the security authority.
 */
export function availableActions(input: ActionAvailabilityInput): UiAction[] {
  const { wallet, contract, now } = input;
  const role = roleForContract(wallet, contract);
  const trialConfigured = contract.trialAmount > 0n;
  const trial = input.trialUnit ?? null;
  const unit = input.workUnit ?? null;
  const actions = new Set<UiAction>();

  if (contract.status === "Disputed") {
    if (role === "resolver") actions.add("resolveDispute");
    return [...actions];
  }

  if (contract.status === "Draft" && role === "employer") {
    if (contract.paymentMode === "Milestone" && now < contract.acceptanceDeadline) {
      actions.add("addMilestone");
      actions.add("finalizeTerms");
    }
  }

  if (contract.status === "PendingAcceptance" && role === "freelancer") {
    if (now < contract.acceptanceDeadline) {
      actions.add("acceptContract");
    }
    actions.add("declineContract");
  }

  if (
    (contract.status === "PendingAcceptance" || contract.status === "Draft") &&
    now >= contract.acceptanceDeadline &&
    role === "employer"
  ) {
    actions.add("expireAcceptance");
  }

  if (contract.status === "PendingEmployerApproval") {
    const windowOpen = isActivationWindowOpen(contract, now);
    const trialSubmittedOrRevising =
      trial?.status === "Submitted" || trial?.status === "Revising";
    if (role === "employer") {
      actions.add("rejectActivation");
      if (windowOpen) {
        if (!trialConfigured) {
          actions.add("approveActivation");
        } else if (trial?.status === "Submitted") {
          actions.add("approveTrialAndActivate");
          actions.add("settleTrialAndEnd");
          if (
            now < trial.actionDeadline &&
            trial.revisionCount < contract.maxRevisions
          ) {
            actions.add("requestTrialRevision");
          }
        }
      } else if (trial?.status === "Submitted") {
        actions.add("settleTrialAndEnd");
      }
    }
    if (
      (role === "employer" || role === "freelancer") &&
      trial?.status === "Submitted" &&
      now >= trial.actionDeadline
    ) {
      actions.add("finalizeTrialReviewTimeout");
    }
    if (role === "freelancer" && trialConfigured && windowOpen) {
      if (!trial || trial.status === "Defined" || trial.status === "Revising") {
        actions.add("submitTrialWork");
      }
    }
    if (
      (role === "employer" || role === "freelancer") &&
      !windowOpen &&
      !trialSubmittedOrRevising
    ) {
      actions.add("expireActivation");
    }
    if (
      (role === "employer" || role === "freelancer") &&
      contract.openReviewCount > 0 &&
      projectedContestedRemainder(contract, now) > 0n
    ) {
      actions.add("openDispute");
    }
  }

  if (contract.status === "Active") {
    if (
      (role === "employer" || role === "freelancer") &&
      projectedContestedRemainder(contract, now) > 0n
    ) {
      actions.add("openDispute");
    }
    if (role === "employer") {
      if (contract.openReviewCount === 0) {
        if (contract.paymentMode === "Hourly") {
          if (
            input.hourlyState &&
            !hasActiveHourlySession(input.hourlyState)
          ) {
            actions.add("endHourlyContract");
          }
        } else if (
          // Fixed/Milestone that can successfully complete should emphasize
          // Mark finished — Cancel remains legal on-chain but cannot claw back
          // already-released amounts, so hide it from the normal Actions list.
          !(
            (contract.paymentMode === "Fixed" ||
              contract.paymentMode === "Milestone") &&
            mayAttemptCompletion(contract, now)
          )
        ) {
          actions.add("cancelActiveContract");
        }
      }
      if (unit?.status === "Submitted") {
        actions.add("approveWorkUnit");
        if (
          now < unit.actionDeadline &&
          unit.revisionCount < contract.maxRevisions
        ) {
          actions.add("requestWorkRevision");
        }
      }
      if (canOfferVoidStaleRevision(contract, unit, now)) {
        actions.add("voidStaleRevision");
      }
    }
    if (role === "freelancer") {
      if (
        contract.paymentMode !== "Streaming" &&
        contract.paymentMode !== "Hourly" &&
        unit &&
        (unit.status === "Defined" || unit.status === "Revising") &&
        (unit.kind === "Fixed" || unit.kind === "Milestone")
      ) {
        actions.add("submitWorkUnit");
      }
      if (contract.paymentMode === "Hourly" && input.hourlyState) {
        if (
          !hasActiveHourlySession(input.hourlyState) &&
          remainingAuthorizedSeconds(input.hourlyState) > 0n &&
          input.hourlyState.sessionCount < MAX_HOURLY_SESSIONS &&
          !isHourlyEngagementExpired(contract, now)
        ) {
          actions.add("startHourlySession");
        }
        if (hasActiveHourlySession(input.hourlyState)) {
          actions.add("stopHourlySession");
        }
      }
      if (remainingFreelancerClaim(contract) > 0n) {
        actions.add("withdrawFreelancer");
      }
    }
    if (unit && isReviewDeadlineActive(unit, now)) {
      // still under review; timeout not yet available
    } else if (unit?.status === "Submitted" && now >= unit.actionDeadline) {
      actions.add("finalizeReviewTimeout");
    }
    if (isStreamCurrentlyAccruing(contract, now) || (
      contract.paymentMode === "Streaming" &&
      contract.startTime > 0 &&
      now >= contract.startTime
    )) {
      // After end_time the employer is not offered a manual "Update earnings":
      // earned pay is fixed at end_time and the freelancer collects it.
      if (!(role === "employer" && isStreamEnded(contract, now))) {
        actions.add("releaseStreamAccrual");
      }
    }
    // Ended stream: offer "Collect final pay" when the canonical projected
    // claim is positive. Collect prepends release_stream_accrual in the same tx.
    if (
      role === "freelancer" &&
      isStreamEnded(contract, now) &&
      projectedFinalStreamClaim(contract, now) > 0n
    ) {
      actions.add("withdrawFreelancer");
    }
    if (mayAttemptCompletion(contract, now)) {
      actions.add("completeContract");
    }
  }

  if (
    remainingFreelancerClaim(contract) > 0n &&
    role === "freelancer"
  ) {
    actions.add("withdrawFreelancer");
  }
  if (remainingEmployerRefund(contract) > 0n && role === "employer") {
    actions.add("claimEmployerRefund");
  }

  return [...actions];
}

export function hasLifecycleMutation(actions: readonly UiAction[]): boolean {
  return actions.some((action) =>
    (LIFECYCLE_ACTIONS as readonly string[]).includes(action)
  );
}

/**
 * UX convenience for `void_stale_revision`. The program still authorizes.
 * Employer, Active, Fixed/Milestone main unit, Revising, deadline reached.
 */
function canOfferVoidStaleRevision(
  contract: ContractView,
  unit: WorkUnitView | null | undefined,
  now: number
): boolean {
  if (!unit) return false;
  if (contract.status !== "Active") return false;
  if (contract.paymentMode !== "Fixed" && contract.paymentMode !== "Milestone") {
    return false;
  }
  if (unit.kind !== "Fixed" && unit.kind !== "Milestone") return false;
  if (unit.status !== "Revising") return false;
  if (unit.actionDeadline <= 0) return false;
  return now >= unit.actionDeadline;
}
