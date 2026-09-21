import { formatUnix } from "@/lib/app/datetime";
import {
  canonicalHourlyEarned,
  displayHourlySessionCredit,
  hasActiveHourlySession,
  remainingAuthorizedSeconds,
  type AuthorizedTimeUnit,
  authorizedTimeToSeconds,
  engagementDurationToSeconds,
} from "@/lib/streampay-v2/hourly";
import {
  HOURLY_NO_ACTIVE_SESSION,
  MAX_HOURLY_SESSION_SECONDS,
  MIN_HOURLY_SESSION_SECONDS,
} from "@/lib/streampay-v2/constants";
import { remainingFreelancerClaim } from "@/lib/streampay-v2/derived";
import type {
  ContractRole,
  ContractView,
  HourlySessionView,
  HourlyStateView,
} from "@/lib/streampay-v2/types";

/**
 * `stop_hourly_session` rejects an empty `work_log_uri`
 * (`InvalidMetadata`: URI must be 1..=MAX_URI_LEN). The H2 client also
 * rejects empty URIs via `assertMetadataUri`.
 *
 * When the freelancer supplies no work log, the client sends this
 * internal sentinel. It means "no work log supplied". It is not an
 * attachment, customer URI, or Resolution Center evidence.
 */
export const HOURLY_NO_ATTACHMENT_URI = "premiflow:no-attachment";

export function isHourlyWorkLogSentinel(uri: string | null | undefined): boolean {
  return uri === HOURLY_NO_ATTACHMENT_URI;
}

/** Customer-facing work-log text. The protocol sentinel is never shown. */
export function displayHourlyWorkLog(uri: string | null | undefined): string | null {
  if (!uri || isHourlyWorkLogSentinel(uri)) return null;
  const trimmed = uri.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const HOURLY_COPY = {
  tagline: "Pay for working time",
  startTitle: "Start work",
  startExplain:
    "Start a work session when you begin working. PREMIFLOW uses the on-chain start and stop times to calculate recorded working time.",
  runningTitle: "Work session",
  runningStatus: "Running",
  openSessionNotCollectable:
    "Current-session earnings become available after you stop this work session.",
  earningsRecordedOnStop:
    "Hourly earnings are recorded when a work session is stopped.",
  clockDisclaimer:
    "The live elapsed clock is a display only. Final recorded time and earnings are calculated from Solana's on-chain clock when the transaction confirms.",
  eightHourRule:
    "A single work session can record at most 8 hours. Stop the session and start another if you continue working.",
  eightHourWarning:
    "This session has reached the maximum recordable duration and should be stopped. The protocol does not stop it automatically.",
  shortSession:
    "Stopping before the one-minute minimum usually records no payable time.",
  shortRemainder:
    "If this is the last leftover authorized time below the normal minimum, the protocol can still record that remainder.",
  collectExplain:
    "Collect transfers already recorded earnings from escrow to your wallet. It does not end the contract.",
  collectDoesNotEndSession:
    "Collect does not end an open work session and does not prevent later sessions.",
  salarySection: "Salary",
  stopNotWithdraw: "Stopping a session records time. It does not transfer tokens.",
  employerActive: "Freelancer work session is active.",
  employerSalaryView:
    "Salary figures below are contract accounting. Collect is a freelancer action.",
  endExplain:
    "Ending the hourly contract stops future work from being started and begins settlement of the recorded earnings and unused budget.",
  trialActive:
    "Trial approved. Hourly contract is active. Work time does not begin until the freelancer starts a session.",
  idleActive:
    "Hourly contract is active. Work time does not begin until the freelancer starts a session.",
  disputeDuringSession:
    "PREMIFLOW first records eligible elapsed work from the running session using the on-chain clock and protocol caps. The remaining unsettled amount then enters dispute.",
  fundExplain:
    "You fund the maximum authorized budget up front. The freelancer earns only for recorded work sessions. Unused budget remains available for settlement back to you when the contract ends.",
  authorizedVsEngagement:
    "Authorized working time is the maximum payable work time. The engagement window is the calendar period during which those work sessions may happen. Example: 40 authorized work hours within a 14-day engagement window.",
} as const;

export function formatHourlyDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0 && m === 0 && s === 0) return `${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0 && s === 0) return `${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatElapsedClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatSessionStartedAt(startedAt: number): string {
  if (startedAt <= 0) return "Not set";
  return new Date(startedAt * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function hourlyFundingFromInputs(input: {
  hourlyRate: bigint;
  authorizedSeconds: number;
  trialAmount: bigint;
}): {
  hourlyRate: bigint;
  authorizedSeconds: number;
  mainAmount: bigint;
  trialAmount: bigint;
  totalAmount: bigint;
} {
  const mainAmount = canonicalHourlyEarned(
    input.hourlyRate,
    BigInt(input.authorizedSeconds)
  );
  return {
    hourlyRate: input.hourlyRate,
    authorizedSeconds: input.authorizedSeconds,
    mainAmount,
    trialAmount: input.trialAmount,
    totalAmount: mainAmount + input.trialAmount,
  };
}

export function parseAuthorizedTime(
  value: string,
  unit: AuthorizedTimeUnit
): { seconds?: number; error?: string } {
  try {
    return { seconds: authorizedTimeToSeconds(value, unit) };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Authorized time must be a whole number greater than zero.",
    };
  }
}

export function parseEngagementDuration(
  value: string,
  unit: AuthorizedTimeUnit
): { seconds?: number; error?: string } {
  try {
    return { seconds: engagementDurationToSeconds(value, unit) };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Engagement window must be a whole number greater than zero.",
    };
  }
}

export function formatFriendlyDurationInput(
  value: string,
  unit: AuthorizedTimeUnit
): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  return `${trimmed} ${unit}`;
}

