"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Aurora } from "@/components/site/Aurora";
import { shellKind } from "@/lib/app/site-routes";
import { CategoryArt } from "@/components/site/CategoryArt";
import { CloudOff, Play, RefreshCw, Sparkles } from "lucide-react";

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
  gigCategory,
  gigDeliveryLabel,
  gigPriceLabel,
  profileHref,
  shortWallet,
  type SearchFormState,
} from "@/lib/app/marketplace";
import type { MarketplaceApiError } from "@/lib/app/marketplace-client";
import { Field, Input, Select } from "@/components/ui/Field";
import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategorySlug,
} from "@/lib/app/marketplace-categories";
import type {
  FreelancerCard as FreelancerCardData,
  ProfileSummary,
  PublicGig,
} from "@/lib/server/marketplace/catalog-service";
import type { PublicJob } from "@/lib/server/marketplace/service";
import { playableVideoUrl } from "@/lib/app/marketplace-media";
import { GigVideoButton } from "./MarketplaceVideoModal";

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
      {/* Management links only inside the signed-in dashboard; public pages stay discovery-only. */}
      {shellKind(pathname) === "app" ? (
        <nav aria-label="Manage marketplace" className="flex min-w-0 flex-wrap gap-2">
          {MARKETPLACE_MANAGE_NAV.map((item) => tab(item, "manage"))}
        </nav>
      ) : null}
    </div>
  );
}

export function MarketplaceHeader({
  title,
  subtitle,
  hero = false,
  eyebrow = "Marketplace",
  art,
}: {
  title: string;
  subtitle?: string;
  /** Public discovery pages: full-bleed midnight band that matches the homepage hero. */
  hero?: boolean;
  eyebrow?: string;
  art?: string;
}) {
  if (hero) {
    return (
      <header className="min-w-0">
        <div className="pf-midnight relative isolate -mt-24 ml-[calc(50%-50vw)] w-screen overflow-hidden pb-12 pt-28 sm:pb-14 lg:-mt-[104px] lg:pt-[136px]">
          <Aurora className="-z-10 opacity-60" />
          <div aria-hidden="true" className="pf-grid-fade absolute inset-0 -z-10" />
          <div className="mx-auto flex w-full max-w-6xl min-w-0 items-end justify-between gap-8 px-4 sm:px-6 lg:px-8 2xl:max-w-7xl">
            <div className="min-w-0 max-w-2xl">
              <p className="pf-hero-in text-[11px] font-semibold uppercase tracking-[0.2em] text-aqua sm:text-xs">{eyebrow}</p>
              <h1
                className="pf-hero-in mt-2 break-words font-display text-3xl font-semibold tracking-[-0.03em] sm:text-5xl"
                style={{ "--pf-d": "80ms" } as CSSProperties}
              >
                <span className="pf-gradient-text">{title}</span>
              </h1>
              {subtitle ? (
                <p
                  className="pf-hero-in mt-3 text-sm leading-6 text-white/70 sm:text-base"
                  style={{ "--pf-d": "160ms" } as CSSProperties}
                >
                  {subtitle}
                </p>
              ) : null}
            </div>
            {art ? (
              <div
                className="pf-hero-in hidden w-48 shrink-0 overflow-hidden rounded-[24px] border border-white/10 shadow-[0_30px_60px_-30px_rgba(0,0,0,.8)] md:block"
                style={{ "--pf-d": "240ms" } as CSSProperties}
              >
                <CategoryArt slug={art} className="block aspect-[4/3] h-full w-full" />
              </div>
            ) : null}
          </div>
        </div>
        <MarketplaceNav className="mt-6" />
      </header>
    );
  }
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
    <article className="pf-card group relative min-w-0 overflow-hidden rounded-[20px] border border-line bg-card p-4 shadow-[var(--shadow)] sm:p-5">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#2ee6d6,#4f8cff_60%,#8b7bff)] opacity-70 transition-opacity group-hover:opacity-100"
      />
      <div className="flex min-w-0 items-start gap-3">
        <span className="hidden size-12 shrink-0 overflow-hidden rounded-2xl sm:block">
          <CategoryArt slug={jobCategory(job) ?? "none"} className="pf-zoom block h-full w-full" />
        </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
        <Link
          href={`/marketplace/jobs/${job.id}`}
          className="min-w-0 break-words text-base font-semibold leading-snug text-ink underline-offset-2 hover:underline [overflow-wrap:anywhere]"
        >
          {job.title}
        </Link>
        <StatusPill>{JOB_STATUS_LABELS[job.status]}</StatusPill>
      </div>
      </div>
      <p className="mt-1.5 line-clamp-2 break-words text-sm leading-6 text-ink-soft [overflow-wrap:anywhere]">
        {job.description}
      </p>
      <JobTags job={job} className="mt-3" />
      <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
          <ProfileLink wallet={job.employerWallet} prefix="Employer" />
          <span className="rounded-full bg-paper-2 px-2 py-0.5 font-medium text-ink-soft">{job.paymentMode}</span>
          <span>Posted {new Date(job.createdAt).toLocaleDateString()}</span>
        </p>
        <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,white)] px-3 py-1 text-sm font-semibold text-ink">
          {amountLabel(job.paymentMode)}: {formatMarketplaceAmount(job.budgetAmount)}
        </span>
      </div>
      {footer}
    </article>
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
  onRetry,
}: {
  status: "idle" | "loading" | "error";
  error?: MarketplaceApiError;
  wallet: string | null;
  onVerify: () => void;
  verifying: boolean;
  /** Shown for transient failures (network, 5xx) so the user can reload in place. */
  onRetry?: () => void;
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
    return <ErrorState title="Could not load this page" error={error} onRetry={onRetry} />;
  }
  return (
    <div role="status" aria-live="polite" className="grid min-w-0 gap-3">
      <span className="sr-only">Loading...</span>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-20 animate-pulse rounded-[20px] border border-line bg-card motion-reduce:animate-none"
        />
      ))}
    </div>
  );
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

