"use client";

import Link from "next/link";
import { useState } from "react";

import { FEATURED_NOTE, buildSearchQuery } from "@/lib/app/marketplace";
import { fetchFreelancers } from "@/lib/app/marketplace-client";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";

import {
  EmptyState,
  ErrorState,
  FreelancerSummaryCard,
  MarketplaceHeader,
  SearchFilters,
  SkeletonGrid,
} from "./MarketplaceParts";

export function MarketplaceFreelancers() {
  const locked = lockedCreatePayment();
  const [qs, setQs] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const query = useMarketplaceQuery(`freelancers${qs}`, () => fetchFreelancers(qs));
  return (
    <div className="pf-fade-in min-w-0 space-y-4">
      <MarketplaceHeader
        hero
        eyebrow="Hire talent"
        art="design"
        title="Freelancers"
        subtitle="Public marketplace profiles. Sorting by price uses the hourly rate a freelancer chose to show."
      />
      <SearchFilters
        tokenName={locked.tokenName}
        showMode={false}
        amountNoun="Hourly rate"
        onApply={(form) => {
          const built = buildSearchQuery({ ...form, mode: "" }, locked.decimals);
          if (!built.ok) {
            setFilterError(built.message);
            return;
          }
          setFilterError(null);
          setQs(built.qs);
        }}
      />
      {filterError ? <p className="text-sm text-danger">{filterError}</p> : null}
      <p className="text-xs text-ink-faint">{FEATURED_NOTE.replace("Recently updated profiles", "Profiles")}</p>
      {query.status === "ready" ? (
        query.data.freelancers.length === 0 ? (
          <EmptyState title="No profiles match yet.">
            <Link href="/marketplace/profile" className="font-medium text-accent underline">
              Create your profile
            </Link>
          </EmptyState>
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.freelancers.map((f) => (
              <FreelancerSummaryCard key={f.wallet} freelancer={f} />
            ))}
          </div>
        )
      ) : query.status === "error" ? (
        <ErrorState title="Profiles could not load" error={query.error} onRetry={query.reload} />
      ) : (
        <SkeletonGrid count={6} />
      )}
    </div>
  );
}
