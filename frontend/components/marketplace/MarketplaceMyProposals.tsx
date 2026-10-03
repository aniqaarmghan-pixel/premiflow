"use client";

import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import {
  MARKETPLACE_COPY,
  PROPOSAL_STATUS_LABELS,
  formatMarketplaceAmount,
} from "@/lib/app/marketplace";
import { fetchMyProposals } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";

import { MarketplaceHeader, QueryState, StatusPill } from "./MarketplaceParts";

export function MarketplaceMyProposals() {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(
    session.wallet ? `my-proposals:${session.wallet}` : null,
    fetchMyProposals
  );
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
      <MarketplaceHeader title="My proposals" subtitle="Proposals you sent with this wallet." />
      {query.status === "ready" ? (
        query.data.items.length === 0 ? (
          <Card className="p-4 text-sm text-ink-soft">
            {MARKETPLACE_COPY.emptyMyProposals}{" "}
            <Link href="/marketplace" className="font-medium text-accent underline">
              Browse jobs
            </Link>
          </Card>
        ) : (
          <div className="grid min-w-0 gap-3">
            {query.data.items.map(({ proposal, job }) => (
              <Card key={proposal.id} className="min-w-0 p-3 sm:p-4">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  {job ? (
                    <Link
                      href={`/marketplace/jobs/${job.id}`}
                      className="min-w-0 break-words font-semibold text-ink underline-offset-2 hover:underline [overflow-wrap:anywhere]"
                    >
                      {job.title}
                    </Link>
                  ) : (
                    <span className="text-sm text-ink-soft">Job unavailable</span>
                  )}
                  <StatusPill>{PROPOSAL_STATUS_LABELS[proposal.status]}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  Proposed {formatMarketplaceAmount(proposal.proposedAmount)} - Sent{" "}
                  {new Date(proposal.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-1 line-clamp-2 break-words text-sm text-ink-soft [overflow-wrap:anywhere]">
                  {proposal.message}
                </p>
              </Card>
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
