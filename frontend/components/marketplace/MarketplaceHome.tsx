"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  Blocks,
  Bot,
  Briefcase,
  CheckCircle2,
  Clapperboard,
  Code,
  LockKeyhole,
  Megaphone,
  Palette,
  PenLine,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import {
  FEATURED_NOTE,
  HOW_IT_WORKS,
  TRUST_POINTS,
  searchPageHref,
} from "@/lib/app/marketplace";
import { MARKETPLACE_CATEGORIES } from "@/lib/app/marketplace-categories";
import { fetchFreelancers, searchGigs, searchJobs } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";
import { Reveal } from "@/components/site/Reveal";

import { MarketplaceHeroVideo } from "./MarketplaceHeroVideo";
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

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  development: Code,
  web3: Blocks,
  design: Palette,
  ai: Bot,
  video: Clapperboard,
  marketing: Megaphone,
  writing: PenLine,
  business: Briefcase,
};

const CATEGORY_TONES: Record<string, string> = {
  development: "from-[#0b2545] via-[#13315c] to-[#12c2b8]",
  web3: "from-[#1b1145] via-[#4f3cc9] to-[#12c2b8]",
  design: "from-[#3b0d3a] via-[#a23b72] to-[#f2a65a]",
  ai: "from-[#06283d] via-[#1363df] to-[#47b5ff]",
  video: "from-[#2b0f0f] via-[#b23a48] to-[#fcb9b2]",
  marketing: "from-[#0f3d2e] via-[#1f8a70] to-[#bfdb38]",
  writing: "from-[#2d2a32] via-[#5c5470] to-[#a9a4c2]",
  business: "from-[#1d2b3a] via-[#3c6e71] to-[#9fc2c4]",
};

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
          className={`mt-2 font-display text-2xl font-semibold tracking-[-0.03em] sm:text-4xl ${
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
  return (
    <form
      role="search"
      aria-label="Search the marketplace"
      className="pf-search mt-8 min-w-0 rounded-[22px] bg-white p-2 shadow-[0_30px_80px_-36px_rgba(0,0,0,.8)]"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(searchPageHref({ q: q.trim().slice(0, 80), type: scope === "all" ? "" : scope }));
      }}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="pf-market-search">
          Search jobs, gigs and freelancers
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
          <Search size={20} aria-hidden="true" className="shrink-0 text-ink-faint" />
          <input
            id="pf-market-search"
            type="search"
            value={q}
            maxLength={80}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Try "Solana smart contract" or "brand identity"'
            className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint sm:text-lg"
          />
        </div>
        <button
          type="submit"
          className="min-h-14 rounded-2xl bg-[linear-gradient(135deg,#0d9488,#12c2b8_45%,#4f8cff_80%,#8b7bff)] px-8 text-base font-semibold text-white shadow-[0_16px_34px_-18px_rgba(46,230,214,.9)] transition hover:brightness-110"
        >
          Search
        </button>
      </div>
      <div role="group" aria-label="Search in" className="flex min-w-0 flex-wrap gap-1.5 px-2 pb-1 pt-2">
        {SEARCH_SCOPES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={scope === s.value}
            onClick={() => setScope(s.value)}
            className={`pf-chip rounded-full border px-3 py-1 text-xs font-semibold ${
              scope === s.value ? "border-accent text-ink" : "border-line text-ink-soft hover:border-ink-faint"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </form>
  );
}

