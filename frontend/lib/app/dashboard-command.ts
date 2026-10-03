/**
 * Pure helpers for the /dashboard command center. Every number comes from an
 * existing API response or fetched contract account; nothing is estimated,
 * padded or invented. Empty inputs produce zero counts and honest copy.
 */
import type { PublicGig } from "@/lib/server/marketplace/catalog-service";
import type { MyProposalItem, PublicJob } from "@/lib/server/marketplace/service";
import type { MyInvitationItem, TrustSummary } from "@/lib/server/marketplace/trust-service";
import type { OfferListItem } from "./dashboard-offers";

export type MarketplaceWorkspaceData = {
  jobs: PublicJob[];
  proposals: MyProposalItem[];
  gigs: PublicGig[];
  invitations: MyInvitationItem[];
};

export type MarketplaceWorkspaceCard = {
  key: "jobs" | "proposals" | "gigs" | "invitations";
  label: string;
  value: number;
  detail: string;
  href: string;
};

export const DASHBOARD_WORKSPACE_HREFS = {
  jobs: "/dashboard/jobs",
  proposals: "/dashboard/proposals",
  gigs: "/dashboard/gigs",
  invitations: "/dashboard/invitations",
  messages: "/dashboard/messages",
  activity: "/dashboard/activity",
  reviews: "/dashboard/reviews",
  profile: "/dashboard/profile",
} as const;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Counts per marketplace area, from the signed-in wallet's own listings. */
export function marketplaceWorkspaceCards(data: MarketplaceWorkspaceData): MarketplaceWorkspaceCard[] {
  const openJobs = data.jobs.filter((j) => j.status === "open").length;
  const submitted = data.proposals.filter((p) => p.proposal.status === "submitted").length;
  const selected = data.proposals.filter((p) => p.proposal.status === "selected").length;
  const activeGigs = data.gigs.filter((g) => g.status === "active").length;
  const pendingInvites = data.invitations.filter((i) => i.invitation.status === "pending").length;
  return [
    {
      key: "jobs",
      label: "Open jobs",
      value: openJobs,
      detail: data.jobs.length === 0 ? "No jobs posted yet" : `${plural(data.jobs.length, "job", "jobs")} posted in total`,
      href: DASHBOARD_WORKSPACE_HREFS.jobs,
    },
    {
      key: "proposals",
      label: "Proposals awaiting reply",
      value: submitted,
      detail: data.proposals.length === 0 ? "No proposals sent yet" : `${selected} selected so far`,
      href: DASHBOARD_WORKSPACE_HREFS.proposals,
    },
    {
      key: "gigs",
      label: "Active gigs",
      value: activeGigs,
      detail: data.gigs.length === 0 ? "No gigs published yet" : `${plural(data.gigs.length - activeGigs, "gig", "gigs")} paused`,
      href: DASHBOARD_WORKSPACE_HREFS.gigs,
    },
    {
      key: "invitations",
      label: "Invitations to answer",
      value: pendingInvites,
      detail: data.invitations.length === 0 ? "No invitations yet" : `${plural(data.invitations.length, "invitation", "invitations")} received`,
      href: DASHBOARD_WORKSPACE_HREFS.invitations,
    },
  ];
}

/** True when the wallet has no marketplace listings of any kind yet. */
export function isMarketplaceWorkspaceEmpty(data: MarketplaceWorkspaceData): boolean {
  return data.jobs.length + data.proposals.length + data.gigs.length + data.invitations.length === 0;
}

export type DeadlineItem = {
  address: string;
  href: string;
  title: string;
  deadline: number;
  passed: boolean;
};

/** Real on-chain acceptance deadlines from pending offers, soonest first. */
export function upcomingDeadlines(
  offers: { awaitingYourResponse: OfferListItem[]; waitingForFreelancer: OfferListItem[] },
  limit = 4
): DeadlineItem[] {
  return [
    ...offers.awaitingYourResponse.map((o) => ({ o, title: "Respond to offer" })),
    ...offers.waitingForFreelancer.map((o) => ({ o, title: "Freelancer response due" })),
  ]
    .sort((a, b) => a.o.acceptanceDeadline - b.o.acceptanceDeadline)
    .slice(0, Math.max(0, limit))
    .map(({ o, title }) => ({
      address: o.address,
      href: o.href,
      title,
      deadline: o.acceptanceDeadline,
      passed: o.deadlinePassed,
    }));
}

/** Plain-language reputation line computed only from verified reviews. */
export function reputationLine(summary: TrustSummary | null): string {
  if (!summary || summary.reviewCount === 0) {
    return "No verified reviews yet. They appear after a completed PREMIFLOW contract.";
  }
  const score = summary.averageScore === null ? "" : `Average ${summary.averageScore.toFixed(1)} / 5 from `;
  return `${score}${plural(summary.reviewCount, "verified review", "verified reviews")} across ${plural(
    summary.completedContracts,
    "completed contract",
    "completed contracts"
  )}.`;
}

/** Friendly greeting name from the account session (never a wallet address). */
export function greetingName(user: { name?: string | null; email?: string | null } | null | undefined): string | null {
  const name = user?.name?.trim();
  if (name) return name.split(/\s+/)[0] ?? name;
  const local = user?.email?.split("@")[0]?.trim();
  return local || null;
}
