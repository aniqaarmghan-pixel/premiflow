"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

import { Card } from "@/components/ui/Card";
import { MarketplaceTrustSummary } from "@/components/marketplace/MarketplaceTrustSummary";
import { profileHref } from "@/lib/app/marketplace";

/**
 * Dashboard > Reviews: the connected wallet's verified-work summary. Reviews
 * exist only for completed PREMIFLOW contracts; nothing here is editable.
 */
export default function DashboardReviewsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  return (
    <div className="pf-fade-in min-w-0 space-y-4">
      <div>
        <h1 className="font-display text-2xl tracking-tight">Reviews</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Verified feedback from completed PREMIFLOW contracts. It is computed from finished work and cannot be
          edited.
        </p>
      </div>
      {wallet ? (
        <>
          <MarketplaceTrustSummary wallet={wallet} />
          <Link href={profileHref(wallet)} className="inline-block text-sm font-semibold text-accent underline-offset-2 hover:underline">
            View your public profile
          </Link>
        </>
      ) : (
        <Card className="p-4 text-sm text-ink-soft">
          Connect the wallet you use for contracts to see the reviews tied to it.
        </Card>
      )}
    </div>
  );
}
