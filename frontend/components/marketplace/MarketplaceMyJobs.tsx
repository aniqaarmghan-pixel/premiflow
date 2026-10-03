"use client";

import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { MARKETPLACE_COPY } from "@/lib/app/marketplace";
import { fetchMyJobs } from "@/lib/app/marketplace-client";
import {
  newProposalsLabel,
  proposalReviewHref,
  reviewProposalsLabel,
} from "@/lib/app/employer-proposals";
import { useEmployerProposals } from "@/lib/hooks/useEmployerProposals";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";

import { JobSummaryCard, MarketplaceHeader, QueryState } from "./MarketplaceParts";

export function MarketplaceMyJobs() {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(session.wallet ? `my-jobs:${session.wallet}` : null, fetchMyJobs);
  const [verifying, setVerifying] = useState(false);
  const proposals = useEmployerProposals(query.status === "ready" ? query.data.jobs : null, 50);

  async function verify() {
    setVerifying(true);
    try {
      await session.ensure();
      query.reload();
    } catch {
      // The query keeps showing the verify prompt.
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader title="My jobs" subtitle="Jobs you posted with this wallet." />
      {query.status === "ready" ? (
        query.data.jobs.length === 0 ? (
          <Card className="p-4 text-sm text-ink-soft">
            {MARKETPLACE_COPY.emptyMyJobs}{" "}
            <Link href="/marketplace/post" className="font-medium text-accent underline">
              Post a job
            </Link>
          </Card>
        ) : (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {query.data.jobs.map((job) => (
              <JobSummaryCard
                key={job.id}
                job={job}
                footer={
                  (proposals.counts.get(job.id) ?? 0) > 0 ? (
                    <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent-soft/50 px-3 py-2">
                      <span className="text-sm font-semibold text-ink" data-proposal-count={proposals.counts.get(job.id)}>
                        {newProposalsLabel(proposals.counts.get(job.id) ?? 0)}
                      </span>
                      <Link
                        href={proposalReviewHref(job.id)}
                        className="inline-flex min-h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                      >
                        {reviewProposalsLabel(proposals.counts.get(job.id) ?? 0)}
                      </Link>
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        )
      ) : (
        <QueryState
          status={query.status}
          error={query.status === "error" ? query.error : undefined}
          wallet={session.wallet}
          onRetry={query.reload}
          onVerify={() => void verify()}
          verifying={verifying}
        />
      )}
    </div>
  );
}
