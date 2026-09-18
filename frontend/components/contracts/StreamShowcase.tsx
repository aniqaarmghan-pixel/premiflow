"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { HeroFlow } from "@/components/illustrations/HeroFlow";
import { Button } from "@/components/ui/Button";
import { formatDuration, formatUnix } from "@/lib/app/datetime";
import { formatTokenAmount } from "@/lib/app/money";
import { estimateStreamAccrualDisplayMs } from "@/lib/app/stream-display";
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

  const clockMs = live ? nowMs : now * 1000;
  const accrued = estimateStreamAccrualDisplayMs(
    contract.mainAmount,
    contract.startTime,
    contract.endTime,
    clockMs
  );
  const durationMs = Math.max(1, (contract.endTime - contract.startTime) * 1000);
  const elapsedMs = Math.max(0, Math.min(durationMs, clockMs - contract.startTime * 1000));
  const pct = contract.startTime === 0 ? 0 : (elapsedMs / durationMs) * 100;

  return (
    <div
      className={`overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,#06101c,#0d2238_55%,#10263a)] p-6 text-white shadow-[var(--shadow)] ${
        live ? "pf-stream-live" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Live stream</p>
          <h3 className="mt-1 font-display text-3xl">Value in motion</h3>
          <p className="mt-1 text-sm text-white/60">
            Display estimate only. Release writes the program&apos;s accrual, not this number.
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
      <div className="mt-5 rounded-3xl border border-white/10 bg-white/5">
        <HeroFlow />
      </div>
      <p className="mt-4 font-display text-5xl tracking-tight tabular-nums pf-live-amount sm:text-6xl">
        {formatTokenAmount(accrued, decimals)}
      </p>
      <p className="text-sm text-white/55">Estimated accrued · not a settlement input</p>
      <div className="relative mt-6 h-3 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-[linear-gradient(90deg,#2ee6d6,#4f8cff,#8b7bff)]"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.18, ease: "linear" }}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-white/70">
        <span>Elapsed {formatDuration(elapsedMs / 1000)}</span>
        <span>
          Remaining {formatDuration(Math.max(0, contract.endTime - clockMs / 1000))}
        </span>
        <span>Start {formatUnix(contract.startTime)}</span>
        <span>End {formatUnix(contract.endTime)}</span>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Mini label="Released" value={formatTokenAmount(contract.releasedAmount, decimals)} />
        <Mini label="Withdrawn" value={formatTokenAmount(contract.withdrawnAmount, decimals)} />
        <Mini label="Main amount" value={formatTokenAmount(contract.mainAmount, decimals)} />
      </div>
      {canRelease && onRelease ? (
        <div className="mt-5">
          <Button onClick={onRelease} disabled={busy}>
            Release accrued payment
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
