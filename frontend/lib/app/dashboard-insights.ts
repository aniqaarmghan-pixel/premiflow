/**
 * Read-only dashboard insights derived from fetched contract accounts and
 * existing marketplace API responses. Money figures reuse financialProgress
 * (existing display helper) and only sum its outputs; no settlement or
 * payment math lives here. Every count maps to a real record.
 */
import type { ContractView } from "@/lib/streampay-v2/types";
import { isStreamEnded } from "@/lib/streampay-v2/derived";
import type { ActionRequiredItem, OfferListItem } from "./dashboard-offers";
import type { MarketplaceWorkspaceData } from "./dashboard-command";
import {
  newProposalsLabel,
  proposalReviewHref,
  shortWallet,
  type EmployerProposalItem,
} from "./employer-proposals";
import { formatMarketplaceAmount } from "./marketplace";
import { financialProgress, presentType, type DashboardSummary } from "./view-model";

/* ---------- Role context ---------- */

export type RoleContext = { mode: "hiring" | "working" | "both" | "new"; label: string; detail: string };

export function dashboardRoleContext(summary: Pick<DashboardSummary, "hiring" | "working">): RoleContext {
  const { hiring, working } = summary;
  if (hiring > 0 && working > 0) {
    return { mode: "both", label: "Hiring & working", detail: `${hiring} hiring - ${working} working contracts` };
  }
  if (hiring > 0) return { mode: "hiring", label: "Hiring", detail: `${hiring} hiring ${hiring === 1 ? "contract" : "contracts"}` };
  if (working > 0) return { mode: "working", label: "Working", detail: `${working} working ${working === 1 ? "contract" : "contracts"}` };
  return { mode: "new", label: "Getting started", detail: "No contracts yet" };
}

/* ---------- Portfolio totals (sums of financialProgress outputs) ---------- */

const LIVE: ReadonlySet<ContractView["status"]> = new Set(["Active", "Disputed"]);

export type PortfolioTotals = {
  /** Total value of Active / Disputed contracts. */
  liveValue: bigint;
  /** Value still held by live contracts (financialProgress.remainingInEscrow). */
  inEscrow: bigint;
  /** Released across every loaded contract (on-chain releasedAmount). */
  released: bigint;
  liveCount: number;
};

export function portfolioTotals(contracts: readonly ContractView[]): PortfolioTotals {
  let liveValue = 0n;
  let inEscrow = 0n;
  let released = 0n;
  let liveCount = 0;
  for (const c of contracts) {
    const p = financialProgress(c);
    released += p.released;
    if (LIVE.has(c.status)) {
      liveCount += 1;
      liveValue += p.total;
      inEscrow += p.remainingInEscrow;
    }
  }
  return { liveValue, inEscrow, released, liveCount };
}

/* ---------- Contract progress ---------- */

export type ContractProgressItem = {
  address: string;
  href: string;
  title: string;
  status: ContractView["status"];
  releasedPct: number;
  /** "3 of 5 milestones released" or "62% of stream time elapsed"; null when not applicable. */
  stepLabel: string | null;
  stepPct: number | null;
};

export function contractProgressItems(contracts: readonly ContractView[], nowSec: number, limit = 4): ContractProgressItem[] {
  return contracts
    .filter((c) => LIVE.has(c.status))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(0, limit))
    .map((c) => {
      const address = c.address.toBase58();
      const p = financialProgress(c);
      let stepLabel: string | null = null;
      let stepPct: number | null = null;
      const units = c.workUnitCount - c.voidedUnitCount;
      if (c.paymentMode === "Streaming" && c.endTime > c.startTime && c.startTime > 0) {
        const span = c.endTime - c.startTime;
        stepPct = Math.round(Math.max(0, Math.min(1, (nowSec - c.startTime) / span)) * 100);
        stepLabel = `${stepPct}% of stream time elapsed`;
      } else if (units > 0) {
        stepPct = Math.round((Math.min(c.releasedUnitCount, units) / units) * 100);
        stepLabel = `${Math.min(c.releasedUnitCount, units)} of ${units} ${units === 1 ? "work unit" : "work units"} released`;
      }
      return {
        address,
        href: `/contracts/${address}`,
        title: presentType(c.paymentMode),
        status: c.status,
        releasedPct: p.releasedPct,
        stepLabel,
        stepPct,
      };
    });
}

/* ---------- Status distribution (simple chart) ---------- */

export type StatusBucket = { key: string; label: string; count: number };

