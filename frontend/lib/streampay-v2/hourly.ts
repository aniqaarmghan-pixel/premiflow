import {
  HOURLY_NO_ACTIVE_SESSION,
  MAX_HOURLY_SESSION_SECONDS,
  MIN_HOURLY_SESSION_SECONDS,
} from "./constants";
import type { HourlySessionView, HourlyStateView } from "./types";

const U64_MAX = (1n << 64n) - 1n;
const HOURLY_SECONDS_PER_HOUR = 3600n;

/**
 * Same integer formula as Rust `canonical_hourly_earned`:
 * `floor(hourly_rate * approved_seconds / 3600)`.
 * Display and create-budget only. Never a settlement instruction argument.
 */
export function canonicalHourlyEarned(
  hourlyRate: bigint,
  approvedSeconds: bigint
): bigint {
  if (hourlyRate <= 0n || approvedSeconds <= 0n) return 0n;
  if (hourlyRate > U64_MAX || approvedSeconds > U64_MAX) {
    throw new Error("Hourly earnings overflow the protocol u64 range.");
  }
  const product = hourlyRate * approvedSeconds;
  const earned = product / HOURLY_SECONDS_PER_HOUR;
  if (earned > U64_MAX) {
    throw new Error("Hourly earnings overflow the protocol u64 range.");
  }
  return earned;
}

export type AuthorizedTimeUnit = "hours" | "days";
export type EngagementDurationUnit = AuthorizedTimeUnit;

function friendlyDurationToSeconds(
  value: string | number,
  unit: AuthorizedTimeUnit,
  label: string
): number {
  const raw = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new Error(`${label} must be a whole number greater than zero.`);
  }
  const seconds = unit === "days" ? raw * 86_400 : raw * 3_600;
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error(`${label} is outside the supported range.`);
  }
  return seconds;
}

export function authorizedTimeToSeconds(
  value: string | number,
  unit: AuthorizedTimeUnit
): number {
  return friendlyDurationToSeconds(value, unit, "Authorized time");
}

export function engagementDurationToSeconds(
  value: string | number,
  unit: EngagementDurationUnit
): number {
  return friendlyDurationToSeconds(value, unit, "Engagement window");
}

export function hasActiveHourlySession(
  state: Pick<HourlyStateView, "activeSessionIndex"> | null | undefined
): boolean {
  return (
    state != null &&
    state.activeSessionIndex !== HOURLY_NO_ACTIVE_SESSION &&
    Number.isFinite(state.activeSessionIndex)
  );
}

export function remainingAuthorizedSeconds(
  state: Pick<HourlyStateView, "authorizedSeconds" | "approvedSeconds">
): bigint {
  return state.authorizedSeconds > state.approvedSeconds
    ? state.authorizedSeconds - state.approvedSeconds
    : 0n;
}

/**
 * Display-only session credit using the same caps as Stop / dispute
 * materialization. Does not write contract accounting.
 */
export function displayHourlySessionCredit(input: {
  hourlyRate: bigint;
  authorizedSeconds: bigint;
  approvedSeconds: bigint;
  startedAt: number;
  now: number;
  engagementEnd: number;
  minSessionSeconds?: bigint;
  maxSessionSeconds?: bigint;
}): {
  rawElapsed: number;
  creditedDuration: number;
  estimatedDelta: bigint;
  status: "recorded" | "void";
  cappedAtEightHours: boolean;
  shortSessionMayVoid: boolean;
  finalRemainderRecorded: boolean;
} {
  const minSession = input.minSessionSeconds ?? BigInt(MIN_HOURLY_SESSION_SECONDS);
  const maxSession = input.maxSessionSeconds ?? BigInt(MAX_HOURLY_SESSION_SECONDS);
  const raw = Math.max(0, input.now - input.startedAt);
  const remainingAuth = remainingAuthorizedSeconds(input);
  const engagementRemaining =
    input.engagementEnd > input.startedAt
      ? BigInt(input.engagementEnd - input.startedAt)
      : 0n;

  let credited = BigInt(raw);
  credited = credited < remainingAuth ? credited : remainingAuth;
  credited = credited < maxSession ? credited : maxSession;
  credited = credited < engagementRemaining ? credited : engagementRemaining;

  const remainingMeetsMin = remainingAuth >= minSession;
  const shortSessionMayVoid = credited < minSession && remainingMeetsMin;
  const finalRemainderRecorded = credited > 0n && credited < minSession && !remainingMeetsMin;
  const status = shortSessionMayVoid ? "void" : "recorded";
  const creditedDuration = shortSessionMayVoid ? 0 : Number(credited);
  const oldEarned = canonicalHourlyEarned(input.hourlyRate, input.approvedSeconds);
  const newApproved = input.approvedSeconds + BigInt(creditedDuration);
  const newEarned = canonicalHourlyEarned(input.hourlyRate, newApproved);

  return {
    rawElapsed: raw,
    creditedDuration,
    estimatedDelta: newEarned > oldEarned ? newEarned - oldEarned : 0n,
    status,
    cappedAtEightHours: BigInt(raw) > maxSession && credited === maxSession,
    shortSessionMayVoid,
    finalRemainderRecorded,
  };
}

export function sessionIsOpen(
  session: Pick<HourlySessionView, "status"> | null | undefined
): boolean {
  return session?.status === "Open";
}
