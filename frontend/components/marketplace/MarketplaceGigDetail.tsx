"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  GIG_COPY,
  GIG_STATUS_LABELS,
  MARKETPLACE_COPY,
  amountLabel,
  formatMarketplaceAmount,
  marketplaceErrorMessage,
} from "@/lib/app/marketplace";
import {
  deleteGig,
  fetchGigDetail,
  fetchGigHandoff,
  setGigStatus,
} from "@/lib/app/marketplace-client";
import { stashCreateHandoff } from "@/lib/app/marketplace-create-handoff";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";

import { Avatar, MarketplaceHeader, ProfileLink, SkillList, StatusPill } from "./MarketplaceParts";

export function MarketplaceGigDetail({ gigId }: { gigId: string }) {
  const router = useRouter();
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(`gig:${gigId}:${session.wallet ?? ""}`, () => fetchGigDetail(gigId));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setNotice(null);
    try {
      await session.ensure();
      await action();
      if (after) after();
      else query.reload();
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function hire() {
    setBusy(true);
    setNotice(null);
    try {
      const wallet = await session.ensure();
      const { handoff } = await fetchGigHandoff(gigId);
      // Never overwrites a create in progress; Create applies the terms only on
      // the employer's explicit choice and never sends on its own.
      const result = stashCreateHandoff(wallet, handoff);
      if (result === "intent_exists") {
        setNotice(MARKETPLACE_COPY.handoffIntentExists);
        return;
      }
      if (result === "storage_failed") {
        setNotice("Could not save the terms in this browser. Check storage settings.");
        return;
      }
      setNotice(MARKETPLACE_COPY.handoffSaved);
      router.push("/create");
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (query.status !== "ready") {
    return (
      <div className="min-w-0 space-y-4">
        <MarketplaceHeader title="Gig" />
        <Card className="p-4 text-sm text-ink-soft">
          {query.status === "error"
            ? query.error.status === 404
              ? "This gig was not found or is not public."
              : query.error.message
            : "Loading gig..."}
        </Card>
      </div>
    );
  }

  const { gig, viewerRole, owner } = query.data;
  const isOwner = viewerRole === "owner";
  const looksLikeOwner = !isOwner && session.wallet === gig.freelancerWallet;

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader title={gig.title} />
      <Card className="min-w-0 space-y-3 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Avatar url={owner?.avatarUrl ?? null} size={40} />
          <div className="min-w-0">
            <ProfileLink wallet={gig.freelancerWallet} label={owner?.displayName || undefined} />
            {owner?.headline ? (
              <p className="break-words text-xs text-ink-faint [overflow-wrap:anywhere]">{owner.headline}</p>
            ) : null}
          </div>
          <StatusPill>{GIG_STATUS_LABELS[gig.status]}</StatusPill>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-ink-soft [overflow-wrap:anywhere]">
          {gig.description}
        </p>
        <SkillList skills={gig.skills} />
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-faint">
          <span>{gig.paymentMode}</span>
          <span>
            {amountLabel(gig.paymentMode)}: {formatMarketplaceAmount(gig.priceAmount)}
          </span>
          <span>Updated {new Date(gig.updatedAt).toLocaleDateString()}</span>
        </p>
      </Card>

      {isOwner ? (
        <Card className="min-w-0 space-y-3 p-4">
          {gig.status === "paused" ? <p className="text-sm text-ink-soft">{GIG_COPY.pausedNote}</p> : null}
          <div className="flex flex-wrap gap-2 max-sm:flex-col max-sm:items-stretch">
            <Link
              href={`/marketplace/gigs/${encodeURIComponent(gig.id)}/edit`}
              className="inline-flex items-center justify-center rounded-full border border-line px-4 py-2.5 text-sm font-semibold"
            >
              Edit
            </Link>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => setGigStatus(gig.id, gig.status === "active" ? "pause" : "resume"))}
            >
              {gig.status === "active" ? "Pause" : "Resume"}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(GIG_COPY.deleteConfirm)) return;
                void run(() => deleteGig(gig.id), () => router.push("/marketplace/my-gigs"));
              }}
            >
              Delete
            </Button>
          </div>
        </Card>
      ) : looksLikeOwner ? (
        <Card className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-soft">{GIG_COPY.ownGig} Verify your wallet to manage it.</p>
          <Button disabled={busy} onClick={() => void run(async () => undefined)}>
            {MARKETPLACE_COPY.verifyWallet}
          </Button>
        </Card>
      ) : gig.status === "active" ? (
        <Card className="min-w-0 space-y-3 p-4">
          <p className="text-sm text-ink-soft">{GIG_COPY.hireNote}</p>
          <Button disabled={busy || !session.wallet} onClick={() => void hire()}>
            Hire via Create contract
          </Button>
          {!session.wallet ? (
            <p className="text-xs text-ink-faint">{MARKETPLACE_COPY.connectWallet}</p>
          ) : null}
        </Card>
      ) : null}
      {notice ? <p className="text-sm text-ink-soft" aria-live="polite">{notice}</p> : null}
    </div>
  );
}
