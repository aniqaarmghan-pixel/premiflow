"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Layers,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";

import {
  FEATURED_NOTE,
  HOW_IT_WORKS,
  TRUST_POINTS,
  searchPageHref,
} from "@/lib/app/marketplace";
import {
  FEATURED_CATEGORY_SLUGS,
  MARKETPLACE_CATEGORIES,
  categoryBySlug,
} from "@/lib/app/marketplace-categories";
import { WHY_PREMIFLOW as WHY_MODES } from "@/lib/app/differentiation";
import { WHY_PREMIFLOW, WHY_SOLANA, WHY_WEB3 } from "@/lib/app/positioning";
import { SUBSCRIPTION_PLANS, planPriceLabel } from "@/lib/app/subscription-plans";
import { fetchFreelancers, searchGigs, searchJobs } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";
import { Aurora } from "@/components/site/Aurora";
import { CategorySceneArt } from "@/components/site/CategorySceneArt";
import { Reveal } from "@/components/site/Reveal";

import { MarketplaceExplainerSection } from "./MarketplaceExplainerSection";
import {
  EmptyState,
  ErrorState,
  FreelancerSummaryCard,
  GigSummaryCard,
  JobSummaryCard,
  SkeletonGrid,
} from "./MarketplaceParts";

const SEARCH_SCOPES = [
  { value: "all", label: "Everything" },
  { value: "gigs", label: "Gigs" },
  { value: "jobs", label: "Jobs" },
  { value: "freelancers", label: "Freelancers" },
] as const;

const WHY_CARDS = WHY_PREMIFLOW.points.filter((p) =>
  [
    "Fixed, Milestone, Streaming and Hourly",
    "Protected funding and settlement",
    "Transparent fees",
    "Human final resolution",
  ].includes(p.title)
);

function delay(ms: number): CSSProperties {
  return { "--pf-d": `${ms}ms` } as CSSProperties;
}

function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  href,
  cta,
  dark = false,
  id,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  href?: string;
  cta?: string;
  dark?: boolean;
  id?: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? (
          <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${dark ? "text-aqua" : "text-accent"}`}>
            {eyebrow}
          </p>
        ) : null}
        <h2
          id={id}
          className={`mt-2 font-display text-2xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-[2.1rem] ${
            dark ? "text-white" : "text-ink"
          }`}
        >
          {title}
        </h2>
        {subtitle ? (
          <p className={`mt-2 text-sm leading-6 sm:text-base ${dark ? "text-white/65" : "text-ink-soft"}`}>{subtitle}</p>
        ) : null}
      </div>
      {href && cta ? (
        <Link
          href={href}
          className={`group inline-flex items-center gap-1.5 text-sm font-semibold ${dark ? "text-aqua" : "text-accent"}`}
        >
          {cta}
          <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}

function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<(typeof SEARCH_SCOPES)[number]["value"]>("all");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (scope !== "all") params.set("type", scope);
    const qs = params.toString();
    router.push(qs ? `/marketplace/search?${qs}` : "/marketplace/search");
  }

  return (
    <form onSubmit={submit} className="mt-8 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
      <label className="sr-only" htmlFor="pf-market-search">
        Search the marketplace
      </label>
      <div className="relative min-w-0 flex-1">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          id="pf-market-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search jobs, gigs or freelancers"
          className="h-12 w-full rounded-full border border-white/15 bg-white/10 pl-11 pr-4 text-sm text-white placeholder:text-white/40 outline-none focus:border-aqua/60"
        />
      </div>
      <select
        aria-label="Search scope"
        value={scope}
        onChange={(e) => setScope(e.target.value as (typeof SEARCH_SCOPES)[number]["value"])}
        className="h-12 rounded-full border border-white/15 bg-white/10 px-4 text-sm text-white outline-none focus:border-aqua/60 sm:w-36"
      >
        {SEARCH_SCOPES.map((s) => (
          <option key={s.value} value={s.value} className="text-ink">
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-ink transition hover:bg-white/90"
      >
        Search
      </button>
    </form>
  );
}

/** Two-column hero lifecycle illustration (example milestone contract). */
function LifecycleVisual() {
  const steps = [
    { label: "Offer accepted", state: "done" as const },
    { label: "Funds in escrow", state: "active" as const },
    { label: "Work delivered", state: "next" as const },
    { label: "Release or resolve", state: "next" as const },
  ];
  return (
    <figure
      aria-label="Illustration of a protected contract lifecycle"
      className="pf-hero-in pf-escrow-breathe relative w-full max-w-md rounded-[28px] border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl"
      style={delay(420)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#2ee6d6,#4f8cff)] text-midnight">
            <LockKeyhole size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Protected lifecycle</p>
            <p className="text-xs text-white/55">Funds held by the program</p>
          </div>
        </div>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
          Example
        </span>
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                s.state === "done"
                  ? "bg-aqua/20 text-aqua"
                  : s.state === "active"
                    ? "bg-[linear-gradient(135deg,#2ee6d6,#4f8cff)] text-midnight"
                    : "border border-white/15 text-white/45"
              }`}
            >
              {i + 1}
            </span>
            <span className={`text-sm ${s.state === "next" ? "text-white/50" : "text-white/90"}`}>{s.label}</span>
            {s.state === "done" ? <CheckCircle2 size={14} className="ml-auto text-aqua" aria-hidden="true" /> : null}
            {s.state === "active" ? (
              <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-aqua">
                Now
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="pf-fill h-full w-1/2 rounded-full bg-[linear-gradient(90deg,#2ee6d6,#4f8cff)]" />
      </div>
      <figcaption className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-white/50">
        Escrow releases only when both sides follow the rules they signed.
      </figcaption>
    </figure>
  );
}

