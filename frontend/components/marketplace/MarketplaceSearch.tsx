"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { buildSearchQuery, searchFormFromParams } from "@/lib/app/marketplace";
import { isCategorySlug } from "@/lib/app/marketplace-categories";
import { searchMarketplace } from "@/lib/app/marketplace-client";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";

import {
  EmptyState,
  ErrorState,
  FreelancerSummaryCard,
  GigSummaryCard,
  JobSummaryCard,
  MarketplaceHeader,
  SearchFilters,
  SkeletonGrid,
} from "./MarketplaceParts";

const TYPES = [
  { value: "all", label: "All" },
  { value: "gigs", label: "Gigs" },
  { value: "jobs", label: "Jobs" },
  { value: "freelancers", label: "Freelancers" },
] as const;
type SearchTypeValue = (typeof TYPES)[number]["value"];

/** Unified search; the URL is the source of truth so results are shareable. */
export function MarketplaceSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const locked = lockedCreatePayment();
  const [filterError, setFilterError] = useState<string | null>(null);

  const form = searchFormFromParams(params, locked.decimals, isCategorySlug);
  const typeParam = params.get("type") ?? "all";
  const type: SearchTypeValue = TYPES.some((t) => t.value === typeParam) ? (typeParam as SearchTypeValue) : "all";
  const built = buildSearchQuery(form, locked.decimals);
  const base = built.ok ? built.qs : "";
  const withType = (t: SearchTypeValue, qs: string) =>
    t === "all" ? qs : qs ? `${qs}&type=${t}` : `?type=${t}`;
  const apiQs = withType(type, base);

  const query = useMarketplaceQuery(`search${apiQs}`, () => searchMarketplace(apiQs));
  const go = (qs: string) => router.replace(`/marketplace/search${qs}`, { scroll: false });

  const sections =
    query.status === "ready"
      ? {
          gigs: query.data.gigs,
          jobs: query.data.jobs,
          freelancers: query.data.freelancers,
        }
      : null;
  const total = sections ? sections.gigs.length + sections.jobs.length + sections.freelancers.length : 0;

  return (
    <div className="pf-fade-in min-w-0 space-y-4">
      <MarketplaceHeader
        hero
        eyebrow="Search"
        art="ai" title="Search" subtitle="Jobs, gigs and freelancer profiles in one place." />
      <SearchFilters
        key={base}
        initial={form}
        tokenName={locked.tokenName}
        amountNoun="Price"
        onApply={(next) => {
          const res = buildSearchQuery(next, locked.decimals);
          if (!res.ok) {
            setFilterError(res.message);
            return;
          }
          setFilterError(null);
          go(withType(type, res.qs));
        }}
      />
      {filterError ? <p className="text-sm text-danger">{filterError}</p> : null}
      <div role="tablist" aria-label="Result type" className="flex min-w-0 flex-wrap gap-2">
        {TYPES.map((t) => {
          const active = t.value === type;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go(withType(t.value, base))}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active ? "border-ink bg-ink text-white" : "border-line bg-card text-ink hover:bg-paper-2"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {query.status === "error" ? (
        <ErrorState title="Search could not run" error={query.error} onRetry={query.reload} />
      ) : !sections ? (
        <SkeletonGrid count={6} tall />
      ) : total === 0 ? (
        <EmptyState title="Nothing matches these filters yet.">
          Try fewer filters, or{" "}
          <Link href="/marketplace/post" className="font-medium text-accent underline">
            post a job
          </Link>{" "}
          so freelancers can find you.
        </EmptyState>
      ) : (
        <div className="min-w-0 space-y-8">
          {sections.gigs.length ? (
            <section className="min-w-0 space-y-3">
              <h2 className="font-display text-lg">Gigs</h2>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sections.gigs.map((gig) => (
                  <GigSummaryCard key={gig.id} gig={gig} />
                ))}
              </div>
            </section>
          ) : null}
          {sections.jobs.length ? (
            <section className="min-w-0 space-y-3">
              <h2 className="font-display text-lg">Jobs</h2>
              <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                {sections.jobs.map((job) => (
                  <JobSummaryCard key={job.id} job={job} />
                ))}
              </div>
            </section>
          ) : null}
          {sections.freelancers.length ? (
            <section className="min-w-0 space-y-3">
              <h2 className="font-display text-lg">Freelancers</h2>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sections.freelancers.map((f) => (
                  <FreelancerSummaryCard key={f.wallet} freelancer={f} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
