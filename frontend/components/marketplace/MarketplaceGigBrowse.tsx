"use client";

import Link from "next/link";
import { useState } from "react";

import { GIG_COPY, buildSearchQuery } from "@/lib/app/marketplace";
import { searchGigs } from "@/lib/app/marketplace-client";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";

import {
  EmptyState,
  ErrorState,
  GigSummaryCard,
  MarketplaceHeader,
  SearchFilters,
  SkeletonGrid,
} from "./MarketplaceParts";

export function MarketplaceGigBrowse() {
  const locked = lockedCreatePayment();
  const [qs, setQs] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const query = useMarketplaceQuery(`gigs${qs}`, () => searchGigs(qs));
  return (
    <div className="pf-fade-in min-w-0 space-y-4">
      <MarketplaceHeader
        hero
        eyebrow="Gigs"
        art="video" title={GIG_COPY.browseTitle} subtitle={GIG_COPY.browseSubtitle} />
      <SearchFilters
        tokenName={locked.tokenName}
        amountNoun="Price"
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
        query.data.gigs.length === 0 ? (
          <EmptyState title={GIG_COPY.empty}>
            <Link href="/marketplace/gigs/new" className="font-medium text-accent underline">
              Offer a gig
            </Link>
          </EmptyState>
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.gigs.map((gig) => (
              <GigSummaryCard key={gig.id} gig={gig} />
            ))}
          </div>
        )
      ) : query.status === "error" ? (
        <ErrorState title="Gigs could not load" error={query.error} onRetry={query.reload} />
      ) : (
        <SkeletonGrid count={6} tall />
      )}
    </div>
  );
}
