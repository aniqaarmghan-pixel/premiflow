"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { marketplaceErrorMessage } from "@/lib/app/marketplace";
import { fetchJobInvitations, inviteToJob } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";

import { ProfileLink, StatusPill } from "./MarketplaceParts";

const STATUS_LABELS = { pending: "Pending", accepted: "Accepted", declined: "Declined" } as const;

/** Owner-only: invite freelancers to an open job and see their answers. */
export function MarketplaceJobInvites({ jobId, open }: { jobId: string; open: boolean }) {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(session.wallet ? `invites:${jobId}:${session.wallet}` : null, () =>
    fetchJobInvitations(jobId)
  );
  const [invitee, setInvitee] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setNotice(null);
    try {
      await session.ensure();
      await inviteToJob(jobId, { invitee: invitee.trim(), message });
      setInvitee("");
      setMessage("");
      setNotice("Invitation sent.");
      query.reload();
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const invitations = query.status === "ready" ? query.data.invitations : [];

  return (
    <Card className="min-w-0 space-y-3 p-4">
      <h2 className="text-sm font-semibold">Invitations ({invitations.length})</h2>
      {invitations.length === 0 ? (
        <p className="text-sm text-ink-soft">No freelancers invited yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <ProfileLink wallet={inv.freelancerWallet} prefix="Freelancer" label={inv.freelancerWallet} />
              <StatusPill>{STATUS_LABELS[inv.status]}</StatusPill>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <div className="space-y-2 border-t border-line pt-3">
          <Field label="Freelancer wallet">
            <Input value={invitee} onChange={(e) => setInvitee(e.target.value)} />
          </Field>
          <Field label="Message (optional)">
            <Textarea value={message} rows={3} maxLength={500} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Button disabled={busy || invitee.trim() === ""} onClick={() => void invite()}>
            Invite freelancer
          </Button>
        </div>
      ) : (
        <p className="text-xs text-ink-faint">Invitations can only be sent while the job is open.</p>
      )}
      {notice ? (
        <p className="text-xs text-ink-soft" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </Card>
  );
}
