"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { marketplaceErrorMessage } from "@/lib/app/marketplace";
import { answerInvitation, fetchMyInvitations } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";

import { Avatar, MarketplaceHeader, ProfileLink, StatusPill } from "./MarketplaceParts";

const STATUS_LABELS = { pending: "Pending", accepted: "Accepted", declined: "Declined" } as const;

/** Job invitations addressed to the signed-in freelancer. */
export function MarketplaceInvitations() {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(session.wallet ? `my-invitations:${session.wallet}` : null, fetchMyInvitations);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, done: string | null) {
    setBusy(true);
    setNotice(null);
    try {
      await session.ensure();
      await action();
      if (done) setNotice(done);
      query.reload();
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader title="Invitations" subtitle="Employers who invited you to apply to their jobs." />
      {notice ? (
        <p className="rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm text-ink-soft" aria-live="polite">
          {notice}
        </p>
      ) : null}
      {!session.wallet ? (
        <Card className="p-4 text-sm text-ink-soft">Connect your wallet to see your invitations.</Card>
      ) : query.status === "error" && query.error.status === 401 ? (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm text-ink-soft">Verify your wallet to see your invitations.</p>
          <Button disabled={busy} onClick={() => void run(async () => undefined, null)}>
            Verify wallet
          </Button>
        </Card>
      ) : query.status === "error" ? (
        <Card className="p-4 text-sm text-ink-soft">{query.error.message}</Card>
      ) : query.status !== "ready" ? (
        <Card className="p-4 text-sm text-ink-soft">Loading invitations...</Card>
      ) : query.data.items.length === 0 ? (
        <Card className="p-4 text-sm text-ink-soft">No invitations yet.</Card>
      ) : (
        <div className="space-y-3">
          {query.data.items.map(({ invitation, job }) => (
            <Card key={invitation.id} className="min-w-0 space-y-2 p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                {job ? (
                  <Link href={`/marketplace/jobs/${job.id}`} className="font-semibold text-ink underline">
                    {job.title}
                  </Link>
                ) : (
                  <span className="text-sm text-ink-soft">Job no longer available</span>
                )}
                <StatusPill>{STATUS_LABELS[invitation.status]}</StatusPill>
              </div>
              <p className="text-xs text-ink-faint">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Avatar url={null} wallet={invitation.employerWallet} size={24} />
                  <ProfileLink wallet={invitation.employerWallet} prefix="Employer" />
                </span>
              </p>
              {invitation.message ? (
                <p className="whitespace-pre-wrap break-words text-sm text-ink [overflow-wrap:anywhere]">
                  {invitation.message}
                </p>
              ) : null}
              {invitation.status === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || job?.status !== "open"}
                    onClick={() => void run(() => answerInvitation(invitation.id, "accept"), "Invitation accepted.")}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void run(() => answerInvitation(invitation.id, "decline"), "Invitation declined.")}
                  >
                    Decline
                  </Button>
                </div>
              ) : null}
              {invitation.status === "accepted" && job?.status === "open" ? (
                <p className="text-xs text-ink-faint">Open the job to send your proposal.</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
