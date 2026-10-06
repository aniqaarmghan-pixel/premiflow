"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { VERIFIED_REPUTATION_COPY, verifiedBadgeLabel } from "@/lib/app/differentiation";
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
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <ShieldCheck size={15} aria-hidden="true" className="text-accent" />
        {VERIFIED_REPUTATION_COPY.title}
      </h2>
      {s.reviewCount === 0 ? (
        <p className="text-sm text-ink-soft">{VERIFIED_REPUTATION_COPY.empty}</p>
      ) : (
        <>
          <p className="text-xs font-medium text-ok">{VERIFIED_REPUTATION_COPY.line}</p>
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

/**
 * Compact badge from verified reviews. Pass `summary` (from a list/search card)
 * to skip the per-wallet trust fetch; omit it on profile/gig detail where the
 * full trust panel already loads. Hidden while loading, on error, or empty.
 */
export function VerifiedReputationBadge({
  wallet,
  summary,
  className = "",
}: {
  wallet: string;
  summary?: { reviewCount: number; averageScore: number | null } | null;
  className?: string;
}) {
  const shouldFetch = summary === undefined;
  const query = useMarketplaceQuery(shouldFetch ? `trust:${wallet}` : null, () => fetchTrustSummary(wallet));
  const resolved =
    summary !== undefined ? summary : query.status === "ready" ? query.data.summary : null;
  const label = verifiedBadgeLabel(resolved);
  if (!label) return null;
  return (
    <span
      title={VERIFIED_REPUTATION_COPY.line}
      className={`inline-flex max-w-full items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--ok)_12%,white)] px-2 py-0.5 text-[11px] font-semibold text-ok ${className}`}
    >
      <ShieldCheck size={12} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{label}</span>
      <span className="sr-only"> {VERIFIED_REPUTATION_COPY.line}</span>
    </span>
  );
}