/**
 * Visual service card. Media is only the seller's own cover / avatar (https,
 * set by the seller); otherwise a category gradient. A small badge shows when
 * the gig includes a playable video; its play button opens an accessible player.
 */
export function GigSummaryCard({
  gig,
  footer,
}: {
  gig: PublicGig & { seller?: ProfileSummary | null };
  footer?: ReactNode;
}) {
  const primary: MarketplaceCategorySlug | "none" = gigCategory(gig) ?? "none";
  const seller = gig.seller ?? null;
  const cover = gig.coverUrl ?? null;
  const hasVideo = playableVideoUrl(gig.videoUrl) !== null;
  const delivery = gigDeliveryLabel(gig.deliveryDays);
  return (
    <article className="pf-card group flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-line bg-card shadow-[var(--shadow)]">
      <div className="relative">
      <Link
        href={gigHref(gig.id)}
        aria-label={gig.title}
        className={`relative flex aspect-[16/10] items-center justify-center overflow-hidden ${COVER_GRADIENTS[primary]}`}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="pf-zoom absolute inset-0 h-full w-full object-cover"
          />
        ) : seller?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={seller.avatarUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="pf-zoom h-16 w-16 rounded-full border-2 border-white/70 object-cover shadow-lg sm:h-20 sm:w-20"
          />
        ) : (
          <CategoryArt slug={primary} className="pf-zoom absolute inset-0 h-full w-full" />
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(4,10,20,.55))]"
        />
        {primary !== "none" ? (
          <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            {categoryLabel(primary)}
          </span>
        ) : null}
        {gig.status !== "active" ? (
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink">
            {GIG_STATUS_LABELS[gig.status]}
          </span>
        ) : hasVideo ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            <Play size={11} aria-hidden="true" className="fill-white" />
            Video
          </span>
        ) : null}
      </Link>
      {hasVideo ? (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <GigVideoButton title={gig.title} videoUrl={gig.videoUrl} posterUrl={cover} className="pf-play" />
        </span>
      ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <p className="flex min-w-0 items-center gap-2 text-xs text-ink-faint">
          <Avatar url={seller?.avatarUrl ?? null} size={22} />
          <ProfileLink wallet={gig.freelancerWallet} label={seller?.displayName || undefined} />
        </p>
        <Link
          href={gigHref(gig.id)}
          className="line-clamp-2 min-w-0 break-words font-semibold leading-snug text-ink underline-offset-2 hover:underline [overflow-wrap:anywhere]"
        >
          {gig.title}
        </Link>
        <SkillList skills={gig.skills.slice(0, 4)} />
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-faint">
          <span>{DELIVERY_TERMS[gig.paymentMode]}</span>
          {delivery ? <span>{delivery}</span> : null}
          {(gig.packages ?? []).length > 0 ? <span>{gig.packages.length} packages</span> : null}
        </p>
        <div className="mt-auto flex min-w-0 flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
          <span className="text-xs uppercase tracking-wide text-ink-faint">{gig.paymentMode}</span>
          <span className="text-base font-semibold text-ink">{gigPriceLabel(gig)}</span>
        </div>
        {footer}
      </div>
    </article>
  );
}
/** Public profile card: safe listing fields only. */
export function FreelancerSummaryCard({ freelancer }: { freelancer: FreelancerCardData }) {
  const available = freelancer.availability === "available";
  return (
    <article className="pf-card group relative flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-line bg-card shadow-[var(--shadow)]">
      <div
        aria-hidden="true"
        className="pf-zoom h-16 bg-[radial-gradient(120%_140%_at_0%_0%,#2ee6d6_0%,transparent_55%),radial-gradient(120%_140%_at_100%_0%,#8b7bff_0%,transparent_55%),linear-gradient(135deg,#0a1628,#13315c)]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 pb-4">
        <div className="-mt-7 flex min-w-0 items-end gap-3">
          <span className="rounded-full border-4 border-card bg-card">
            <Avatar url={freelancer.avatarUrl} size={56} />
          </span>
          <span
            className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              available ? "bg-[color-mix(in_srgb,var(--ok)_14%,white)] text-ok" : "bg-paper-2 text-ink-faint"
            }`}
          >
            <span aria-hidden="true" className={`size-1.5 rounded-full ${available ? "bg-ok" : "bg-ink-faint"}`} />
            {AVAILABILITY_LABELS[freelancer.availability]}
          </span>
        </div>
        <div className="min-w-0">
          <Link
            href={profileHref(freelancer.wallet)}
            className="block truncate font-semibold text-ink underline-offset-2 hover:underline"
          >
            {freelancer.displayName || shortWallet(freelancer.wallet)}
          </Link>
          {freelancer.headline ? (
            <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-ink-soft [overflow-wrap:anywhere]">
              {freelancer.headline}
            </p>
          ) : null}
        </div>
        <SkillList skills={freelancer.skills.slice(0, 5)} />
        <div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
          <Link href={profileHref(freelancer.wallet)} className="font-semibold text-accent">
            View profile
          </Link>
          {freelancer.rateAmount ? (
            <span className="font-semibold text-ink">{formatMarketplaceAmount(freelancer.rateAmount)} / hour</span>
          ) : (
            <span className="text-ink-faint">Rate on request</span>
          )}
        </div>
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
    <div className="min-w-0 rounded-[20px] border border-dashed border-line bg-[radial-gradient(420px_160px_at_50%_0%,rgba(46,230,214,.10),transparent_70%)] bg-card-2 px-6 py-10 text-center">
      <span
        aria-hidden="true"
        className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(46,230,214,.18),rgba(139,123,255,.18))] text-accent"
      >
        <Sparkles size={18} />
      </span>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {children ? <div className="mt-2 text-sm text-ink-soft">{children}</div> : null}
    </div>
  );
}
/** Discovery load failure with a retry. Browsing never needs a wallet, so this never asks for one. */
export function ErrorState({
  title,
  error,
  onRetry,
}: {
  title: string;
  error?: MarketplaceApiError;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex min-w-0 flex-col items-center gap-3 rounded-[20px] border border-line bg-card px-6 py-8 text-center shadow-[var(--shadow)]"
    >
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--danger)_10%,white)] text-danger"
      >
        <CloudOff size={18} />
      </span>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm text-ink-soft">
          {error?.message ?? "Could not reach PREMIFLOW. Try again."}
        </p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="pf-chip inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-accent/50"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Try again
        </button>
      ) : null}
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
