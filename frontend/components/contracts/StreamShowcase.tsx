"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { HeroFlow } from "@/components/illustrations/HeroFlow";
import { Button } from "@/components/ui/Button";
import { formatDuration, formatUnix } from "@/lib/app/datetime";
import { formatTokenAmount } from "@/lib/app/money";
import {
  STREAMING_COLLECT_HINT,
  STREAMING_DASHBOARD_LABELS,
  STREAMING_PAY_EXPLAINER,
  STREAMING_RELEASE_HINT,
  STREAMING_RELEASE_LABEL,
  STREAMING_ZERO_AVAILABLE_HINT,
  STREAMING_CLOCK_NOT_RUNNING,
  STREAMING_FROZEN_CLOCK_LABELS,
  streamingEarnedLabel,
  streamingFrozenNote,
  streamingTrialIncludedNote,
} from "@/lib/app/stream-display";
import { streamingDashboard } from "@/lib/app/view-model";
import {
  isStreamCurrentlyAccruing,
  type ContractRole,
  type ContractView,
} from "@/lib/streampay-v2";

export function StreamShowcase({
  contract,
  now,
  decimals,
  role,
  onRelease,
  canRelease,
  onCollect,
  canCollect,
  busy,
}: {
  contract: ContractView;
  now: number;
  decimals?: number;
  role?: ContractRole;
  onRelease?: () => void;
  canRelease?: boolean;
  onCollect?: () => void;
  canCollect?: boolean;
  busy?: boolean;
}) {
  const live = isStreamCurrentlyAccruing(contract, now);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 120);
    return () => window.clearInterval(id);
  }, [live]);

  const clockNow = live ? Math.floor(nowMs / 1000) : now;
  const dash = streamingDashboard(contract, clockNow);
  // Non-Active streams show frozen on-chain figures; no ticker runs (see `live`).
  const frozen = dash.earnedBasis !== "estimate";
  const durationMs = Math.max(1, dash.durationSeconds * 1000);
  const elapsedMs = dash.elapsedSeconds * 1000;
  const pct = contract.startTime === 0 ? 0 : (elapsedMs / durationMs) * 100;
  const amount = (value: bigint) => formatTokenAmount(value, decimals);
  const collectLabel =
    dash.availableToCollect > 0n
      ? `Collect ${amount(dash.availableToCollect)}`
      : "Collect pay";
  const stillActive = contract.status === "Active";

  return (
    <div
      className={`@container overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(160deg,#06101c,#0d2238_55%,#10263a)] p-4 text-white shadow-[var(--shadow)] sm:p-5 ${
        live ? "pf-stream-live" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">
            Streaming salary
          </p>
          <h3 className="mt-1 font-display text-2xl">Ongoing pay</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
            {STREAMING_PAY_EXPLAINER}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            live ? "bg-cyan/15 text-cyan" : "bg-white/10 text-white/70"
          }`}
        >
          {live ? "Accruing" : contract.status}
        </span>
      </div>
      <div className="mt-4 rounded-3xl border border-white/10 bg-white/5">
        <HeroFlow />
      </div>
      <p
        className={`mt-3 break-words font-display text-4xl tracking-tight tabular-nums sm:text-5xl ${
          live ? "pf-live-amount" : ""
        }`}
      >
        {amount(dash.displayEarned)}
      </p>
      <p className="text-sm text-white/55">
        {frozen ? (
          streamingFrozenNote(dash.earnedBasis)
        ) : (
          <>
            {STREAMING_DASHBOARD_LABELS.earnedSoFar} · display estimate matching the
            on-chain floor formula — not withdrawable until released
          </>
        )}
      </p>
      {dash.trialPaid > 0n ? (
        <p className="mt-1 text-xs text-white/55">
          {streamingTrialIncludedNote(amount(dash.trialPaid))}
        </p>
      ) : null}
      <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-[linear-gradient(90deg,#2ee6d6,#4f8cff,#8b7bff)]"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.18, ease: "linear" }}
        />
      </div>

      <section className="mt-4" aria-labelledby="streaming-salary-heading">
        <h4
          id="streaming-salary-heading"
          className="text-sm font-semibold uppercase tracking-[0.14em] text-white/70"
        >
          Salary
        </h4>
        {role === "employer" ? (
          <p className="mt-2 text-sm leading-6 text-white/65">
            Salary figures are contract accounting. Collect is a freelancer action.
          </p>
        ) : null}
        <div className="mt-2.5 grid gap-2.5 @sm:grid-cols-2 @xl:grid-cols-4">
          <Mini label={streamingEarnedLabel(dash.earnedBasis)} value={amount(dash.displayEarned)} />
          <Mini label={STREAMING_DASHBOARD_LABELS.alreadyRecorded} value={amount(dash.alreadyRecorded)} />
          <Mini label={STREAMING_DASHBOARD_LABELS.alreadyCollected} value={amount(dash.alreadyCollected)} />
          <Mini
            label={STREAMING_DASHBOARD_LABELS.availableToCollect}
            value={amount(dash.availableToCollect)}
            emphasize
          />
        </div>
      </section>

      <div className="mt-3 grid gap-2.5 @sm:grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-4">
        <Mini label={STREAMING_DASHBOARD_LABELS.totalFundedStream} value={amount(dash.totalFundedStream)} />
        <Mini
          label={STREAMING_DASHBOARD_LABELS.duration}
          value={dash.durationSeconds > 0 ? formatDuration(dash.durationSeconds) : "Not set"}
        />
        <Mini
          label={STREAMING_DASHBOARD_LABELS.hourlyRate}
          value={
            dash.durationSeconds > 0
              ? `${amount(dash.equivalentHourlyRate)} / hour`
              : "Not set"
          }
        />
        <Mini label={STREAMING_DASHBOARD_LABELS.startTime} value={formatUnix(dash.startTime)} />
        <Mini label={STREAMING_DASHBOARD_LABELS.endTime} value={formatUnix(dash.endTime)} />
        <Mini
          label={frozen ? STREAMING_FROZEN_CLOCK_LABELS.elapsed : STREAMING_DASHBOARD_LABELS.elapsed}
          value={formatDuration(dash.elapsedSeconds)}
        />
        <Mini
          label={frozen ? STREAMING_FROZEN_CLOCK_LABELS.remaining : STREAMING_DASHBOARD_LABELS.remaining}
          value={
            frozen && dash.frozenAt === 0
              ? STREAMING_CLOCK_NOT_RUNNING
              : formatDuration(dash.remainingSeconds)
          }
        />
        <Mini label={STREAMING_DASHBOARD_LABELS.remainingEscrow} value={amount(dash.remainingEscrow)} />
      </div>

      {(canRelease && onRelease) || (canCollect && onCollect) ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {canRelease && onRelease ? (
              <Button onClick={onRelease} disabled={busy} aria-label={STREAMING_RELEASE_LABEL}>
                {STREAMING_RELEASE_LABEL}
              </Button>
            ) : null}
            {canCollect && onCollect ? (
              <Button
                onClick={onCollect}
                disabled={busy}
                variant="secondary"
                aria-label={collectLabel}
              >
                {collectLabel}
              </Button>
            ) : null}
          </div>
          {canRelease ? (
            <p className="text-sm leading-6 text-white/65">{STREAMING_RELEASE_HINT}</p>
          ) : null}
          {canCollect ? (
            <p className="text-sm leading-6 text-white/65">{STREAMING_COLLECT_HINT}</p>
          ) : null}
        </div>
      ) : null}

      {stillActive && dash.availableToCollect === 0n ? (
        <p className="mt-4 text-sm leading-6 text-white/60">{STREAMING_ZERO_AVAILABLE_HINT}</p>
      ) : null}
    </div>
  );
}

function Mini({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl px-3 py-2.5 ${
        emphasize ? "bg-cyan/10 ring-1 ring-cyan/30" : "bg-white/6"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-white/45">{label}</p>
      <p className="mt-0.5 break-words font-medium tabular-nums">{value}</p>
    </div>
  );
}
