"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { savePendingHandoff } from "@/lib/app/marketplace-handoff-store";
import {
  JOB_STATUS_LABELS,
  MARKETPLACE_COPY,
  PROPOSAL_STATUS_LABELS,
  amountLabel,
  formatMarketplaceAmount,
  marketplaceErrorMessage,
  shortWallet,
} from "@/lib/app/marketplace";
import {
  closeJob,
  fetchCreateHandoff,
  fetchJobDetail,
  selectProposal,
  submitProposal,
  withdrawProposal,
} from "@/lib/app/marketplace-client";
import { loadCreateIntent, type IntentScope } from "@/lib/app/milestone-create-plan";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { ACTIVE_CLUSTER_ID } from "@/lib/cluster";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";
import { deriveContractPda, uiAmountToBaseUnits } from "@/lib/streampay-v2";
import { STREAMPAY_PROGRAM_ID } from "@/lib/streampay-v2/constants";
import { PublicKey } from "@solana/web3.js";

import { MarketplaceHeader, StatusPill } from "./MarketplaceParts";

const CREATE_SCOPE: IntentScope = {
  cluster: ACTIVE_CLUSTER_ID,
  programId: STREAMPAY_PROGRAM_ID.toBase58(),
};

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function createIntentExists(employer: string): boolean {
  const result = loadCreateIntent(browserStorage(), CREATE_SCOPE, employer, (e, f, id) =>
    deriveContractPda(new PublicKey(e), new PublicKey(f), id, STREAMPAY_PROGRAM_ID).address.toBase58()
  );
  return result.kind !== "none";
}

