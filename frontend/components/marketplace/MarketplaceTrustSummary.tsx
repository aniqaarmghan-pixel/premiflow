"use client";

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { shortWallet } from "@/lib/app/marketplace";
import { fetchTrustSummary } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";

/**
 * Computed from verified reviews only (each tied to a Completed PREMIFLOW
 * contract). Nothing here is self-entered or editable.
 */
export function MarketplaceTrustSummary({ wallet }: { wallet: string }) {
  const query = useMarketplaceQuery(`trust:${wallet}`, () => fetchTrustSummary(wallet));
  if (query.status !== "ready") {
    return query.status === "error" ? null : (
      <Card className="p-4 text-sm text-ink-soft">Loading verified work...</Card>
    );
  }
  const s = query.data.summary;
  return (
    <Card className="min-w-0 space-y-3 p-4">
      <h2 className="text-sm font-semibold">Verified work</h2>
      {s.reviewCount === 0 ? (
        <p className="text-sm text-ink-soft">
          No verified reviews yet. Reviews appear only after a completed PREMIFLOW contract.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink">
            Average score {s.averageScore?.toFixed(1)} / 5 from {s.reviewCount} verified{" "}
            {s.reviewCount === 1 ? "review" : "reviews"} across {s.completedContracts} completed{" "}
            {s.completedContracts === 1 ? "contract" : "contracts"}.
          </p>
          <p className="text-xs text-ink-faint">
            As freelancer: {s.asFreelancerCount} - As employer: {s.asEmployerCount}
          </p>
          <ul className="divide-y divide-line">
            {s.recent.map((r) => (
              <li key={r.id} className="min-w-0 space-y-1 py-2">
                <p className="text-xs text-ink-faint">
                  Score {r.score}/5 from the {r.reviewerRole} ({shortWallet(r.reviewerWallet)}) -{" "}
                  {new Date(r.createdAt).toLocaleDateString()} -{" "}
                  <Link href={`/contracts/${r.contractAddress}`} className="underline">
                    contract {shortWallet(r.contractAddress)}
                  </Link>
                </p>
                {r.body ? (
                  <p className="whitespace-pre-wrap break-words text-sm text-ink [overflow-wrap:anywhere]">{r.body}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