export function statusDistribution(contracts: readonly ContractView[]): StatusBucket[] {
  const buckets: Array<{ key: string; label: string; statuses: ContractView["status"][] }> = [
    { key: "setup", label: "Setting up", statuses: ["Draft", "PendingAcceptance", "PendingEmployerApproval"] },
    { key: "active", label: "Active", statuses: ["Active"] },
    { key: "disputed", label: "In dispute", statuses: ["Disputed"] },
    { key: "done", label: "Completed", statuses: ["Completed", "Resolved"] },
    { key: "closed", label: "Closed", statuses: ["Declined", "Expired", "Cancelled", "ActivationRejected"] },
  ];
  return buckets.map((b) => ({
    key: b.key,
    label: b.label,
    count: contracts.filter((c) => b.statuses.includes(c.status)).length,
  }));
}

/* ---------- Pipelines ---------- */

export type PipelineStep = { label: string; value: number; href: string };

export const PIPELINE_ENDED_LABEL = "Streaming ended";

/** On-chain Active, minus Streaming contracts past end_time (derived; on-chain status unchanged). */
function activeNowCount(list: readonly ContractView[], now?: number): number {
  return list.filter(
    (c) => c.status === "Active" && !(now !== undefined && isStreamEnded(c, now))
  ).length;
}

/** Active Streaming contracts past end_time: final pay awaiting freelancer collection. */
function endedStreamCount(list: readonly ContractView[], now?: number): number {
  if (now === undefined) return 0;
  return list.filter((c) => isStreamEnded(c, now)).length;
}

function endedStep(
  list: readonly ContractView[],
  role: "hiring" | "working",
  now?: number
): PipelineStep[] {
  const value = endedStreamCount(list, now);
  return value > 0
    ? [{ label: PIPELINE_ENDED_LABEL, value, href: `/contracts?role=${role}&status=ended` }]
    : [];
}

export function hiringPipeline(input: {
  hiring: readonly ContractView[];
  offersWaiting: number;
  workspace: MarketplaceWorkspaceData | null;
  now?: number;
}): PipelineStep[] {
  const steps: PipelineStep[] = [];
  if (input.workspace) {
    steps.push({ label: "Open jobs", value: input.workspace.jobs.filter((j) => j.status === "open").length, href: "/marketplace/my-jobs" });
  }
  steps.push(
    { label: "Offers sent", value: input.offersWaiting, href: "/contracts?role=hiring" },
    { label: "Active", value: activeNowCount(input.hiring, input.now), href: "/contracts?role=hiring" },
    ...endedStep(input.hiring, "hiring", input.now),
    { label: "Completed", value: input.hiring.filter((c) => c.status === "Completed" || c.status === "Resolved").length, href: "/contracts?role=hiring" }
  );
  return steps;
}

export function freelancerPipeline(input: {
  working: readonly ContractView[];
  offersToAnswer: number;
  workspace: MarketplaceWorkspaceData | null;
  now?: number;
}): PipelineStep[] {
  const steps: PipelineStep[] = [];
  if (input.workspace) {
    const proposals = input.workspace.proposals;
    steps.push(
      { label: "Proposals out", value: proposals.filter((p) => p.proposal.status === "submitted").length, href: "/marketplace/my-proposals" },
      { label: "Selected", value: proposals.filter((p) => p.proposal.status === "selected").length, href: "/marketplace/my-proposals" }
    );
  }
  steps.push(
    { label: "Offers to answer", value: input.offersToAnswer, href: "/contracts?role=working" },
    { label: "Active", value: activeNowCount(input.working, input.now), href: "/contracts?role=working" },
    ...endedStep(input.working, "working", input.now),
    { label: "Completed", value: input.working.filter((c) => c.status === "Completed" || c.status === "Resolved").length, href: "/contracts?role=working" }
  );
  return steps;
}

/* ---------- Needs your attention ---------- */

export type AttentionItem = {
  id: string;
  kind: "proposal" | "action" | "offer" | "review" | "feedback" | "messages" | "invitation";
  title: string;
  detail: string;
  href: string;
  /** Explicit call to action shown on the row (e.g. "Review proposal"). */
  cta?: string;
  /** Unix seconds, when the item has a real deadline. */
  due: number | null;
  overdue: boolean;
};

const PROPOSAL_ROWS = 3;

export const ATTENTION_RANK: Record<AttentionItem["kind"], number> = {
  proposal: 0,
  offer: 1,
  action: 2,
  review: 3,
  invitation: 4,
  messages: 5,
  feedback: 6,
};