function PaymentModeIcon({ mode }: { mode: string }) {
  const common = "size-5";
  if (mode === "fixed") return <Layers className={common} aria-hidden="true" />;
  if (mode === "milestone") return <CheckCircle2 className={common} aria-hidden="true" />;
  if (mode === "streaming") return <Waves className={common} aria-hidden="true" />;
  return <Clock3 className={common} aria-hidden="true" />;
}

function ModeArt({ mode }: { mode: string }) {
  // Distinct lightweight SVG per payment model (brand colors only).
  const ink = "#9ff6ee";
  if (mode === "fixed") {
    return (
      <svg viewBox="0 0 120 72" className="h-16 w-full" aria-hidden="true">
        <rect x="24" y="16" width="72" height="44" rx="10" fill="none" stroke={ink} strokeWidth="2.5" />
        <path d="M40 36h40M40 46h24" stroke={ink} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <circle cx="84" cy="28" r="6" fill={ink} opacity="0.85" />
      </svg>
    );
  }
  if (mode === "milestone") {
    return (
      <svg viewBox="0 0 120 72" className="h-16 w-full" aria-hidden="true">
        <path d="M20 48h80" stroke={ink} strokeWidth="2" opacity="0.4" />
        {[32, 60, 88].map((x, i) => (
          <g key={x}>
            <circle cx={x} cy="48" r="8" fill={i === 0 ? ink : "none"} stroke={ink} strokeWidth="2.5" />
            {i === 0 ? <path d="M28 48l3 3 6-7" stroke="#041018" strokeWidth="2" fill="none" /> : null}
          </g>
        ))}
      </svg>
    );
  }
  if (mode === "streaming") {
    return (
      <svg viewBox="0 0 120 72" className="h-16 w-full" aria-hidden="true">
        <path d="M16 40c12-16 20-16 32 0s20 16 32 0 20-16 28 0" fill="none" stroke={ink} strokeWidth="2.5" />
        <path d="M16 52c12-16 20-16 32 0s20 16 32 0 20-16 28 0" fill="none" stroke={ink} strokeWidth="2" opacity="0.45" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 72" className="h-16 w-full" aria-hidden="true">
      <circle cx="60" cy="36" r="22" fill="none" stroke={ink} strokeWidth="2.5" />
      <path d="M60 24v12l8 6" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function HowItWorksTimeline() {
  return (
    <Reveal as="div" className="relative mt-10">
      <div aria-hidden="true" className="absolute left-[8%] right-[8%] top-6 hidden h-px bg-white/10 lg:block">
        <div className="pf-flow-track h-full bg-[linear-gradient(90deg,#2ee6d6,#4f8cff_50%,#8b7bff)]" />
      </div>
      <ol className="relative grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.title} className="min-w-0 text-left lg:text-center">
            <span
              className="pf-flow-dot mx-0 flex size-12 items-center justify-center rounded-full border border-white/15 bg-midnight text-sm font-semibold text-white lg:mx-auto"
              style={delay(240 + i * 280)}
            >
              {i + 1}
            </span>
            <p className="mt-4 font-semibold text-white">{step.title}</p>
            <p className="mt-1 text-sm leading-6 text-white/60">{step.body}</p>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}

export function MarketplaceHome() {
  const [showAllCategories, setShowAllCategories] = useState(false);
  const gigs = useMarketplaceQuery("home-gigs", () => searchGigs("?limit=6"));
  const jobs = useMarketplaceQuery("home-jobs", () => searchJobs("?limit=4"));
  const people = useMarketplaceQuery("home-freelancers", () => fetchFreelancers("?featured=1&limit=6"));
  const featuredCats = FEATURED_CATEGORY_SLUGS.map((slug) => categoryBySlug(slug));
  const categoryList = showAllCategories ? MARKETPLACE_CATEGORIES : featuredCats;

  return (
    <div className="min-w-0">
      {/* 1. Hero */}
      <section className="pf-midnight relative isolate overflow-hidden pb-20 pt-28 sm:pt-32 lg:pb-28 lg:pt-40">
        <Aurora className="-z-10" />
        <div aria-hidden="true" className="pf-grid-fade absolute inset-0 -z-10" />
        <Container className="grid min-w-0 items-center gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p
              className="pf-hero-in inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-aqua sm:text-xs"
              style={delay(0)}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              PREMIFLOW Marketplace
            </p>
            <h1
              className="pf-hero-in mt-5 font-display text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl lg:text-7xl"
              style={delay(90)}
            >
              <span className="pf-gradient-text">Solana-protected freelance contracts.</span>
            </h1>
            <p className="pf-hero-in mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg" style={delay(180)}>
              Hire or get hired with escrow on Solana. Choose Fixed, Milestone, Streaming, or Hourly — funds stay
              protected until the work is approved.
            </p>
            <div className="pf-hero-in" style={delay(260)}>
              <HeroSearch />
            </div>
            <div
              className="pf-hero-in pf-rail -mx-4 mt-5 flex min-w-0 items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
              style={delay(340)}
            >
              <span className="shrink-0 text-xs font-semibold text-white/45">Popular:</span>
              {featuredCats.slice(0, 6).map((c) => (
                <Link
                  key={c.slug}
                  href={searchPageHref({ category: c.slug })}
                  className="pf-chip shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:border-white/35 hover:bg-white/10"
                >
                  <span className="text-white/85">{c.label}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="hidden justify-end lg:flex">
            <LifecycleVisual />
          </div>
        </Container>
      </section>

      {/* 2. Explainer (existing placeholder modal — polished placement) */}
      <MarketplaceExplainerSection />

      {/* 3. Why PREMIFLOW — 4 cards */}
      <section className="bg-paper py-16 sm:py-24" aria-labelledby="pf-why">
        <Container>
          <Reveal>
            <SectionHeading
              id="pf-why"
              eyebrow={WHY_PREMIFLOW.eyebrow}
              title={WHY_PREMIFLOW.heading}
              subtitle={WHY_PREMIFLOW.intro}
            />
          </Reveal>
          <div className="mt-10 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_CARDS.map((card, i) => (
              <Reveal key={card.title} delay={i * 70}>
                <article className="pf-card flex h-full min-w-0 flex-col rounded-[22px] border border-line bg-card p-5 shadow-[var(--shadow)]">
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <Sparkles size={18} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold text-ink">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">{card.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* 4. How it works — 6-step timeline */}
      <section id="how-it-works" className="pf-midnight relative scroll-mt-20 overflow-hidden py-16 sm:py-24" aria-labelledby="pf-how">
        <div aria-hidden="true" className="pf-grid-fade absolute inset-0" />
        <Container className="relative">
          <Reveal>
            <SectionHeading
              id="pf-how"
              dark
              eyebrow="Discover to paid"
              title="How PREMIFLOW works"
              subtitle="Agree in the marketplace, fund on-chain, deliver, then release — with a human path if something goes wrong."
            />
          </Reveal>
          <HowItWorksTimeline />
        </Container>
      </section>

      {/* 5. Four ways to get paid */}
      <section className="bg-paper py-16 sm:py-24" aria-labelledby="pf-modes">
        <Container>
          <Reveal>
            <SectionHeading
              id="pf-modes"
              eyebrow="Payment models"
              title="Four ways to get paid"
              subtitle={WHY_MODES.subtitle}
            />
          </Reveal>
          <div className="mt-10 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_MODES.modes.map((m, i) => (
              <Reveal key={m.key} delay={i * 70}>
                <article
                  className={`pf-card flex h-full min-w-0 flex-col overflow-hidden rounded-[22px] border p-5 shadow-[var(--shadow)] ${
                    m.featured ? "pf-midnight border-white/10 text-white" : "border-line bg-card"
                  }`}
                >
                  <div className={`rounded-2xl ${m.featured ? "bg-white/5" : "bg-paper"} px-2 pt-2`}>
                    <ModeArt mode={m.key} />
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <span className={m.featured ? "text-aqua" : "text-accent"}>
                      <PaymentModeIcon mode={m.key} />
                    </span>
                    <h3 className={`font-semibold ${m.featured ? "text-white" : "text-ink"}`}>{m.title}</h3>
                  </div>
                  <p className={`mt-2 text-sm leading-6 ${m.featured ? "text-white/75" : "text-ink-soft"}`}>{m.summary}</p>
                  <p className={`mt-auto pt-3 text-xs ${m.featured ? "text-white/55" : "text-ink-faint"}`}>Fits: {m.fit}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* 6. Browse by category — featured 8 + view all */}
      <section className="border-y border-line bg-card-2 py-16 sm:py-24" aria-labelledby="pf-cat" id="categories">
        <Container>
          <Reveal>
            <SectionHeading
              id="pf-cat"
              eyebrow="Explore"
              title="Browse by category"
              subtitle="From smart contracts to support ops: find the right specialist or the right project."
              href="/marketplace/search"
              cta="Search everything"
            />
          </Reveal>
          <div className="mt-10 grid min-w-0 grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {categoryList.map((c, i) => (
              <Reveal key={c.slug} delay={Math.min(i, 7) * 50}>
                <Link
                  href={searchPageHref({ category: c.slug })}
                  className="pf-card pf-glow-card group relative flex aspect-[4/3] min-w-0 flex-col justify-end overflow-hidden rounded-[22px] border border-line p-4 shadow-[var(--shadow)] sm:p-5"
                >
                  <CategorySceneArt slug={c.slug} className="pf-zoom absolute inset-0 h-full w-full" />
                  <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgba(4,10,20,.35)_55%,rgba(4,10,20,.86))]" />
                  <span className="relative block font-semibold text-white sm:text-lg">{c.label}</span>
                  <span className="relative mt-1 hidden text-xs leading-5 text-white/75 sm:block">{c.blurb}</span>
                </Link>
              </Reveal>
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAllCategories((v) => !v)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-5 text-sm font-semibold text-ink shadow-[var(--shadow)] transition hover:border-accent/40"
            >
              {showAllCategories ? "Show featured categories" : "View all categories"}
              <ArrowRight size={16} aria-hidden="true" className={showAllCategories ? "rotate-90" : ""} />
            </button>
          </div>
        </Container>
      </section>

      {/* Featured gigs (title-seeded covers) */}
      <section className="bg-paper py-16 sm:py-24" aria-labelledby="pf-gigs">
        <Container>
          <Reveal>
            <SectionHeading
              id="pf-gigs"
              eyebrow="Services"
              title="Featured gigs"
              subtitle="Each cover is a product preview drawn from the gig's own title, unless the seller uploads one."
              href="/marketplace/gigs"
              cta="All gigs"
            />
          </Reveal>
          <div className="mt-10">
            {gigs.status === "ready" ? (
              gigs.data.gigs.length ? (
                <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {gigs.data.gigs.map((gig, i) => (
                    <Reveal key={gig.id} delay={(i % 3) * 70}>
                      <GigSummaryCard gig={gig} />
                    </Reveal>
                  ))}
                </div>
              ) : (
                <EmptyState title="No gigs yet">
                  <Link href="/marketplace/gigs/new" className="font-semibold text-accent underline">
                    Offer a gig
                  </Link>
                </EmptyState>
              )
            ) : gigs.status === "error" ? (
              <ErrorState title="Gigs could not load" error={gigs.error} onRetry={gigs.reload} />
            ) : (
              <SkeletonGrid count={3} />
            )}
          </div>
        </Container>
      </section>

      {/* Jobs + freelancers (compact discovery) */}
      <section className="border-y border-line bg-paper-2/60 py-16 sm:py-24">
        <Container className="grid min-w-0 gap-14 lg:grid-cols-2">
          <div>
            <Reveal>
              <SectionHeading eyebrow="Open work" title="Latest jobs" href="/marketplace/jobs" cta="All jobs" />
            </Reveal>
            <div className="mt-8">
              {jobs.status === "ready" ? (
                jobs.data.jobs.length ? (
                  <div className="grid min-w-0 gap-4">
                    {jobs.data.jobs.slice(0, 3).map((job, i) => (
                      <Reveal key={job.id} delay={i * 60}>
                        <JobSummaryCard job={job} wholeCardLink />
                      </Reveal>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No open jobs yet">
                    <Link href="/marketplace/post" className="font-semibold text-accent underline">
                      Post a job
                    </Link>
                  </EmptyState>
                )
              ) : jobs.status === "error" ? (
                <ErrorState title="Jobs could not load" error={jobs.error} onRetry={jobs.reload} />
              ) : (
                <SkeletonGrid count={2} />
              )}
            </div>
          </div>
          <div>
            <Reveal>
              <SectionHeading
                eyebrow="Talent"
                title="Freelancers"
                subtitle={FEATURED_NOTE}
                href="/marketplace/freelancers"
                cta="Browse profiles"
              />
            </Reveal>
            <div className="mt-8">
              {people.status === "ready" ? (
                people.data.freelancers.length ? (
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    {people.data.freelancers.slice(0, 4).map((person, i) => (
                      <Reveal key={person.wallet} delay={(i % 2) * 60}>
                        <FreelancerSummaryCard freelancer={person} />
                      </Reveal>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No complete profiles yet">
                    <Link href="/marketplace/profile" className="font-semibold text-accent underline">
                      Complete your profile
                    </Link>
                  </EmptyState>
                )
              ) : people.status === "error" ? (
                <ErrorState title="Profiles could not load" error={people.error} onRetry={people.reload} />
              ) : (
                <SkeletonGrid count={2} />
              )}
            </div>
          </div>
        </Container>
      </section>

      {/* 8. Why Solana / Web3 */}
      <section className="pf-midnight relative overflow-hidden py-16 sm:py-24" aria-labelledby="pf-solana">
        <Aurora className="opacity-35" />
        <Container className="relative grid min-w-0 gap-8 lg:grid-cols-2">
          <Reveal>
            <article className="h-full rounded-[24px] border border-white/10 bg-white/[0.04] p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aqua">Settlement</p>
              <h2 id="pf-solana" className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">
                {WHY_SOLANA.heading}
              </h2>
              <ul className="mt-5 space-y-2.5 text-sm leading-6 text-white/70">
                {WHY_SOLANA.points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-aqua" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
          <Reveal delay={100}>
            <article className="h-full rounded-[24px] border border-white/10 bg-white/[0.04] p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aqua">Where Web3 helps</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">{WHY_WEB3.heading}</h2>
              <ul className="mt-5 space-y-2.5 text-sm leading-6 text-white/70">
                {WHY_WEB3.points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-aqua" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
        </Container>
      </section>

      {/* Trust strip */}
      <section className="pf-midnight border-t border-white/10 py-14 sm:py-16" aria-labelledby="pf-trust">
        <Container>
          <Reveal>
            <h2 id="pf-trust" className="font-display text-2xl font-semibold text-white sm:text-3xl">
              Escrow and security
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65">
              The marketplace helps you agree. The PREMIFLOW program holds the money and releases it by the rules both
              sides signed.
            </p>
          </Reveal>
          <div className="mt-8 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_POINTS.map((point, i) => (
              <Reveal key={point.title} delay={i * 60}>
                <div className="h-full min-w-0 rounded-[20px] border border-white/10 bg-white/[0.04] p-5">
                  <p className="font-semibold text-white">{point.title}</p>
                  <p className="mt-1.5 text-sm leading-6 text-white/60">{point.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* 9. Pricing teaser */}
      <section className="bg-paper py-16 sm:py-24" aria-labelledby="pf-pricing-teaser">
        <Container>
          <Reveal>
            <SectionHeading
              id="pf-pricing-teaser"
              eyebrow="Plans"
              title="Transparent plan-based fees"
              subtitle="One subscription applies to hiring and working when using the subscribed wallet. Free, Pro and Premium — see full details on Pricing."
              href="/pricing"
              cta="View pricing"
            />
          </Reveal>
          <div className="mt-10 grid min-w-0 gap-4 md:grid-cols-3">
            {SUBSCRIPTION_PLANS.map((plan, i) => (
              <Reveal key={plan.tier} delay={i * 70}>
                <article className="pf-card flex h-full flex-col rounded-[22px] border border-line bg-card p-5 shadow-[var(--shadow)]">
                  <h3 className="font-display text-xl text-ink">{plan.name}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{plan.audience}</p>
                  <p className="mt-4 font-display text-2xl text-ink">{planPriceLabel(plan, "Monthly")}</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{plan.feeLabel}</p>
                  <Link
                    href="/pricing"
                    className="mt-auto pt-5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
                  >
                    See plan details
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* 10. Final CTA */}
      <section className="bg-paper pb-20 pt-4 sm:pb-24">
        <Container>
          <Reveal>
            <div className="relative isolate overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#040a14,#13315c_50%,#0d9488)] px-6 py-12 text-white sm:px-12 sm:py-16 lg:py-12">
              <div
                aria-hidden="true"
                className="absolute -right-24 -top-24 -z-10 size-80 rounded-full bg-[radial-gradient(circle,rgba(139,123,255,.45),transparent_65%)] blur-2xl"
              />
              <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-[-0.03em] sm:text-5xl lg:text-[2.6rem]">
                Ready to start?
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/75 sm:text-base">
                Post a job to receive proposals, or offer a gig so employers can hire you directly. You only connect a
                wallet when you post, hire or fund.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/marketplace/post"
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold transition hover:bg-white/90"
                >
                  <span className="text-ink">Post a job</span>
                  <ArrowRight size={16} aria-hidden="true" className="text-ink" />
                </Link>
                <Link
                  href="/marketplace/gigs/new"
                  className="inline-flex min-h-12 items-center rounded-full border border-white/40 px-6 text-sm font-semibold transition hover:bg-white/10"
                >
                  <span className="text-white">Offer a gig</span>
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex min-h-12 items-center rounded-full border border-white/40 px-6 text-sm font-semibold transition hover:bg-white/10"
                >
                  <span className="text-white">View pricing</span>
                </Link>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
