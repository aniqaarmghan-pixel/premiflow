"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { HeroFlow } from "@/components/illustrations/HeroFlow";
import { Button } from "@/components/ui/Button";
import { formatDuration, formatUnix } from "@/lib/app/datetime";
import { formatTokenAmount } from "@/lib/app/money";
import {
  STREAMING_DASHBOARD_LABELS,
  STREAMING_PAY_EXPLAINER,
} from "@/lib/app/stream-display";
import { streamingDashboard } from "@/lib/app/view-model";
import {
  isStreamCurrentlyAccruing,
  type ContractView,
} from "@/lib/streampay-v2";

export function StreamShowcase({
  contract,
  now,
  decimals,
  onRelease,
  canRelease,
  busy,
}: {
  contract: ContractView;
  now: number;
  decimals?: number;
  onRelease?: () => void;
  canRelease?: boolean;
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
  const durationMs = Math.max(1, dash.durationSeconds * 1000);
  const elapsedMs = dash.elapsedSeconds * 1000;
  const pct = contract.startTime === 0 ? 0 : (elapsedMs / durationMs) * 100;
  const amount = (value: bigint) => formatTokenAmount(value, decimals);

  return (
    <div
      className={`overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,#06101c,#0d2238_55%,#10263a)] p-6 text-white shadow-[var(--shadow)] ${
        live ? "pf-stream-live" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">
            Streaming dashboard
          </p>
          <h3 className="mt-1 font-display text-3xl">Earned so far</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
            {STREAMING_PAY_EXPLAINER}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            live ? "bg-cyan/15 text-cyan" : "bg-white/10 text-white/70"
          }`}
        >
          {live ? "Earning" : contract.status}
        </span>
      </div>
      <div className="mt-5 rounded-3xl border border-white/10 bg-white/5">
        <HeroFlow />
      </div>
      <p className="mt-4 font-display text-5xl tracking-tight tabular-nums pf-live-amount sm:text-6xl">
        {amount(dash.earnedSoFar)}
      </p>
      <p className="text-sm text-white/55">
        {STREAMING_DASHBOARD_LABELS.earnedSoFar} · display estimate matching the
        on-chain floor formula
      </p>
      <div className="relative mt-6 h-3 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-[linear-gradient(90deg,#2ee6d6,#4f8cff,#8b7bff)]"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.18, ease: "linear" }}
        />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          label={STREAMING_DASHBOARD_LABELS.elapsed}
          value={formatDuration(dash.elapsedSeconds)}
        />
        <Mini
          label={STREAMING_DASHBOARD_LABELS.remaining}
          value={formatDuration(dash.remainingSeconds)}
        />
        <Mini label={STREAMING_DASHBOARD_LABELS.alreadyRecorded} value={amount(dash.alreadyRecorded)} />
        <Mini label={STREAMING_DASHBOARD_LABELS.alreadyCollected} value={amount(dash.alreadyCollected)} />
        <Mini label={STREAMING_DASHBOARD_LABELS.availableToCollect} value={amount(dash.availableToCollect)} />
        <Mini label={STREAMING_DASHBOARD_LABELS.remainingEscrow} value={amount(dash.remainingEscrow)} />
      </div>
      {canRelease && onRelease ? (
        <div className="mt-5">
          <Button onClick={onRelease} disabled={busy}>
            Record earned pay
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/6 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-white/45">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
