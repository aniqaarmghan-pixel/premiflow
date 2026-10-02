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
  MARKETPLACE_DISCOVER_NAV,
  MARKETPLACE_MANAGE_NAV,
  SORT_OPTIONS,
  DELIVERY_TERMS,
  AVAILABILITY_LABELS,
  isMarketplaceNavActive,
  jobCategory,
  categoryLabelOf,
  amountLabel,
  formatMarketplaceAmount,
  gigHref,
  profileHref,
  shortWallet,
  type SearchFormState,
} from "@/lib/app/marketplace";
import type { MarketplaceApiError } from "@/lib/app/marketplace-client";
import { Field, Input, Select } from "@/components/ui/Field";
import {
  MARKETPLACE_CATEGORIES,
  categorizeText,
  type MarketplaceCategorySlug,
} from "@/lib/app/marketplace-categories";
import type {
  FreelancerCard as FreelancerCardData,
  ProfileSummary,
  PublicGig,
} from "@/lib/server/marketplace/catalog-service";
import type { PublicJob } from "@/lib/server/marketplace/service";

/** Discovery + management tabs. Label color lives on an inner span so no global anchor rule can mute it. */
export function MarketplaceNav({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const tab = (item: { href: string; label: string }, tone: "discover" | "manage") => {
    const active = isMarketplaceNavActive(item.href, pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
          active
            ? "border-ink bg-ink text-white"
            : tone === "discover"
              ? "border-line bg-card text-ink hover:bg-paper-2"
              : "border-line bg-card text-ink-soft hover:bg-paper-2"
        }`}
      >
        <span className={active ? "text-white" : tone === "discover" ? "text-ink" : "text-ink-soft"}>
          {item.label}
        </span>
      </Link>
    );
  };
  return (
    <div className={`min-w-0 space-y-2 ${className}`}>
      <nav aria-label="Marketplace discovery" className="flex min-w-0 flex-wrap gap-2">
        {MARKETPLACE_DISCOVER_NAV.map((item) => tab(item, "discover"))}
      </nav>
      <nav aria-label="Manage marketplace" className="flex min-w-0 flex-wrap gap-2">
        {MARKETPLACE_MANAGE_NAV.map((item) => tab(item, "manage"))}
      </nav>
    </div>
  );
}

export function MarketplaceHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan sm:text-xs">
        Marketplace
      </p>
      <h1 className="mt-1 break-words font-display text-[1.5rem] tracking-tight sm:text-2xl">
        {title}
      </h1>
      {subtitle ? <p className="mt-1 max-w-2xl text-sm text-ink-soft">{subtitle}</p> : null}
      <MarketplaceNav className="mt-3" />
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
    <Card className="pf-lift min-w-0 p-3 sm:p-4">
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
      <JobTags job={job} className="mt-2" />
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

/** Category chip (explicit, else keyword-derived) plus job skills. */
export function JobTags({ job, className = "" }: { job: PublicJob; className?: string }) {
  const category = jobCategory(job);
  const skills = (job.skills ?? []).slice(0, 6);
  if (!category && skills.length === 0) return null;
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-1.5 ${className}`}>
      {category ? (
        <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">
          {categoryLabelOf(category)}
        </span>
      ) : null}
      <SkillList skills={skills} />
    </div>
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

const COVER_GRADIENTS: Record<MarketplaceCategorySlug | "none", string> = {
  development: "bg-[linear-gradient(135deg,#0b2545,#13315c_45%,#12c2b8)]",
  web3: "bg-[linear-gradient(135deg,#1b1145,#4f3cc9_50%,#12c2b8)]",
  design: "bg-[linear-gradient(135deg,#3b0d3a,#a23b72_55%,#f2a65a)]",
  ai: "bg-[linear-gradient(135deg,#06283d,#1363df_55%,#47b5ff)]",
  video: "bg-[linear-gradient(135deg,#2b0f0f,#b23a48_55%,#fcb9b2)]",
  marketing: "bg-[linear-gradient(135deg,#0f3d2e,#1f8a70_55%,#bfdb38)]",
  writing: "bg-[linear-gradient(135deg,#2d2a32,#5c5470_55%,#dbd8e3)]",
  business: "bg-[linear-gradient(135deg,#1d2b3a,#3c6e71_55%,#d9d9d9)]",
  none: "bg-[linear-gradient(135deg,#07111f,#13315c_55%,#4f8cff)]",
};

function categoryLabel(slug: MarketplaceCategorySlug): string {
  return MARKETPLACE_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

/** Visual service card. Media is only the seller's own https avatar; otherwise a category gradient. */
export function GigSummaryCard({
  gig,
  footer,
}: {
  gig: PublicGig & { seller?: ProfileSummary | null };
  footer?: ReactNode;
}) {
  const categories = categorizeText(`${gig.title} ${gig.description} ${gig.skills.join(" ")}`);
  const primary: MarketplaceCategorySlug | "none" = categories.length > 0 ? categories[0] : "none";
  const seller = gig.seller ?? null;
  return (
    <article className="pf-lift flex min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border border-line bg-card shadow-[var(--shadow)]">
      <Link
        href={gigHref(gig.id)}
        aria-label={gig.title}
        className={`relative flex aspect-[16/9] items-center justify-center ${COVER_GRADIENTS[primary]}`}
      >
        {seller?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={seller.avatarUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-16 w-16 rounded-full border-2 border-white/70 object-cover shadow-lg sm:h-20 sm:w-20"
          />
        ) : (
          <span aria-hidden="true" className="font-display text-3xl text-white/80">
            {(seller?.displayName || gig.title).slice(0, 1).toUpperCase()}
          </span>
        )}
        {primary !== "none" ? (
          <span className="absolute left-3 top-3 rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-semibold text-white">
            {categoryLabel(primary)}
          </span>
        ) : null}
        {gig.status !== "active" ? (
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink">
            {GIG_STATUS_LABELS[gig.status]}
          </span>
        ) : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-4">
        <p className="flex min-w-0 items-center gap-2 text-xs text-ink-faint">
          <ProfileLink wallet={gig.freelancerWallet} label={seller?.displayName || undefined} />
        </p>
        <Link
          href={gigHref(gig.id)}
          className="line-clamp-2 min-w-0 break-words font-semibold text-ink underline-offset-2 hover:underline [overflow-wrap:anywhere]"
        >
          {gig.title}
        </Link>
        <SkillList skills={gig.skills.slice(0, 4)} />
        <p className="text-xs text-ink-faint">{DELIVERY_TERMS[gig.paymentMode]}</p>
        <div className="mt-auto flex min-w-0 flex-wrap items-baseline justify-between gap-2 border-t border-line pt-2">
          <span className="text-xs text-ink-faint">{gig.paymentMode}</span>
          <span className="text-sm font-semibold text-ink">
            {amountLabel(gig.paymentMode)} {formatMarketplaceAmount(gig.priceAmount)}
          </span>
        </div>
        {footer}
      </div>
    </article>
  );
}

/** Public profile card: safe listing fields only. */
export function FreelancerSummaryCard({ freelancer }: { freelancer: FreelancerCardData }) {
  return (
    <article className="pf-lift flex min-w-0 flex-col gap-3 rounded-[var(--radius)] border border-line bg-card p-4 shadow-[var(--shadow)]">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar url={freelancer.avatarUrl} size={52} />
        <div className="min-w-0">
          <Link
            href={profileHref(freelancer.wallet)}
            className="block truncate font-semibold text-ink underline-offset-2 hover:underline"
          >
            {freelancer.displayName || shortWallet(freelancer.wallet)}
          </Link>
          {freelancer.headline ? (
            <p className="line-clamp-2 break-words text-xs text-ink-soft [overflow-wrap:anywhere]">
              {freelancer.headline}
            </p>
          ) : null}
        </div>
      </div>
      <SkillList skills={freelancer.skills.slice(0, 5)} />
      <div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
        <span className="text-ink-faint">{AVAILABILITY_LABELS[freelancer.availability]}</span>
        {freelancer.rateAmount ? (
          <span className="font-semibold text-ink">{formatMarketplaceAmount(freelancer.rateAmount)} / hour</span>
        ) : (
          <span className="text-ink-faint">Rate on request</span>
        )}
      </div>
    </article>
  );
}

/** Loading placeholders; pulse is disabled for reduced motion. */
export function SkeletonGrid({ count = 3, tall = false }: { count?: number; tall?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`${tall ? "h-72" : "h-40"} animate-pulse rounded-[var(--radius)] border border-line bg-paper-2 motion-reduce:animate-none`}
        />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--radius)] border border-dashed border-line bg-card-2 p-6 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children ? <div className="mt-2 text-sm text-ink-soft">{children}</div> : null}
    </div>
  );
}

