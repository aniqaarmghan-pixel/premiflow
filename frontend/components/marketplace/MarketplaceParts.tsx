"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  EMPTY_SEARCH,
  GIG_STATUS_LABELS,
  JOB_STATUS_LABELS,
  MARKETPLACE_COPY,
  MARKETPLACE_NAV,
  amountLabel,
  formatMarketplaceAmount,
  gigHref,
  profileHref,
  shortWallet,
  type SearchFormState,
} from "@/lib/app/marketplace";
import type { MarketplaceApiError } from "@/lib/app/marketplace-client";
import { Field, Input, Select } from "@/components/ui/Field";
import type { PublicGig } from "@/lib/server/marketplace/catalog-service";
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
              {/* Global unlayered `a { color: inherit }` beats layered utilities on the
                  Link itself, so the label color lives on an inner span. */}
              <span className={active ? "text-white" : "text-ink-soft"}>{item.label}</span>
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
        <ProfileLink wallet={job.employerWallet} prefix="Employer" />
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

/** Link to a wallet's public marketplace profile. */
export function ProfileLink({
  wallet,
  prefix,
  label,
}: {
  wallet: string;
  prefix?: string;
  label?: string;
}) {
  return (
    <span className="min-w-0 break-all">
      {prefix ? `${prefix} ` : null}
      <Link
        href={profileHref(wallet)}
        className="font-medium text-accent underline-offset-2 hover:underline"
        title={wallet}
      >
        {label || shortWallet(wallet)}
      </Link>
    </span>
  );
}

/** https-only avatar URL (validated server-side); never proxied or uploaded. */
export function Avatar({ url, size = 48 }: { url: string | null; size?: number }) {
  if (!url) {
    return (
      <span
        aria-hidden="true"
        className="inline-block shrink-0 rounded-full bg-paper-2"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      loading="lazy"
      className="shrink-0 rounded-full bg-paper-2 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export function SkillList({ skills }: { skills: string[] }) {
  if (skills.length === 0) return null;
  return (
    <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="Skills">
      {skills.map((skill) => (
        <li
          key={skill}
          className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft [overflow-wrap:anywhere]"
        >
          {skill}
        </li>
      ))}
    </ul>
  );
}

export function GigSummaryCard({ gig, footer }: { gig: PublicGig; footer?: ReactNode }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <Link
          href={gigHref(gig.id)}
          className="min-w-0 break-words font-semibold text-ink underline-offset-2 hover:underline [overflow-wrap:anywhere]"
        >
          {gig.title}
        </Link>
        <StatusPill>{GIG_STATUS_LABELS[gig.status]}</StatusPill>
      </div>
      <p className="mt-1 line-clamp-2 break-words text-sm text-ink-soft [overflow-wrap:anywhere]">
        {gig.description}
      </p>
      <div className="mt-2">
        <SkillList skills={gig.skills} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-faint">
        <ProfileLink wallet={gig.freelancerWallet} prefix="Freelancer" />
        <span>{gig.paymentMode}</span>
        <span>
          {amountLabel(gig.paymentMode)}: {formatMarketplaceAmount(gig.priceAmount)}
        </span>
      </p>
      {footer}
    </Card>
  );
}

const SEARCH_MODES = ["Fixed", "Milestone", "Streaming", "Hourly"] as const;

/** Search/filter form; the server validates, parameterizes and bounds every field. */
export function SearchFilters({
  onApply,
  tokenName,
}: {
  onApply: (form: SearchFormState) => void;
  tokenName: string;
}) {
  const [form, setForm] = useState<SearchFormState>(EMPTY_SEARCH);
  const update = (patch: Partial<SearchFormState>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <form
        role="search"
        className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(form);
        }}
      >
        <div className="lg:col-span-2">
          <Field label="Search">
            <Input value={form.q} maxLength={80} onChange={(e) => update({ q: e.target.value })} />
          </Field>
        </div>
        <Field label="Skills (comma separated)">
          <Input value={form.skills} maxLength={200} onChange={(e) => update({ skills: e.target.value })} />
        </Field>
        <Field label="Payment mode">
          <Select
            value={form.mode}
            onChange={(e) => update({ mode: e.target.value as SearchFormState["mode"] })}
          >
            <option value="">Any</option>
            {SEARCH_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Min (${tokenName})`}>
          <Input inputMode="decimal" value={form.minUi} onChange={(e) => update({ minUi: e.target.value })} />
        </Field>
        <Field label={`Max (${tokenName})`}>
          <Input inputMode="decimal" value={form.maxUi} onChange={(e) => update({ maxUi: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit">Apply filters</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setForm(EMPTY_SEARCH);
              onApply(EMPTY_SEARCH);
            }}
          >
            Clear
          </Button>
        </div>
      </form>
    </Card>
  );
}