/** Illustrative escrow card (static example values, clearly labelled). */
function EscrowVisual() {
  const milestones = [
    { label: "Discovery and scope", state: "Released" },
    { label: "Build and test", state: "In escrow" },
    { label: "Launch", state: "In escrow" },
  ];
  return (
    <figure
      aria-label="Illustration of a milestone contract held in escrow"
      className="pf-hero-in pf-escrow-breathe relative w-full max-w-md rounded-[28px] border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl"
      style={delay(420)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#2ee6d6,#4f8cff)] text-midnight">
            <LockKeyhole size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Milestone contract</p>
            <p className="text-xs text-white/55">Funds held by the program</p>
          </div>
        </div>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
          Example
        </span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="pf-fill h-full w-1/3 rounded-full bg-[linear-gradient(90deg,#2ee6d6,#4f8cff)]" />
      </div>
      <ul className="mt-4 space-y-2.5">
        {milestones.map((m) => (
          <li key={m.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-white/80">
              <CheckCircle2
                size={16}
                aria-hidden="true"
                className={m.state === "Released" ? "text-aqua" : "text-white/30"}
              />
              {m.label}
            </span>
            <span className={`text-xs font-semibold ${m.state === "Released" ? "text-aqua" : "text-white/55"}`}>
              {m.state}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-white/50">
        Each milestone is released only when the employer approves the delivery.
      </figcaption>
    </figure>
  );
}

/** Discover -> Agree -> Escrow -> Deliver -> Get paid; animates once when scrolled into view. */
function EscrowFlow() {
  return (
    <Reveal as="div" className="relative mt-10">
      <div aria-hidden="true" className="absolute left-[10%] right-[10%] top-6 hidden h-px bg-white/10 lg:block">
        <div className="pf-flow-track h-full bg-[linear-gradient(90deg,#2ee6d6,#4f8cff_50%,#8b7bff)]" />
      </div>
      <ol className="relative grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.title} className="min-w-0 text-left lg:text-center">
            <span
              className="pf-flow-dot mx-0 flex size-12 items-center justify-center rounded-full border border-white/15 bg-midnight text-sm font-semibold text-white lg:mx-auto"
              style={delay(300 + i * 380)}
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
  const gigs = useMarketplaceQuery("home-gigs", () => searchGigs("?limit=6"));
  const jobs = useMarketplaceQuery("home-jobs", () => searchJobs("?limit=4"));
  const people = useMarketplaceQuery("home-freelancers", () => fetchFreelancers("?featured=1&limit=6"));

  return (
    <div className="min-w-0">
      {/* Hero: cinematic, optional owned video (config null by default), poster/gradient fallback. */}
      <section className="pf-midnight relative isolate overflow-hidden pb-20 pt-28 sm:pt-32 lg:pb-28 lg:pt-40">
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <MarketplaceHeroVideo />
        </div>
        <div aria-hidden="true" className="pf-grid-fade absolute inset-0 -z-10" />
        <div
          aria-hidden="true"
          className="absolute -left-40 top-24 -z-10 size-[28rem] rounded-full bg-[radial-gradient(circle,rgba(46,230,214,.22),transparent_65%)] blur-2xl"
        />
        <div
          aria-hidden="true"
          className="absolute -right-32 bottom-0 -z-10 size-[30rem] rounded-full bg-[radial-gradient(circle,rgba(139,123,255,.25),transparent_65%)] blur-2xl"
        />
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
              <span className="pf-gradient-text">Hire talent and get hired, with escrow built in.</span>
            </h1>
            <p className="pf-hero-in mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg" style={delay(180)}>
              Browse jobs, services and freelancer profiles. When you agree on terms, the contract is created and
              funded on-chain from the employer&apos;s own wallet.
            </p>
            <div className="pf-hero-in" style={delay(260)}>
              <HeroSearch />
            </div>
            <div className="pf-hero-in mt-5 flex min-w-0 flex-wrap items-center gap-2" style={delay(340)}>
              <span className="text-xs font-semibold text-white/45">Popular:</span>
              {MARKETPLACE_CATEGORIES.slice(0, 6).map((c) => (
                <Link
                  key={c.slug}
                  href={searchPageHref({ category: c.slug })}
                  className="pf-chip rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold hover:border-white/35 hover:bg-white/10"
                >
                  <span className="text-white/85">{c.label}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="hidden justify-end lg:flex">
            <EscrowVisual />
          </div>
        </Container>
      </section>

      {/* Light: categories */}
      <section className="bg-paper py-16 sm:py-24" aria-labelledby="pf-cat">
        <Container>
          <Reveal>
            <SectionHeading
              id="pf-cat"
              eyebrow="Explore"
              title="Browse by category"
              subtitle="From smart contracts to brand identity: find the right specialist or the right project."
              href="/marketplace/search"
              cta="Search everything"
            />
          </Reveal>
          <div className="mt-10 grid min-w-0 grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {MARKETPLACE_CATEGORIES.map((c, i) => {
              const Icon = CATEGORY_ICONS[c.slug] ?? Briefcase;
              return (
                <Reveal key={c.slug} delay={Math.min(i, 7) * 60}>
                  <Link
                    href={searchPageHref({ category: c.slug })}
                    className="pf-card group relative flex aspect-[4/3] min-w-0 flex-col justify-end overflow-hidden rounded-[22px] border border-line p-4 shadow-[var(--shadow)] sm:p-5"
                  >
                    <span
                      aria-hidden="true"
                      className={`pf-zoom absolute inset-0 bg-gradient-to-br ${CATEGORY_TONES[c.slug] ?? CATEGORY_TONES.development}`}
                    />
                    <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgba(4,10,20,.65))]" />
                    <span
                      aria-hidden="true"
                      className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm"
                    >
                      <Icon size={18} />
                    </span>
                    <span className="relative block font-semibold text-white sm:text-lg">{c.label}</span>
                    <span className="relative mt-1 hidden text-xs leading-5 text-white/75 sm:block">{c.blurb}</span>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Tinted: gigs */}
      <section className="border-y border-line bg-card-2 py-16 sm:py-24">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Services"
              title="Latest gigs"
              subtitle="Services freelancers offer right now. Hiring one opens Create contract with the terms prefilled."
              href="/marketplace/gigs"
              cta="All gigs"
            />
          </Reveal>
          <div className="mt-10">
            {gigs.status === "ready" ? (
              gigs.data.gigs.length ? (
                <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {gigs.data.gigs.map((gig, i) => (
                    <Reveal key={gig.id} delay={(i % 3) * 80}>
                      <GigSummaryCard gig={gig} />
                    </Reveal>
                  ))}
                </div>
              ) : (
                <EmptyState title="No gigs yet">
                  <Link href="/marketplace/gigs/new" className="font-semibold text-accent underline">
                    Offer the first gig
                  </Link>
                </EmptyState>
              )
            ) : gigs.status === "error" ? (
              <ErrorState title="Gigs could not load" error={gigs.error} onRetry={gigs.reload} />
            ) : (
              <SkeletonGrid count={3} tall />
            )}
          </div>
        </Container>
      </section>

      {/* Dark: how it works with the animated flow */}
      <section id="how-it-works" className="pf-midnight relative scroll-mt-20 overflow-hidden py-16 sm:py-24" aria-labelledby="pf-how">
        <div aria-hidden="true" className="pf-grid-fade absolute inset-0" />
        <Container className="relative">
          <Reveal>
            <SectionHeading
              id="pf-how"
              dark
              eyebrow="Discover to paid"
              title="How PREMIFLOW works"
              subtitle="Agree on terms in the marketplace, then let the on-chain contract hold the funds until the work is approved."
            />
          </Reveal>
          <EscrowFlow />
        </Container>
      </section>

      {/* Light: jobs */}
      <section className="bg-paper py-16 sm:py-24">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Open work"
              title="Latest jobs"
              subtitle="Open work posted by employers. Reading and browsing never needs a wallet."
              href="/marketplace/jobs"
              cta="All jobs"
            />
          </Reveal>
          <div className="mt-10">
            {jobs.status === "ready" ? (
              jobs.data.jobs.length ? (
                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                  {jobs.data.jobs.map((job, i) => (
                    <Reveal key={job.id} delay={(i % 2) * 80}>
                      <JobSummaryCard job={job} />
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
        </Container>
      </section>

      {/* Tinted: freelancers */}
      <section className="border-y border-line bg-paper-2/60 py-16 sm:py-24">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Talent"
              title="Featured freelancers"
              subtitle={FEATURED_NOTE}
              href="/marketplace/freelancers"
              cta="All freelancers"
            />
          </Reveal>
          <div className="mt-10">
            {people.status === "ready" ? (
              people.data.freelancers.length ? (
                <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {people.data.freelancers.map((f, i) => (
                    <Reveal key={f.wallet} delay={(i % 3) * 80}>
                      <FreelancerSummaryCard freelancer={f} />
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
              <SkeletonGrid count={3} />
            )}
          </div>
        </Container>
      </section>

      {/* Dark: escrow and security */}
      <section className="pf-midnight relative overflow-hidden py-16 sm:py-24" aria-labelledby="pf-trust">
        <Container className="relative grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aqua">Protected payments</p>
            <h2 id="pf-trust" className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Escrow and security
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/65 sm:text-base">
              The marketplace helps you agree. The PREMIFLOW program holds the money and releases it by the rules
              both sides signed.
            </p>
            <div className="mt-6 flex size-16 items-center justify-center rounded-3xl bg-[linear-gradient(135deg,rgba(46,230,214,.25),rgba(139,123,255,.25))] text-aqua">
              <LockKeyhole size={26} aria-hidden="true" />
            </div>
          </Reveal>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {TRUST_POINTS.map((point, i) => (
              <Reveal key={point.title} delay={i * 80}>
                <div className="h-full min-w-0 rounded-[20px] border border-white/10 bg-white/[0.04] p-5">
                  <p className="font-semibold text-white">{point.title}</p>
                  <p className="mt-1.5 text-sm leading-6 text-white/60">{point.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Premium CTA */}
      <section className="bg-paper py-16 sm:py-24">
        <Container>
          <Reveal>
            <div className="relative isolate overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#040a14,#13315c_50%,#0d9488)] px-6 py-12 text-white sm:px-12 sm:py-16">
              <div
                aria-hidden="true"
                className="absolute -right-24 -top-24 -z-10 size-80 rounded-full bg-[radial-gradient(circle,rgba(139,123,255,.45),transparent_65%)] blur-2xl"
              />
              <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">Ready to start?</h2>
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
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
