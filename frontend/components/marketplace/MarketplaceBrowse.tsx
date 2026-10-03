"use client";

import Link from "next/link";
import { useState } from "react";

import { MARKETPLACE_COPY, buildSearchQuery } from "@/lib/app/marketplace";
import { searchJobs } from "@/lib/app/marketplace-client";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";

import {
  EmptyState,
  ErrorState,
  JobSummaryCard,
  MarketplaceHeader,
  SearchFilters,
  SkeletonGrid,
} from "./MarketplaceParts";

export function MarketplaceBrowse() {
  const locked = lockedCreatePayment();
  const [qs, setQs] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const query = useMarketplaceQuery(`open-jobs${qs}`, () => searchJobs(qs));
  return (
    <div className="pf-fade-in min-w-0 space-y-4">
      <MarketplaceHeader title={MARKETPLACE_COPY.browseTitle} subtitle={MARKETPLACE_COPY.browseSubtitle} />
      <SearchFilters
        tokenName={locked.tokenName}
        onApply={(form) => {
          const built = buildSearchQuery(form, locked.decimals);
          if (!built.ok) {
            setFilterError(built.message);
            return;
          }
          setFilterError(null);
          setQs(built.qs);
        }}
      />
      {filterError ? <p className="text-sm text-danger">{filterError}</p> : null}
      {query.status === "ready" ? (
        query.data.jobs.length === 0 ? (
          <EmptyState title={MARKETPLACE_COPY.emptyOpenJobs}>
            <Link href="/marketplace/post" className="font-medium text-accent underline">
              Post a job
            </Link>
          </EmptyState>
        ) : (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {query.data.jobs.map((job) => (
              <JobSummaryCard key={job.id} job={job} />
            ))}
          </div>
        )
      ) : query.status === "error" ? (
        <ErrorState title="Jobs could not load" error={query.error} onRetry={query.reload} />
      ) : (
        <SkeletonGrid count={4} />
      )}
    </div>
  );
}