const SEARCH_MODES = ["Fixed", "Milestone", "Streaming", "Hourly"] as const;

/** Search/filter form; the server validates, parameterizes and bounds every field. */
export function SearchFilters({
  onApply,
  tokenName,
  initial = EMPTY_SEARCH,
  showMode = true,
  amountNoun = "Budget",
}: {
  onApply: (form: SearchFormState) => void;
  tokenName: string;
  initial?: SearchFormState;
  showMode?: boolean;
  amountNoun?: string;
}) {
  const [form, setForm] = useState<SearchFormState>(initial);
  const update = (patch: Partial<SearchFormState>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <div className="min-w-0 rounded-[var(--radius)] border border-line bg-card p-3 shadow-[var(--shadow)] sm:p-4">
      <form
        role="search"
        className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(form);
        }}
      >
        <div className="sm:col-span-2">
          <Field label="Search">
            <Input value={form.q} maxLength={80} onChange={(e) => update({ q: e.target.value })} />
          </Field>
        </div>
        <Field label="Category">
          <Select
            value={form.category}
            onChange={(e) => update({ category: e.target.value as SearchFormState["category"] })}
          >
            <option value="">All categories</option>
            {MARKETPLACE_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sort">
          <Select value={form.sort} onChange={(e) => update({ sort: e.target.value as SearchFormState["sort"] })}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Skills (comma separated)">
          <Input value={form.skills} maxLength={200} onChange={(e) => update({ skills: e.target.value })} />
        </Field>
        {showMode ? (
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
        ) : null}
        <Field label={`Min ${amountNoun.toLowerCase()} (${tokenName})`}>
          <Input inputMode="decimal" value={form.minUi} onChange={(e) => update({ minUi: e.target.value })} />
        </Field>
        <Field label={`Max ${amountNoun.toLowerCase()} (${tokenName})`}>
          <Input inputMode="decimal" value={form.maxUi} onChange={(e) => update({ maxUi: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
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
    </div>
  );
}