export function hourlyCreateReviewLines(input: {
  hourlyRateUi: string;
  authorizedTimeValue: string;
  authorizedTimeUnit: AuthorizedTimeUnit;
  engagementDurationValue: string;
  engagementDurationUnit: AuthorizedTimeUnit;
  maxWorkBudgetLabel: string;
  trialEnabled: boolean;
  trialAmountLabel: string;
  maxEscrowLabel: string;
}): readonly string[] {
  return [
    `Hourly rate: ${input.hourlyRateUi.trim() || "—"} / hour`,
    `Authorized work time: ${formatFriendlyDurationInput(input.authorizedTimeValue, input.authorizedTimeUnit)}`,
    `Engagement window: ${formatFriendlyDurationInput(input.engagementDurationValue, input.engagementDurationUnit)}`,
    `Maximum work budget: ${input.maxWorkBudgetLabel}`,
    `Trial amount: ${input.trialEnabled ? input.trialAmountLabel : "None"}`,
    `Maximum escrow funding: ${input.maxEscrowLabel}`,
  ];
}

export type HourlyDashboard = {
  hourlyRate: bigint;
  authorizedSeconds: number;
  approvedSeconds: number;
  remainingAuthorizedSeconds: number;
  maxWorkBudget: bigint;
  earnedReleased: bigint;
  collected: bigint;
  availableToCollect: bigint;
  unusedBudget: bigint;
  engagementStart: number;
  engagementEnd: number;
  status: ContractView["status"];
  hasActiveSession: boolean;
  sessionStartedAt: number;
  displayElapsed: number;
  estimatedSessionValue: bigint;
  cappedAtEightHours: boolean;
  shortSessionMayVoid: boolean;
  finalRemainderRecorded: boolean;
  authorizedTimeRemaining: boolean;
  clockIsDisplayOnly: true;
};

export function hourlyDashboard(
  contract: ContractView,
  state: HourlyStateView | null,
  session: HourlySessionView | null,
  now: number
): HourlyDashboard | null {
  if (contract.paymentMode !== "Hourly" || !state) return null;
  const remaining = remainingAuthorizedSeconds(state);
  const unused =
    contract.totalAmount > contract.releasedAmount + contract.refundedAmount
      ? contract.totalAmount - contract.releasedAmount - contract.refundedAmount
      : 0n;
  const active = hasActiveHourlySession(state) && session?.status === "Open";
  const credit = active
    ? displayHourlySessionCredit({
        hourlyRate: state.hourlyRate,
        authorizedSeconds: state.authorizedSeconds,
        approvedSeconds: state.approvedSeconds,
        startedAt: session?.startedAt ?? 0,
        now,
        engagementEnd: contract.endTime,
        minSessionSeconds: state.minSessionSeconds,
        maxSessionSeconds: state.maxSessionSeconds,
      })
    : null;

  return {
    hourlyRate: state.hourlyRate,
    authorizedSeconds: Number(state.authorizedSeconds),
    approvedSeconds: Number(state.approvedSeconds),
    remainingAuthorizedSeconds: Number(remaining),
    maxWorkBudget: canonicalHourlyEarned(state.hourlyRate, state.authorizedSeconds),
    earnedReleased: contract.releasedAmount,
    collected: contract.withdrawnAmount,
    availableToCollect: remainingFreelancerClaim(contract),
    unusedBudget: unused,
    engagementStart: contract.startTime,
    engagementEnd: contract.endTime,
    status: contract.status,
    hasActiveSession: Boolean(active),
    sessionStartedAt: session?.startedAt ?? 0,
    displayElapsed: credit?.rawElapsed ?? 0,
    estimatedSessionValue: credit?.estimatedDelta ?? 0n,
    cappedAtEightHours: credit?.cappedAtEightHours ?? false,
    shortSessionMayVoid: credit?.shortSessionMayVoid ?? false,
    finalRemainderRecorded: credit?.finalRemainderRecorded ?? false,
    authorizedTimeRemaining: remaining > 0n,
    clockIsDisplayOnly: true,
  };
}

