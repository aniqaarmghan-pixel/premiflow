"use client";

import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { GIG_COPY, buildSearchQuery } from "@/lib/app/marketplace";
import { searchGigs } from "@/lib/app/marketplace-client";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";

import { GigSummaryCard, MarketplaceHeader, SearchFilters } from "./MarketplaceParts";

export function MarketplaceGigBrowse() {
  const locked = lockedCreatePayment();
  const [qs, setQs] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const query = useMarketplaceQuery(`gigs${qs}`, () => searchGigs(qs));
  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader title={GIG_COPY.browseTitle} subtitle={GIG_COPY.browseSubtitle} />
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
        query.data.gigs.length === 0 ? (
          <Card className="p-4 text-sm text-ink-soft">
            {GIG_COPY.empty}{" "}
            <Link href="/marketplace/gigs/new" className="font-medium text-accent underline">
              Offer a gig
            </Link>
          </Card>
        ) : (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {query.data.gigs.map((gig) => (
              <GigSummaryCard key={gig.id} gig={gig} />
            ))}
          </div>
        )
      ) : query.status === "error" ? (
        <Card className="p-4 text-sm text-ink-soft">{query.error.message}</Card>
      ) : (
        <Card className="p-4 text-sm text-ink-soft">Loading gigs...</Card>
      )}
    </div>
  );
}
