"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { shortWallet } from "@/lib/app/employer-proposals";
import type { PublicProposal } from "@/lib/server/marketplace/service";
import { savePendingHandoff } from "@/lib/app/marketplace-handoff-store";
import {
  JOB_STATUS_LABELS,
  MARKETPLACE_COPY,
  PROPOSAL_STATUS_LABELS,
  amountLabel,
  formatMarketplaceAmount,
  marketplaceErrorMessage,
} from "@/lib/app/marketplace";
import {
  closeJob,
  fetchCreateHandoff,
  fetchJobDetail,
  fetchShortlist,
  setShortlist,
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

import { WalletActionPrompt } from "@/components/site/WalletActionPrompt";
import { Avatar, JobTags, MarketplaceHeader, ProfileLink, StatusPill } from "./MarketplaceParts";
import { MarketplaceContractLinks } from "./MarketplaceContractLinks";
import { MarketplaceJobInvites } from "./MarketplaceJobInvites";
import { MarketplaceSaveToggle } from "./MarketplaceSaveToggle";

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

function subscribeNoop() {
  return () => {};
}

/** `?proposal=<id>` / `#proposals` deep link from the dashboard or My jobs (client only). */
function useProposalDeepLink(): { proposalId: string | null; section: boolean } {
  const location = useSyncExternalStore(
    subscribeNoop,
    () => `${window.location.search}${window.location.hash}`,
    () => ""
  );
  const hashIndex = location.indexOf("#");
  const search = hashIndex >= 0 ? location.slice(0, hashIndex) : location;
  const hash = hashIndex >= 0 ? location.slice(hashIndex) : "";
  const proposalId = new URLSearchParams(search).get("proposal");
  return { proposalId, section: Boolean(proposalId) || hash === "#proposals" };
}

export function MarketplaceJobDetail({ jobId }: { jobId: string }) {
  const router = useRouter();
  const session = useMarketplaceSession();
  const locked = lockedCreatePayment();
  const query = useMarketplaceQuery(`job:${jobId}:${session.wallet ?? ""}`, () =>
    fetchJobDetail(jobId)
  );
  const [busy, setBusy] = useState(false);
  const [confirmProposal, setConfirmProposal] = useState<PublicProposal | null>(null);
  const deepLink = useProposalDeepLink();
  const scrolledRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [amountUi, setAmountUi] = useState("");
  const shortlistKey =
    query.status === "ready" && query.data.viewerRole === "owner" ? `shortlist:${jobId}:${session.wallet ?? ""}` : null;
  const shortlist = useMarketplaceQuery(shortlistKey, () => fetchShortlist(jobId));
  // Scroll to the linked proposal (or the proposals section) once the owner view has loaded.
  useEffect(() => {
    if (scrolledRef.current || query.status !== "ready" || !deepLink.section) return;
    const target =
      (deepLink.proposalId ? document.getElementById(`proposal-${deepLink.proposalId}`) : null) ??
      document.getElementById("proposals");
    if (!target) return;
    scrolledRef.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [query.status, deepLink.section, deepLink.proposalId]);

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
  const shortlisted = new Set(shortlist.status === "ready" ? shortlist.data.proposalIds : []);
  const selectedId = proposals.find((p) => p.status === "selected")?.id ?? null;
  const submittedCount = proposals.filter((p) => p.status === "submitted").length;
  const looksLikeOwner = !isOwner && session.wallet === job.employerWallet;
  const open = job.status === "open";
  const canPropose = open && !isOwner && !looksLikeOwner && (!ownProposal || ownProposal.status === "withdrawn" || ownProposal.status === "rejected");

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader title={job.title} />
      <MarketplaceSaveToggle type="job" id={job.id} />
      <Card className="min-w-0 space-y-2 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-ink-faint">
          <StatusPill>{JOB_STATUS_LABELS[job.status]}</StatusPill>
          <span>{job.paymentMode}</span>
          <span>
            {amountLabel(job.paymentMode)}: {formatMarketplaceAmount(job.budgetAmount)}
          </span>
          <span className="inline-flex min-w-0 items-center gap-2">
            <Avatar url={null} wallet={job.employerWallet} size={24} />
            <ProfileLink wallet={job.employerWallet} prefix="Employer" />
          </span>
          <span>Posted {new Date(job.createdAt).toLocaleDateString()}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink [overflow-wrap:anywhere]">
          {job.description}
        </p>
        <JobTags job={job} />
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
          <div id="proposals" className="flex min-w-0 scroll-mt-24 flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Proposals ({proposals.length})
              {submittedCount > 0 ? (
                <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">
                  {submittedCount} awaiting your decision
                </span>
              ) : null}
            </h2>
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
            <ul className="space-y-3">
              {proposals.map((p) => (
                <li
                  key={p.id}
                  id={`proposal-${p.id}`}
                  data-highlighted={deepLink.proposalId === p.id ? "true" : undefined}
                  className={`flex min-w-0 scroll-mt-24 flex-col gap-2 rounded-2xl border p-3 transition ${
                    p.status === "selected"
                      ? "border-accent bg-accent-soft/60"
                      : p.status === "submitted"
                        ? "border-accent/40 bg-card"
                        : "border-line bg-paper/60 opacity-80"
                  } ${deepLink.proposalId === p.id ? "ring-2 ring-accent ring-offset-2" : ""}`}
                >
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Avatar url={null} wallet={p.freelancerWallet} size={24} />
                      <ProfileLink wallet={p.freelancerWallet} prefix="Freelancer" label={p.freelancerWallet} />
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        p.status === "selected"
                          ? "bg-accent text-white"
                          : p.status === "submitted"
                            ? "bg-accent-soft text-ink"
                            : "bg-paper-2 text-ink-soft"
                      }`}
                    >
                      {p.status === "submitted" ? "New - awaiting your decision" : PROPOSAL_STATUS_LABELS[p.status]}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-ink">
                    Proposed {formatMarketplaceAmount(p.proposedAmount)}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-ink [overflow-wrap:anywhere]">
                    {p.message}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy || shortlist.status !== "ready"}
                      aria-pressed={shortlisted.has(p.id)}
                      onClick={() =>
                        void run(async () => {
                          await setShortlist(job.id, p.id, !shortlisted.has(p.id));
                          shortlist.reload();
                        }, null)
                      }
                    >
                      {shortlisted.has(p.id) ? "Shortlisted" : "Shortlist"}
                    </Button>
                    <span className="text-xs text-ink-faint">Private to you.</span>
                  </div>
                  {open && p.status === "submitted" ? (
                    <div>
                      <Button disabled={busy} onClick={() => setConfirmProposal(p)}>
                        Select proposal
                      </Button>
                    </div>
                  ) : null}
                  {p.status === "selected" && job.status === "filled" ? (
                    <p className="text-sm font-medium text-ink">
                      Selected. Next step:{" "}
                      <a href="#create-contract" className="font-semibold text-accent underline">
                        Create protected contract
                      </a>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {job.status === "filled" ? (
            <div
              id="create-contract"
              className="scroll-mt-24 space-y-2 rounded-2xl border border-accent/50 bg-accent-soft/50 p-3"
            >
              <p className="text-sm font-semibold text-ink">Next step: create the protected contract</p>
              <p className="text-xs text-ink-faint">{MARKETPLACE_COPY.handoffNote}</p>
              <Button disabled={busy} onClick={() => void startCreate()}>
                Create protected contract
              </Button>
            </div>
          ) : null}
          <Modal
            open={confirmProposal !== null}
            title="Select this proposal?"
            onClose={() => setConfirmProposal(null)}
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirmProposal(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    const chosen = confirmProposal;
                    setConfirmProposal(null);
                    if (chosen) void run(() => selectProposal(job.id, chosen.id), "Proposal selected.");
                  }}
                >
                  Select proposal
                </Button>
              </>
            }
          >
            {confirmProposal ? (
              <div className="space-y-2">
                <p>
                  You are selecting the proposal from {shortWallet(confirmProposal.freelancerWallet)} for{" "}
                  {formatMarketplaceAmount(confirmProposal.proposedAmount)}.
                </p>
                <p className="font-medium text-ink">Other submitted proposals for this job will be declined.</p>
                <p>After selecting, you create the protected contract from the selected proposal.</p>
              </div>
            ) : null}
          </Modal>
        </Card>
      ) : null}

      {isOwner ? <MarketplaceJobInvites jobId={job.id} open={open} /> : null}
      {isOwner && selectedId ? (
        <MarketplaceContractLinks source="job" jobId={job.id} proposalId={selectedId} canLink />
      ) : null}
      {!isOwner && ownProposal?.status === "selected" ? (
        <MarketplaceContractLinks source="job" jobId={job.id} proposalId={ownProposal.id} canLink />
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
        <a
          href="#send-proposal"
          className="sticky bottom-3 z-20 flex min-h-12 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-[0_18px_40px_-18px_rgba(13,148,136,.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:hidden"
        >
          Apply to this job
        </a>
      ) : null}
      {canPropose ? (
        <Card id="send-proposal" className="min-w-0 scroll-mt-24 space-y-3 p-4">
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
              <WalletActionPrompt message={MARKETPLACE_COPY.connectWallet} action="Connect wallet to apply" />
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