export function canStartHourlyWork(input: {
  role: ContractRole;
  contract: ContractView;
  hourlyState: HourlyStateView | null;
}): boolean {
  const { role, contract, hourlyState } = input;
  if (role !== "freelancer") return false;
  if (contract.paymentMode !== "Hourly") return false;
  if (contract.status !== "Active") return false;
  if (!hourlyState) return false;
  if (hasActiveHourlySession(hourlyState)) return false;
  if (hourlyState.sessionCount >= 64) return false;
  return remainingAuthorizedSeconds(hourlyState) > 0n;
}

export function canStopHourlyWork(input: {
  role: ContractRole;
  contract: ContractView;
  hourlyState: HourlyStateView | null;
}): boolean {
  return (
    input.role === "freelancer" &&
    input.contract.paymentMode === "Hourly" &&
    input.contract.status === "Active" &&
    hasActiveHourlySession(input.hourlyState)
  );
}

export function canEndHourlyContract(input: {
  role: ContractRole;
  contract: ContractView;
  hourlyState: HourlyStateView | null;
}): boolean {
  return (
    input.role === "employer" &&
    input.contract.paymentMode === "Hourly" &&
    input.contract.status === "Active" &&
    input.contract.openReviewCount === 0 &&
    Boolean(input.hourlyState) &&
    !hasActiveHourlySession(input.hourlyState)
  );
}

export function employerSeesActiveSession(input: {
  role: ContractRole;
  hourlyState: HourlyStateView | null;
}): boolean {
  return input.role === "employer" && hasActiveHourlySession(input.hourlyState);
}

export function hourlyActivationCopy(contract: ContractView): string | null {
  if (contract.paymentMode !== "Hourly" || contract.status !== "Active") {
    return null;
  }
  if (contract.trialAmount > 0n) return HOURLY_COPY.trialActive;
  return HOURLY_COPY.idleActive;
}

export function resolveHourlyWorkLogUri(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : HOURLY_NO_ATTACHMENT_URI;
}

export function hourlySessionIndexLabel(state: HourlyStateView | null): string {
  if (!state || state.activeSessionIndex === HOURLY_NO_ACTIVE_SESSION) {
    return "None";
  }
  return String(state.activeSessionIndex);
}

export function hourlyEngagementLabel(contract: ContractView): string {
  if (contract.startTime > 0 && contract.endTime > contract.startTime) {
    return `${formatUnix(contract.startTime)} – ${formatUnix(contract.endTime)}`;
  }
  return "Set when the contract activates";
}

export function stopHourlyCopy(): {
  intro: string;
  points: readonly string[];
  workLogHint: string;
} {
  return {
    intro: "Stopping the session records eligible working time from the on-chain clock.",
    points: [
      "The session will stop.",
      "Final credited duration is determined on-chain.",
      "Earnings are recorded in contract accounting.",
      "Tokens are not automatically transferred.",
      "Collect released pay separately with Collect pay.",
    ],
    workLogHint:
      "Optional URL or note. PREMIFLOW does not host files. The program requires a non-empty work-log URI, so an empty field sends an internal “no work log” marker. That marker is not an attachment or evidence.",
  };
}

export function endHourlyCopy(): {
  intro: string;
  points: readonly string[];
} {
  return {
    intro: HOURLY_COPY.endExplain,
    points: [
      "No token transfer happens in this transaction.",
      "The freelancer keeps settlement entitlement to released earnings.",
      "Unused refundable budget becomes claimable by the employer according to settlement state.",
      "Collect pay and Claim refund remain separate actions.",
    ],
  };
}

export {
  MAX_HOURLY_SESSION_SECONDS,
  MIN_HOURLY_SESSION_SECONDS,
};
