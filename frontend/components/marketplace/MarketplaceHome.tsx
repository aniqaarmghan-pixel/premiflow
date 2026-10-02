"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  FEATURED_NOTE,
  HOW_IT_WORKS,
  TRUST_POINTS,
  searchPageHref,
} from "@/lib/app/marketplace";
import { MARKETPLACE_CATEGORIES } from "@/lib/app/marketplace-categories";
import { fetchFreelancers, searchGigs, searchJobs } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";

import { MarketplaceHeroVideo } from "./MarketplaceHeroVideo";
import {
  EmptyState,
  FreelancerSummaryCard,
  GigSummaryCard,
  JobSummaryCard,
  MarketplaceNav,
  SkeletonGrid,
} from "./MarketplaceParts";

const SEARCH_SCOPES = [
  { value: "all", label: "Everything" },
  { value: "gigs", label: "Gigs" },
  { value: "jobs", label: "Jobs" },
  { value: "freelancers", label: "Freelancers" },
] as const;

function SectionHeading({ title, subtitle, href, cta }: { title: string; subtitle?: string; href?: string; cta?: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="font-display text-xl tracking-tight sm:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {href && cta ? (
        <Link href={href} className="text-sm font-semibold text-accent underline-offset-2 hover:underline">
          {cta}
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
      className="mt-6 flex min-w-0 flex-col gap-2 rounded-2xl bg-white p-2 shadow-[0_24px_60px_-30px_rgba(0,0,0,.6)] sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(searchPageHref({ q: q.trim().slice(0, 80), type: scope === "all" ? "" : scope }));
      }}
    >
      <label className="sr-only" htmlFor="pf-market-search">
        Search jobs, gigs and freelancers
      </label>
      <input
        id="pf-market-search"
        type="search"
        value={q}
        maxLength={80}
        onChange={(e) => setQ(e.target.value)}
        placeholder='Try "Solana smart contract" or "logo design"'
        className="min-h-12 min-w-0 flex-1 rounded-xl px-4 text-base text-ink outline-none placeholder:text-ink-faint"
      />
      <label className="sr-only" htmlFor="pf-market-scope">
        Search in
      </label>
      <select
        id="pf-market-scope"
        value={scope}
        onChange={(e) => setScope(e.target.value as typeof scope)}
        className="min-h-12 rounded-xl border border-line bg-card-2 px-3 text-sm text-ink"
      >
        {SEARCH_SCOPES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="min-h-12 rounded-xl bg-[linear-gradient(135deg,#0d9488,#12c2b8_55%,#4f8cff)] px-6 text-sm font-semibold text-white transition hover:brightness-105"
      >
        Search
      </button>
    </form>
  );
}

