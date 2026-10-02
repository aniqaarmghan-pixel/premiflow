"use client";

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { MARKETPLACE_COPY } from "@/lib/app/marketplace";
import { fetchOpenJobs } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";

import { JobSummaryCard, MarketplaceHeader } from "./MarketplaceParts";

export function MarketplaceBrowse() {
  const query = useMarketplaceQuery("open-jobs", fetchOpenJobs);
  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader
        title={MARKETPLACE_COPY.browseTitle}
        subtitle={MARKETPLACE_COPY.browseSubtitle}
      />
      {query.status === "ready" ? (
        query.data.jobs.length === 0 ? (
          <Card className="p-4 text-sm text-ink-soft">
            {MARKETPLACE_COPY.emptyOpenJobs}{" "}
            <Link href="/marketplace/post" className="font-medium text-accent underline">
              Post a job
            </Link>
          </Card>
        ) : (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {query.data.jobs.map((job) => (
              <JobSummaryCard key={job.id} job={job} />
            ))}
          </div>
        )
      ) : query.status === "error" ? (
        <Card className="p-4 text-sm text-ink-soft">{query.error.message}</Card>
      ) : (
        <Card className="p-4 text-sm text-ink-soft">Loading open jobs...</Card>
      )}
    </div>
  );
}
