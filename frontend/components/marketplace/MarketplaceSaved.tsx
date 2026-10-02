"use client";

import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { marketplaceErrorMessage } from "@/lib/app/marketplace";
import { fetchSaved } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";

import { GigSummaryCard, JobSummaryCard, MarketplaceHeader, QueryState } from "./MarketplaceParts";
import { MarketplaceSaveToggle } from "./MarketplaceSaveToggle";

export function MarketplaceSaved() {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(session.wallet ? `saved-page:${session.wallet}` : null, fetchSaved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setNotice(null);
    try {
      await session.ensure();
      query.reload();
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader title="Saved" subtitle="Jobs and gigs you saved. Only you can see this list." />
      {notice ? <p className="text-sm text-danger">{notice}</p> : null}
      {query.status === "ready" ? (
        query.data.items.length === 0 ? (
          <Card className="p-4 text-sm text-ink-soft">Nothing saved yet. Use Save on any job or gig.</Card>
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.items.map((item) =>
              item.gig ? (
                <GigSummaryCard
                  key={`gig:${item.targetId}`}
                  gig={item.gig}
                  footer={<MarketplaceSaveToggle type="gig" id={item.targetId} />}
                />
              ) : item.job ? (
                <JobSummaryCard
                  key={`job:${item.targetId}`}
                  job={item.job}
                  footer={
                    <div className="mt-3">
                      <MarketplaceSaveToggle type="job" id={item.targetId} />
                    </div>
                  }
                />
              ) : (
                <Card
                  key={`${item.targetType}:${item.targetId}`}
                  className="flex min-w-0 flex-col items-start gap-2 p-4 text-sm text-ink-soft"
                >
                  <p>This {item.targetType} is no longer available.</p>
                  <MarketplaceSaveToggle type={item.targetType} id={item.targetId} />
                </Card>
              )
            )}
          </div>
        )
      ) : (
        <QueryState
          status={query.status}
          error={query.status === "error" ? query.error : undefined}
          wallet={session.wallet}
          verifying={busy}
          onVerify={() => void verify()}
        />
      )}
    </div>
  );
}