export function MarketplaceJobDetail({ jobId }: { jobId: string }) {
  const router = useRouter();
  const session = useMarketplaceSession();
  const locked = lockedCreatePayment();
  const query = useMarketplaceQuery(`job:${jobId}:${session.wallet ?? ""}`, () =>
    fetchJobDetail(jobId)
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [amountUi, setAmountUi] = useState("");

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

  async function startCreate() {
    setBusy(true);
    setNotice(null);
    try {
      const wallet = await session.ensure();
      const { handoff } = await fetchCreateHandoff(jobId);
      if (createIntentExists(wallet)) {
        setNotice(MARKETPLACE_COPY.handoffIntentExists);
        return;
      }
      // Separate pending record for this wallet only; Create applies it on an
      // explicit "Use selected proposal" choice and never sends on its own.
      const written = savePendingHandoff(browserStorage(), CREATE_SCOPE, wallet, handoff, Date.now());
      if (!written) {
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
        <MarketplaceHeader title="Job" />
        <Card className="p-4 text-sm text-ink-soft">
          {query.status === "error"
            ? query.error.status === 404
              ? "This job was not found or is no longer public."
              : query.error.message
            : "Loading job..."}
        </Card>
      </div>
    );
  }

  const { job, viewerRole, proposals, ownProposal } = query.data;
  const isOwner = viewerRole === "owner";
  const looksLikeOwner = !isOwner && session.wallet === job.employerWallet;
  const open = job.status === "open";
  const canPropose = open && !isOwner && !looksLikeOwner && (!ownProposal || ownProposal.status === "withdrawn" || ownProposal.status === "rejected");

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader title={job.title} />
      <Card className="min-w-0 space-y-2 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-ink-faint">
          <StatusPill>{JOB_STATUS_LABELS[job.status]}</StatusPill>
          <span>{job.paymentMode}</span>
          <span>
            {amountLabel(job.paymentMode)}: {formatMarketplaceAmount(job.budgetAmount)}
          </span>
          <span>Employer {shortWallet(job.employerWallet)}</span>
          <span>Posted {new Date(job.createdAt).toLocaleDateString()}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink [overflow-wrap:anywhere]">
          {job.description}
        </p>
        {job.status === "closed" ? (
          <p className="text-xs text-ink-faint">{MARKETPLACE_COPY.closedNote}</p>
        ) : null}
        {job.status === "filled" ? (
          <p className="text-xs text-ink-faint">{MARKETPLACE_COPY.filledNote}</p>
        ) : null}
      </Card>

      {notice ? <NoticeLine text={notice} /> : null}

      {looksLikeOwner ? (
        <Card className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-soft">Verify your wallet to manage this job and its proposals.</p>
          <Button disabled={busy} onClick={() => void run(async () => undefined, null)}>
            {MARKETPLACE_COPY.verifyWallet}
          </Button>
        </Card>
      ) : null}

      {isOwner ? (
        <Card className="min-w-0 space-y-3 p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Proposals ({proposals.length})</h2>
            {open ? (
              <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
                <Link
                  href={`/marketplace/jobs/${job.id}/edit`}
                  className="inline-flex items-center justify-center rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-paper-2"
                >
                  Edit job
                </Link>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Close this job? It will stop accepting proposals.")) {
                      void run(() => closeJob(job.id), "Job closed.");
                    }
                  }}
                >
                  Close job
                </Button>
              </div>
            ) : null}
          </div>
          {open ? <p className="text-xs text-ink-faint">{MARKETPLACE_COPY.selectionNote}</p> : null}
          {proposals.length === 0 ? (
            <p className="text-sm text-ink-soft">{MARKETPLACE_COPY.emptyProposals}</p>
          ) : (
            <ul className="divide-y divide-line">
              {proposals.map((p) => (
                <li key={p.id} className="flex min-w-0 flex-col gap-2 py-3">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
                    <span className="min-w-0 break-all">Freelancer {p.freelancerWallet}</span>
                    <StatusPill>{PROPOSAL_STATUS_LABELS[p.status]}</StatusPill>
                  </div>
                  <p className="text-xs text-ink-soft">
                    Proposed {formatMarketplaceAmount(p.proposedAmount)}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-ink [overflow-wrap:anywhere]">
                    {p.message}
                  </p>
                  {open && p.status === "submitted" ? (
                    <div>
                      <Button
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Select this proposal? Other submitted proposals will be declined.")) {
                            void run(() => selectProposal(job.id, p.id), "Proposal selected.");
                          }
                        }}
                      >
                        Select proposal
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {job.status === "filled" ? (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-xs text-ink-faint">{MARKETPLACE_COPY.handoffNote}</p>
              <Button disabled={busy} onClick={() => void startCreate()}>
                Create contract
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {ownProposal ? (
        <Card className="min-w-0 space-y-2 p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Your proposal</h2>
            <StatusPill>{PROPOSAL_STATUS_LABELS[ownProposal.status]}</StatusPill>
          </div>
          <p className="text-xs text-ink-soft">
            Proposed {formatMarketplaceAmount(ownProposal.proposedAmount)}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-ink [overflow-wrap:anywhere]">
            {ownProposal.message}
          </p>
          {ownProposal.status === "selected" ? (
            <p className="text-xs text-ink-faint">
              The employer selected your proposal. They will send the on-chain offer from Create contract; you will review and accept it under Contracts.
            </p>
          ) : null}
          {open && ownProposal.status === "submitted" ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => withdrawProposal(ownProposal.id), "Proposal withdrawn.")}
            >
              Withdraw proposal
            </Button>
          ) : null}
        </Card>
      ) : null}

      {canPropose ? (
        <Card className="min-w-0 space-y-3 p-4">
          <h2 className="text-sm font-semibold">Send a proposal</h2>
          <Field label="Message">
            <Textarea
              value={message}
              rows={5}
              maxLength={2000}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
          <Field label={`Proposed ${amountLabel(job.paymentMode).toLowerCase()} (${locked.tokenName})`}>
            <Input inputMode="decimal" value={amountUi} onChange={(e) => setAmountUi(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2 max-sm:flex-col max-sm:items-stretch">
            <Button
              disabled={busy || !session.wallet}
              onClick={() =>
                void run(async () => {
                  const proposedAmount = uiAmountToBaseUnits(amountUi, locked.decimals).toString();
                  await submitProposal(job.id, { message, proposedAmount });
                  setMessage("");
                  setAmountUi("");
                }, "Proposal sent.")
              }
            >
              Send proposal
            </Button>
            {!session.wallet ? (
              <p className="text-xs text-ink-faint">{MARKETPLACE_COPY.connectWallet}</p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function NoticeLine({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm text-ink-soft" aria-live="polite">
      {text}
    </p>
  );
}
