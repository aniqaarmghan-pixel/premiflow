"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { marketplaceErrorMessage, shortWallet } from "@/lib/app/marketplace";
import { resumeMarketplaceLinks } from "@/lib/app/marketplace-auto-link";
import {
  fetchContractLinks,
  fetchReviewEligibility,
  linkMarketplaceContract,
  submitReview,
} from "@/lib/app/marketplace-client";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";
import type { ContractLinkView } from "@/lib/server/marketplace/trust-service";

import { StatusPill } from "./MarketplaceParts";

type Props =
  | { source: "job"; jobId: string; proposalId: string | null; canLink: boolean }
  | { source: "gig"; gigId: string; canLink: boolean };

/**
 * Read-only view of PREMIFLOW contracts linked to this listing (parties only).
 * Contracts created from this listing in Create are linked automatically after
 * on-chain confirmation; pending links are retried here. A manual address form
 * remains as a secondary fallback. The server re-reads the contract from chain
 * and checks its parties; nothing is signed here.
 */
export function MarketplaceContractLinks(props: Props) {
  const session = useMarketplaceSession();
  const listingId = props.source === "job" ? props.jobId : props.gigId;
  const query = useMarketplaceQuery(
    session.wallet ? `links:${props.source}:${listingId}:${session.wallet}` : null,
    () => fetchContractLinks(props.source === "job" ? { jobId: props.jobId } : { gigId: props.gigId })
  );
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const reload = query.reload;

  useEffect(() => {
    if (!session.wallet) return;
    let cancelled = false;
    void resumeMarketplaceLinks(session.wallet).then((r) => {
      if (!cancelled && r.linked.length > 0) reload();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.wallet]);

  if (!session.wallet) return null;

  async function verify() {
    setBusy(true);
    setNotice(null);
    try {
      const wallet = await session.ensure();
      await resumeMarketplaceLinks(wallet);
      query.reload();
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function link() {
    setBusy(true);
    setNotice(null);
    try {
      await session.ensure();
      const contractAddress = address.trim();
      const result = await linkMarketplaceContract(
        props.source === "job"
          ? { contractAddress, source: "job", jobId: props.jobId, proposalId: props.proposalId ?? "" }
          : { contractAddress, source: "gig", gigId: props.gigId }
      );
      setAddress("");
      setNotice(result.created ? "Contract linked." : "This contract was already linked.");
      query.reload();
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const links = query.status === "ready" ? query.data.links : [];
  const canLink = props.canLink && (props.source === "gig" || !!props.proposalId);

  return (
    <Card className="min-w-0 space-y-3 p-4">
      <h2 className="text-sm font-semibold">Linked PREMIFLOW contracts</h2>
      {query.status === "error" && query.error.status === 401 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-ink-soft">Verify your wallet to see contracts linked to this listing.</p>
          <Button variant="secondary" disabled={busy} onClick={() => void verify()}>
            Verify wallet
          </Button>
        </div>
      ) : null}
      {query.status === "ready" && links.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No linked contract yet. A contract created from this listing appears here automatically once it is
          confirmed on-chain.
        </p>
      ) : null}
      {links.length > 0 ? (
        <ul className="divide-y divide-line">
          {links.map((l) => (
            <LinkedContract key={l.contractAddress} link={l} wallet={session.wallet ?? ""} />
          ))}
        </ul>
      ) : null}
      {canLink ? (
        <details className="space-y-2 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs text-ink-faint">
            Contract not showing? Link an existing contract manually (fallback)
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-xs text-ink-faint">
              Paste the address of a contract that already exists on-chain. The server checks that the contract
              employer and freelancer match this listing.
            </p>
            <Field label="Contract address">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Button variant="secondary" disabled={busy || address.trim() === ""} onClick={() => void link()}>
              Link contract
            </Button>
          </div>
        </details>
      ) : null}
      {notice ? (
        <p className="text-xs text-ink-soft" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </Card>
  );
}

function LinkedContract({ link, wallet }: { link: ContractLinkView; wallet: string }) {
  return (
    <li className="min-w-0 space-y-2 py-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
        <span className="break-all">Contract {shortWallet(link.contractAddress)}</span>
        <StatusPill>{link.status ?? "Status unavailable"}</StatusPill>
      </div>
      <p className="text-xs text-ink-faint">
        Employer {shortWallet(link.employerWallet)} - Freelancer {shortWallet(link.freelancerWallet)} - Linked{" "}
        {new Date(link.createdAt).toLocaleDateString()}
      </p>
      <Link href={`/contracts/${link.contractAddress}`} className="text-sm font-semibold text-ink underline">
        Open contract &amp; messages
      </Link>
      {link.reviews.length > 0 ? (
        <ul className="space-y-1">
          {link.reviews.map((r) => (
            <li key={r.id} className="text-xs text-ink-soft">
              {r.reviewerRole === "employer" ? "Employer" : "Freelancer"} review: {r.score}/5
              {r.body ? ` - ${r.body}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {link.status === "Completed" && !link.reviews.some((r) => r.reviewerWallet === wallet) ? (
        <ReviewForm contractAddress={link.contractAddress} wallet={wallet} />
      ) : null}
    </li>
  );
}

function ReviewForm({ contractAddress, wallet }: { contractAddress: string; wallet: string }) {
  const session = useMarketplaceSession();
  const eligibility = useMarketplaceQuery(`review-eligibility:${contractAddress}:${wallet}`, () =>
    fetchReviewEligibility(contractAddress)
  );
  const [score, setScore] = useState(5);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (eligibility.status !== "ready" || !eligibility.data.eligible) return null;

  async function send() {
    setBusy(true);
    setNotice(null);
    try {
      await session.ensure();
      await submitReview({ contractAddress, score, body });
      setNotice("Review submitted.");
      eligibility.reload();
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <p className="text-xs text-ink-faint">
        This contract is Completed on-chain. Leave one verified review for your counterparty.
      </p>
      <Field label="Score (1-5)">
        <select
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm"
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Review (optional)">
        <Textarea value={body} rows={3} maxLength={1000} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Button disabled={busy} onClick={() => void send()}>
        Submit review
      </Button>
      {notice ? (
        <p className="text-xs text-ink-soft" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
