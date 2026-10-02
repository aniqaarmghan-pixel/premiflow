"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  JOB_STATUS_LABELS,
  MARKETPLACE_COPY,
  MARKETPLACE_NAV,
  amountLabel,
  formatMarketplaceAmount,
} from "@/lib/app/marketplace";
import type { MarketplaceApiError } from "@/lib/app/marketplace-client";
import type { PublicJob } from "@/lib/server/marketplace/service";

export function MarketplaceHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const pathname = usePathname();
  return (
    <header className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan sm:text-xs">
        Marketplace
      </p>
      <h1 className="mt-1 break-words font-display text-[1.5rem] tracking-tight sm:text-2xl">
        {title}
      </h1>
      {subtitle ? <p className="mt-1 max-w-2xl text-sm text-ink-soft">{subtitle}</p> : null}
      <nav aria-label="Marketplace" className="mt-3 flex min-w-0 flex-wrap gap-2">
        {MARKETPLACE_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-card text-ink-soft hover:bg-paper-2"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-paper-2 px-2 py-0.5 text-xs font-semibold text-ink-soft">
      {children}
    </span>
  );
}

export function JobSummaryCard({ job, footer }: { job: PublicJob; footer?: ReactNode }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <Link
          href={`/marketplace/jobs/${job.id}`}
          className="min-w-0 break-words font-semibold text-ink underline-offset-2 hover:underline [overflow-wrap:anywhere]"
        >
          {job.title}
        </Link>
        <StatusPill>{JOB_STATUS_LABELS[job.status]}</StatusPill>
      </div>
      <p className="mt-1 line-clamp-2 break-words text-sm text-ink-soft [overflow-wrap:anywhere]">
        {job.description}
      </p>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-faint">
        <span>{job.paymentMode}</span>
        <span>
          {amountLabel(job.paymentMode)}: {formatMarketplaceAmount(job.budgetAmount)}
        </span>
        <span>Posted {new Date(job.createdAt).toLocaleDateString()}</span>
      </p>
      {footer}
    </Card>
  );
}

export function NoticeText({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-6 text-ink-soft" aria-live="polite">
      {children}
    </p>
  );
}

/** Loading / error states shared by the signed-in lists. */
export function QueryState({
  status,
  error,
  wallet,
  onVerify,
  verifying,
}: {
  status: "idle" | "loading" | "error";
  error?: MarketplaceApiError;
  wallet: string | null;
  onVerify: () => void;
  verifying: boolean;
}) {
  if (!wallet) {
    return <Card className="p-4 text-sm text-ink-soft">{MARKETPLACE_COPY.connectWallet}</Card>;
  }
  if (status === "error" && error?.status === 401) {
    return (
      <Card className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-soft">{MARKETPLACE_COPY.verifyWalletNote}</p>
        <Button onClick={onVerify} disabled={verifying}>
          {MARKETPLACE_COPY.verifyWallet}
        </Button>
      </Card>
    );
  }
  if (status === "error") {
    return <Card className="p-4 text-sm text-ink-soft">{error?.message ?? "Could not load."}</Card>;
  }
  return <Card className="p-4 text-sm text-ink-soft">Loading...</Card>;
}
