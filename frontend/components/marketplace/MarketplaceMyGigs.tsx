"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { GIG_COPY, marketplaceErrorMessage } from "@/lib/app/marketplace";
import { deleteGig, fetchMyGigs, setGigStatus } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";

import { GigSummaryCard, MarketplaceHeader, QueryState } from "./MarketplaceParts";

export function MarketplaceMyGigs() {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(session.wallet ? `my-gigs:${session.wallet}` : null, fetchMyGigs);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      await session.ensure();
      await action();
      query.reload();
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader title="My gigs" subtitle="Paused gigs stay hidden from the public until you resume them." />
      {notice ? <p className="text-sm text-danger">{notice}</p> : null}
      {query.status === "ready" ? (
        query.data.gigs.length === 0 ? (
          <Card className="p-4 text-sm text-ink-soft">
            {GIG_COPY.emptyMine}{" "}
            <Link href="/marketplace/gigs/new" className="font-medium text-accent underline">
              Offer a gig
            </Link>
          </Card>
        ) : (
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {query.data.gigs.map((gig) => (
              <GigSummaryCard
                key={gig.id}
                gig={gig}
                footer={
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() => setGigStatus(gig.id, gig.status === "active" ? "pause" : "resume"))
                      }
                    >
                      {gig.status === "active" ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(GIG_COPY.deleteConfirm)) return;
                        void run(() => deleteGig(gig.id));
                      }}
                    >
                      Delete
                    </Button>
                  </div>
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
          verifying={busy}
          onRetry={query.reload}
          onVerify={() => void run(async () => undefined)}
        />
      )}
    </div>
  );
}
