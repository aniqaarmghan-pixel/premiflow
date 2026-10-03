"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  HOURLY_COPY,
  employerEndBlockedBySession,
  formatElapsedClock,
  isHourlyEngagementEnded,
  formatHourlyDuration,
  formatSessionStartedAt,
  hourlyActivationCopy,
  hourlyDashboard,
  hourlyEngagementLabel,
} from "@/lib/app/hourly-ux";
import { formatTokenAmount } from "@/lib/app/money";
import type {
  ContractRole,
  ContractView,
  HourlySessionView,
  HourlyStateView,
} from "@/lib/streampay-v2";

export function HourlyShowcase({
  contract,
  hourlyState,
  hourlySession,
  now,
  decimals,
  role,
  canStart,
  canStop,
  canEnd,
  canCollect,
  busy,
  onStart,
  onStop,
  onEnd,
  onCollect,
}: {
  contract: ContractView;
  hourlyState: HourlyStateView | null;
  hourlySession: HourlySessionView | null;
  now: number;
  decimals?: number;
  role: ContractRole;
  canStart?: boolean;
  canStop?: boolean;
  canEnd?: boolean;
  canCollect?: boolean;
  busy?: boolean;
  onStart?: () => void;
  onStop?: () => void;
  onEnd?: () => void;
  onCollect?: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const running = Boolean(
    hourlyState &&
      hourlySession?.status === "Open" &&
      contract.status === "Active"
  );

  useEffect(() => {
    if (!running) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setInterval(() => setNowMs(Date.now()), reduce ? 1000 : 250);
    return () => window.clearInterval(id);
  }, [running]);

  const clockNow = running ? Math.floor(nowMs / 1000) : now;
  const dash = hourlyDashboard(contract, hourlyState, hourlySession, clockNow);
  const amount = (value: bigint) => formatTokenAmount(value, decimals);
  const activation = hourlyActivationCopy(contract);
  const engagementEnded = isHourlyEngagementEnded({ contract, running, now: clockNow });
  const idle =
    contract.status === "Active" &&
    !running &&
    !engagementEnded &&
    Boolean(dash?.authorizedTimeRemaining);
  const endBlocked = employerEndBlockedBySession({ role, contract, hourlyState });

  if (!dash) {
    return (
      <div className="rounded-[24px] border border-line bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
          Hourly salary
        </p>
        <p className="mt-2 text-sm text-ink-soft">Hourly state is not loaded yet.</p>
      </div>
    );
  }

  const collectLabel =
    dash.availableToCollect > 0n
      ? `Collect ${amount(dash.availableToCollect)}`
      : "Collect pay";

  return (
    <div
      className={`rounded-[24px] border p-4 sm:p-5 lg:p-4 ${
        running
          ? "border-cyan/40 bg-[linear-gradient(160deg,#06101c,#0d2238)] text-white"
          : "border-line bg-card"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
              running ? "text-cyan" : "text-ink-faint"
            }`}
          >
            Hourly salary
          </p>
          <h3 className="mt-1 font-display text-xl sm:text-2xl lg:text-xl">
            {running
              ? HOURLY_COPY.runningTitle
              : engagementEnded
                ? HOURLY_COPY.engagementEndedTitle
                : presentHourlyHeadline(role, idle)}
          </h3>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            running ? "bg-cyan/15 text-cyan" : "bg-paper-2 text-ink-soft"
          }`}
        >
          {running ? `${HOURLY_COPY.runningStatus}` : engagementEnded ? "Ended" : contract.status}
        </span>
      </div>

      {activation && !running ? (
        <p className={`mt-3 text-sm leading-6 ${running ? "text-white/75" : "text-ink-soft"}`}>
          {activation}
        </p>
      ) : null}

      {role === "employer" && running ? (
        <p className="mt-3 text-sm font-medium text-cyan">{HOURLY_COPY.employerActive}</p>
      ) : null}

      {engagementEnded ? (
        <p role="status" className="mt-3 text-sm leading-6 text-ink-soft">
          {HOURLY_COPY.engagementEndedExplain}
        </p>
      ) : null}
      {idle && role === "freelancer" ? (
        <p className={`mt-3 text-sm leading-6 ${running ? "text-white/75" : "text-ink-soft"}`}>
          {HOURLY_COPY.startExplain}
        </p>
      ) : null}

      {running ? (
        <section className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 lg:mt-4 lg:p-4" aria-labelledby="hourly-session-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 id="hourly-session-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan">
              Work session
            </h4>
            <p className="text-sm text-white/70">
              {HOURLY_COPY.runningStatus} · {formatElapsedClock(dash.displayElapsed)}
            </p>
          </div>
          <p className="mt-3 text-sm text-white/70">
            Started {formatSessionStartedAt(dash.sessionStartedAt)}
          </p>
          <p className="mt-2 font-display text-3xl tabular-nums tracking-tight sm:text-4xl lg:text-3xl">
            {formatElapsedClock(dash.displayElapsed)}
          </p>
          <p className="mt-2 text-sm text-white/60">
            Estimated session value {amount(dash.estimatedSessionValue)} · display only — not
            added to Available
          </p>
          <p className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-sm leading-6 text-white">
            {HOURLY_COPY.openSessionNotCollectable}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/70">{HOURLY_COPY.clockDisclaimer}</p>
          {dash.cappedAtEightHours ? (
            <p className="mt-2 rounded-2xl bg-white/10 px-3 py-2 text-sm leading-6 text-white">
              {HOURLY_COPY.eightHourWarning}
            </p>
          ) : (
            <p className="mt-2 text-sm text-white/60">{HOURLY_COPY.eightHourRule}</p>
          )}
          {dash.shortSessionMayVoid ? (
            <p className="mt-2 text-sm text-white/70">{HOURLY_COPY.shortSession}</p>
          ) : null}
          {dash.finalRemainderRecorded ? (
            <p className="mt-2 text-sm text-white/70">{HOURLY_COPY.shortRemainder}</p>
          ) : null}
          {canStop && onStop ? (
            <div className="mt-4">
              <Button onClick={onStop} disabled={busy} variant="danger" aria-label="Stop work">
                Stop work
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-5" aria-labelledby="hourly-salary-heading">
        <h4
          id="hourly-salary-heading"
          className={`text-sm font-semibold uppercase tracking-[0.14em] ${
            running ? "text-white/70" : "text-ink-faint"
          }`}
        >
          {HOURLY_COPY.salarySection}
        </h4>
        {role === "employer" ? (
          <p className={`mt-2 text-sm leading-6 ${running ? "text-white/70" : "text-ink-soft"}`}>
            {HOURLY_COPY.employerSalaryView}
          </p>
        ) : null}
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Mini running={running} label="Earned / released" value={amount(dash.earnedReleased)} />
          <Mini running={running} label="Collected" value={amount(dash.collected)} />
          <Mini
            running={running}
            label="Available to collect"
            value={amount(dash.availableToCollect)}
            emphasize
          />
          <Mini running={running} label="Remaining budget" value={amount(dash.unusedBudget)} />
        </dl>
        <p className={`mt-3 text-sm leading-6 ${running ? "text-white/70" : "text-ink-soft"}`}>
          {HOURLY_COPY.earningsRecordedOnStop}
        </p>
        {canCollect && onCollect ? (
          <div className="mt-4 flex flex-col gap-2">
            <div>
              <Button
                onClick={onCollect}
                disabled={busy}
                variant={running ? "secondary" : "primary"}
                aria-label={collectLabel}
              >
                {collectLabel}
              </Button>
            </div>
            <p className={`text-sm leading-6 ${running ? "text-white/70" : "text-ink-soft"}`}>
              {HOURLY_COPY.collectExplain} {HOURLY_COPY.collectDoesNotEndSession}
            </p>
          </div>
        ) : null}
      </section>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Mini running={running} label="Hourly rate" value={`${amount(dash.hourlyRate)} / hour`} />
        <Mini
          running={running}
          label="Authorized time"
          value={`${formatHourlyDuration(dash.authorizedSeconds)} authorized`}
        />
        <Mini
          running={running}
          label="Recorded / worked time"
          value={`${formatHourlyDuration(dash.approvedSeconds)} recorded`}
        />
        <Mini
          running={running}
          label="Remaining time"
          value={`${formatHourlyDuration(dash.remainingAuthorizedSeconds)} remaining`}
        />
        <Mini running={running} label="Maximum work budget" value={amount(dash.maxWorkBudget)} />
        <Mini running={running} label="Engagement" value={hourlyEngagementLabel(contract)} />
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {canStart && onStart && !engagementEnded ? (
          <Button onClick={onStart} disabled={busy} aria-label="Start work">
            Start work
          </Button>
        ) : null}
        {!running && canStop && onStop ? (
          <Button onClick={onStop} disabled={busy} variant="danger" aria-label="Stop work">
            Stop work
          </Button>
        ) : null}
        {canEnd && onEnd ? (
          <Button
            onClick={onEnd}
            disabled={busy}
            variant="secondary"
            aria-label="End hourly contract"
          >
            End hourly contract
          </Button>
        ) : null}
      </div>
      {endBlocked ? (
        <p
          role="status"
          className={`mt-2 text-sm leading-6 ${running ? "text-white/70" : "text-ink-soft"}`}
        >
          {HOURLY_COPY.employerSessionInProgress}
        </p>
      ) : null}
    </div>
  );
}

function presentHourlyHeadline(role: ContractRole, idle: boolean): string {
  if (role === "freelancer" && idle) return "Ready to start work";
  if (role === "employer") return "Hourly contract";
  return "Hourly contract";
}

function Mini({
  label,
  value,
  running,
  emphasize,
}: {
  label: string;
  value: string;
  running: boolean;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl px-3 py-3 ${
        running ? "bg-white/8" : emphasize ? "bg-paper-2 ring-1 ring-cyan/20" : "bg-paper"
      }`}
    >
      <p
        className={`text-[11px] uppercase tracking-wide ${
          running ? "text-white/45" : "text-ink-faint"
        }`}
      >
        {label}
      </p>
      <p className={`mt-1 font-medium ${emphasize && !running ? "text-ink" : ""}`}>{value}</p>
    </div>
  );
}