export function MarketplaceHome() {
  const gigs = useMarketplaceQuery("home-gigs", () => searchGigs("?limit=6"));
  const jobs = useMarketplaceQuery("home-jobs", () => searchJobs("?limit=4"));
  const people = useMarketplaceQuery("home-freelancers", () => fetchFreelancers("?featured=1&limit=6"));

  return (
    <div className="pf-fade-in min-w-0 space-y-10 sm:space-y-14">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-navy px-5 py-10 text-white sm:px-10 sm:py-16">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(700px_320px_at_10%_0%,rgba(18,194,184,.35),transparent_60%),radial-gradient(600px_300px_at_100%_100%,rgba(79,140,255,.35),transparent_60%)]"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <MarketplaceHeroVideo />
        </div>
        <div className="relative max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan sm:text-xs">
            PREMIFLOW Marketplace
          </p>
          <h1 className="mt-3 font-display text-[2rem] leading-tight tracking-tight sm:text-5xl">
            Hire talent and get hired, with escrow built in.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
            Browse jobs, services and freelancer profiles. When you agree on terms, the contract is created and
            funded on-chain from the employer&apos;s own wallet.
          </p>
          <HeroSearch />
          <div className="mt-4 flex min-w-0 flex-wrap gap-2">
            {MARKETPLACE_CATEGORIES.slice(0, 6).map((c) => (
              <Link
                key={c.slug}
                href={searchPageHref({ category: c.slug })}
                className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold transition hover:bg-white/10"
              >
                <span className="text-white">{c.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <MarketplaceNav />

      <section className="min-w-0 space-y-4" aria-labelledby="pf-cat">
        <h2 id="pf-cat" className="font-display text-xl tracking-tight sm:text-2xl">
          Browse by category
        </h2>
        <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
          {MARKETPLACE_CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={searchPageHref({ category: c.slug })}
              className="pf-lift min-w-0 rounded-[var(--radius)] border border-line bg-card p-4 shadow-[var(--shadow)]"
            >
              <span className="block font-semibold text-ink">{c.label}</span>
              <span className="mt-1 block text-xs leading-5 text-ink-soft">{c.blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <SectionHeading
          title="Latest gigs"
          subtitle="Services freelancers offer right now. Hiring one opens Create contract with the terms prefilled."
          href="/marketplace/gigs"
          cta="All gigs"
        />
        {gigs.status === "ready" ? (
          gigs.data.gigs.length ? (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {gigs.data.gigs.map((gig) => (
                <GigSummaryCard key={gig.id} gig={gig} />
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
          <EmptyState title="Gigs could not load">{gigs.error.message}</EmptyState>
        ) : (
          <SkeletonGrid count={3} tall />
        )}
      </section>

      <section className="min-w-0 space-y-4">
        <SectionHeading title="Latest jobs" subtitle="Open work posted by employers." href="/marketplace/jobs" cta="All jobs" />
        {jobs.status === "ready" ? (
          jobs.data.jobs.length ? (
            <div className="grid min-w-0 gap-3 lg:grid-cols-2">
              {jobs.data.jobs.map((job) => (
                <JobSummaryCard key={job.id} job={job} />
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
          <EmptyState title="Jobs could not load">{jobs.error.message}</EmptyState>
        ) : (
          <SkeletonGrid count={2} />
        )}
      </section>

      <section className="min-w-0 space-y-4">
        <SectionHeading title="Featured freelancers" subtitle={FEATURED_NOTE} href="/marketplace/freelancers" cta="All freelancers" />
        {people.status === "ready" ? (
          people.data.freelancers.length ? (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {people.data.freelancers.map((f) => (
                <FreelancerSummaryCard key={f.wallet} freelancer={f} />
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
          <EmptyState title="Profiles could not load">{people.error.message}</EmptyState>
        ) : (
          <SkeletonGrid count={3} />
        )}
      </section>

      <section className="min-w-0 space-y-4" aria-labelledby="pf-how">
        <h2 id="pf-how" className="font-display text-xl tracking-tight sm:text-2xl">
          How PREMIFLOW works
        </h2>
        <ol className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step.title} className="min-w-0 rounded-[var(--radius)] border border-line bg-card p-4 shadow-[var(--shadow)]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                {i + 1}
              </span>
              <p className="mt-2 font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-xs leading-5 text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="min-w-0 rounded-[28px] border border-line bg-card-2 p-5 sm:p-8" aria-labelledby="pf-trust">
        <h2 id="pf-trust" className="font-display text-xl tracking-tight sm:text-2xl">
          Escrow and security
        </h2>
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          {TRUST_POINTS.map((point) => (
            <div key={point.title} className="min-w-0">
              <p className="font-semibold text-ink">{point.title}</p>
              <p className="mt-1 text-sm leading-6 text-ink-soft">{point.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#07111f,#13315c_55%,#0d9488)] p-6 text-white sm:p-10">
        <h2 className="font-display text-2xl tracking-tight sm:text-3xl">Ready to start?</h2>
        <p className="mt-2 max-w-xl text-sm text-white/75">
          Post a job to receive proposals, or offer a gig so employers can hire you directly.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/marketplace/post" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold">
            <span className="text-ink">Post a job</span>
          </Link>
          <Link href="/marketplace/gigs/new" className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold hover:bg-white/10">
            <span className="text-white">Offer a gig</span>
          </Link>
        </div>
      </section>

      <footer className="min-w-0 border-t border-line pt-6 text-sm text-ink-soft">
        <div className="grid min-w-0 gap-6 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-ink">Discover</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/marketplace/jobs" className="hover:underline">Jobs</Link></li>
              <li><Link href="/marketplace/gigs" className="hover:underline">Gigs</Link></li>
              <li><Link href="/marketplace/freelancers" className="hover:underline">Freelancers</Link></li>
              <li><Link href="/marketplace/search" className="hover:underline">Search</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-ink">Work</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/marketplace/my-jobs" className="hover:underline">My jobs</Link></li>
              <li><Link href="/marketplace/my-proposals" className="hover:underline">My proposals</Link></li>
              <li><Link href="/marketplace/my-gigs" className="hover:underline">My gigs</Link></li>
              <li><Link href="/create" className="hover:underline">Create contract</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-ink">PREMIFLOW</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/about" className="hover:underline">About</Link></li>
              <li><Link href="/support" className="hover:underline">Help &amp; Support</Link></li>
              <li><Link href="/contracts" className="hover:underline">Contracts</Link></li>
            </ul>
          </div>
        </div>
        <p className="mt-6 text-xs text-ink-faint">
          Marketplace listings are off-chain. Contracts, escrow and payments run on the PREMIFLOW Solana program.
        </p>
      </footer>
    </div>
  );
}
