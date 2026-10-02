"use client";

import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { MARKETPLACE_COPY } from "@/lib/app/marketplace";
import { fetchMyJobs } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";

import { JobSummaryCard, MarketplaceHeader, QueryState } from "./MarketplaceParts";

export function MarketplaceMyJobs() {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(session.wallet ? `my-jobs:${session.wallet}` : null, fetchMyJobs);
  const [verifying, setVerifying] = useState(false);

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
              <JobSummaryCard key={job.id} job={job} />
            ))}
          </div>
        )
      ) : (
        <QueryState
          status={query.status}
          error={query.status === "error" ? query.error : undefined}
          wallet={session.wallet}
          onVerify={() => void verify()}
          verifying={verifying}
        />
      )}
    </div>
  );
}