export function attentionQueue(input: {
  actionItems: readonly ActionRequiredItem[];
  offersToAnswer: readonly OfferListItem[];
  reviewContracts: readonly ContractView[];
  unreadMessages: number | null;
  pendingInvitations: number;
  /** Completed contracts where the review API reports the wallet is eligible to leave a review. */
  reviewPrompts?: readonly string[];
  /** Submitted proposals on the employer's open jobs (existing job-detail API). */
  proposals?: readonly EmployerProposalItem[];
  limit?: number;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const proposals = input.proposals ?? [];
  for (const p of proposals.slice(0, PROPOSAL_ROWS)) {
    items.push({
      id: `proposal-${p.proposalId}`,
      kind: "proposal",
      title: `New proposal: ${p.jobTitle}`,
      detail: `${shortWallet(p.freelancerWallet)} proposed ${formatMarketplaceAmount(p.proposedAmount)}`,
      href: proposalReviewHref(p.jobId, p.proposalId),
      cta: "Review proposal",
      due: null,
      overdue: false,
    });
  }
  if (proposals.length > PROPOSAL_ROWS) {
    const more = proposals.length - PROPOSAL_ROWS;
    items.push({
      id: "proposals-more",
      kind: "proposal",
      title: `+${more} more ${more === 1 ? "proposal" : "proposals"} to review`,
      detail: `${newProposalsLabel(proposals.length)} across your open jobs`,
      href: "/marketplace/my-jobs",
      cta: "Open My jobs",
      due: null,
      overdue: false,
    });
  }
  for (const o of input.offersToAnswer) {
    items.push({
      id: `offer-${o.address}`,
      kind: "offer",
      title: `Respond to ${presentType(o.mode)} offer`,
      detail: o.deadlinePassed ? "Acceptance deadline passed" : "Awaiting your response",
      href: o.href,
      due: o.acceptanceDeadline,
      overdue: o.deadlinePassed,
    });
  }
  for (const a of input.actionItems) {
    items.push({
      id: `action-${a.address}`,
      kind: "action",
      title: a.actionLabel,
      detail: a.note,
      href: a.href,
      due: null,
      overdue: false,
    });
  }
  for (const c of input.reviewContracts) {
    const address = c.address.toBase58();
    items.push({
      id: `review-${address}`,
      kind: "review",
      title: `${c.openReviewCount} ${c.openReviewCount === 1 ? "submission" : "submissions"} in review`,
      detail: `${presentType(c.paymentMode)} contract`,
      href: `/contracts/${address}`,
      due: null,
      overdue: false,
    });
  }
  // Review reminders are grouped so they never crowd out urgent work.
  const reviewPrompts = input.reviewPrompts ?? [];
  if (reviewPrompts.length === 1) {
    items.push({
      id: `feedback-${reviewPrompts[0]}`,
      kind: "feedback",
      title: "Leave a review",
      detail: "Contract completed - share your feedback",
      href: `/contracts/${reviewPrompts[0]}#review`,
      due: null,
      overdue: false,
    });
  } else if (reviewPrompts.length > 1) {
    items.push({
      id: "feedback-group",
      kind: "feedback",
      title: `${reviewPrompts.length} contracts awaiting your review`,
      detail: "Completed contracts - starting with the most recent",
      href: `/contracts/${reviewPrompts[0]}#review`,
      due: null,
      overdue: false,
    });
  }
  if (input.pendingInvitations > 0) {
    items.push({
      id: "invitations",
      kind: "invitation",
      title: `${input.pendingInvitations} job ${input.pendingInvitations === 1 ? "invitation" : "invitations"} to answer`,
      detail: "From employers on the marketplace",
      href: "/marketplace/invitations",
      due: null,
      overdue: false,
    });
  }
  if (input.unreadMessages && input.unreadMessages > 0) {
    items.push({
      id: "messages",
      kind: "messages",
      title: `${input.unreadMessages} unread ${input.unreadMessages === 1 ? "notification" : "notifications"}`,
      detail: "Messages and contract updates",
      href: "/activity",
      due: null,
      overdue: false,
    });
  }
  // Priority: proposals, offers, deadlines/actions, submitted work, invitations,
  // unread messages, then reviews. Within a group: overdue, soonest deadline, order.
  const ranked = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rank = ATTENTION_RANK[a.item.kind] - ATTENTION_RANK[b.item.kind];
      if (rank !== 0) return rank;
      if (a.item.overdue !== b.item.overdue) return a.item.overdue ? -1 : 1;
      const ad = a.item.due ?? Number.POSITIVE_INFINITY;
      const bd = b.item.due ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.index - b.index;
    })
    .map(({ item }) => item);
  return ranked.slice(0, Math.max(0, input.limit ?? 6));
}
