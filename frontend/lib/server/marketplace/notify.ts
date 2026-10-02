import { createNotification } from "../notifications/service";
import type { NotificationKind } from "../notifications/kinds";
import type { NotificationStore } from "../stores";
import type { MarketplaceJobRecord, MarketplaceProposalRecord, MarketplaceGigRecord } from "./store";
import type {
  MarketplaceContractLinkRecord,
  MarketplaceInvitationRecord,
  MarketplaceReviewRecord,
} from "./trust-store";

/**
 * Marketplace inbox notifications on the existing notification system.
 * Recipient-scoped (reads are always by the session wallet), idempotent via
 * unique keys, never carry message text, and never fail the main action.
 */
export type MarketplaceNotice = {
  kind: NotificationKind;
  recipientWallet: string;
  actorWallet: string | null;
  uniqueKey: string;
  title: string;
  body: string;
  href: string;
  contractAddress?: string | null;
  payload?: Record<string, unknown>;
};

export async function sendMarketplaceNotice(
  store: NotificationStore | null | undefined,
  notice: MarketplaceNotice,
  now = new Date()
): Promise<boolean> {
  if (!store || notice.recipientWallet === notice.actorWallet) return false;
  try {
    const result = await createNotification(
      store,
      {
        recipientWallet: notice.recipientWallet,
        type: notice.kind,
        uniqueKey: notice.uniqueKey,
        title: notice.title,
        body: notice.body,
        href: notice.href,
        contractAddress: notice.contractAddress ?? null,
        payload: notice.payload ?? null,
      },
      now
    );
    return result.created;
  } catch {
    return false;
  }
}

const jobHref = (jobId: string) => `/marketplace/jobs/${jobId}`;

export function proposalReceivedNotice(job: MarketplaceJobRecord, proposal: MarketplaceProposalRecord): MarketplaceNotice {
  return {
    kind: "marketplace_proposal_received",
    recipientWallet: job.employerWallet,
    actorWallet: proposal.freelancerWallet,
    uniqueKey: `mkt:proposal_received:${proposal.id}`,
    title: "New proposal",
    body: `A freelancer sent a proposal on "${job.title.slice(0, 120)}".`,
    href: jobHref(job.id),
    payload: { jobId: job.id, proposalId: proposal.id },
  };
}

export function proposalWithdrawnNotice(job: MarketplaceJobRecord, proposal: MarketplaceProposalRecord): MarketplaceNotice {
  return {
    kind: "marketplace_proposal_withdrawn",
    recipientWallet: job.employerWallet,
    actorWallet: proposal.freelancerWallet,
    uniqueKey: `mkt:proposal_withdrawn:${proposal.id}`,
    title: "Proposal withdrawn",
    body: `A freelancer withdrew a proposal on "${job.title.slice(0, 120)}".`,
    href: jobHref(job.id),
    payload: { jobId: job.id, proposalId: proposal.id },
  };
}

export function proposalSelectedNotice(job: MarketplaceJobRecord, proposal: MarketplaceProposalRecord): MarketplaceNotice {
  return {
    kind: "marketplace_proposal_selected",
    recipientWallet: proposal.freelancerWallet,
    actorWallet: job.employerWallet,
    uniqueKey: `mkt:proposal_selected:${proposal.id}`,
    title: "Proposal selected",
    body: `Your proposal on "${job.title.slice(0, 120)}" was selected. Watch Contracts for the on-chain offer.`,
    href: jobHref(job.id),
    payload: { jobId: job.id, proposalId: proposal.id },
  };
}

export function invitationReceivedNotice(job: MarketplaceJobRecord, inv: MarketplaceInvitationRecord): MarketplaceNotice {
  return {
    kind: "marketplace_invitation_received",
    recipientWallet: inv.freelancerWallet,
    actorWallet: inv.employerWallet,
    uniqueKey: `mkt:invitation_received:${inv.id}`,
    title: "Job invitation",
    body: `An employer invited you to propose on "${job.title.slice(0, 120)}".`,
    href: "/marketplace/invitations",
    payload: { jobId: job.id, invitationId: inv.id },
  };
}

export function invitationAnsweredNotice(job: MarketplaceJobRecord, inv: MarketplaceInvitationRecord): MarketplaceNotice {
  const accepted = inv.status === "accepted";
  return {
    kind: accepted ? "marketplace_invitation_accepted" : "marketplace_invitation_declined",
    recipientWallet: inv.employerWallet,
    actorWallet: inv.freelancerWallet,
    uniqueKey: `mkt:invitation_${inv.status}:${inv.id}`,
    title: accepted ? "Invitation accepted" : "Invitation declined",
    body: `A freelancer ${accepted ? "accepted" : "declined"} your invitation for "${job.title.slice(0, 120)}".`,
    href: jobHref(job.id),
    payload: { jobId: job.id, invitationId: inv.id },
  };
}

export function gigHiredNotice(gig: MarketplaceGigRecord, link: MarketplaceContractLinkRecord): MarketplaceNotice {
  return {
    kind: "marketplace_gig_hired",
    recipientWallet: link.freelancerWallet,
    actorWallet: link.linkedBy,
    uniqueKey: `mkt:gig_hired:${link.contractAddress}`,
    title: "Gig hired",
    body: `An employer linked a PREMIFLOW contract to your gig "${gig.title.slice(0, 120)}".`,
    href: `/contracts/${link.contractAddress}`,
    contractAddress: link.contractAddress,
    payload: { gigId: gig.id },
  };
}

export function reviewEligibleNotices(link: MarketplaceContractLinkRecord): MarketplaceNotice[] {
  return [link.employerWallet, link.freelancerWallet].map((wallet) => ({
    kind: "marketplace_review_eligible" as const,
    recipientWallet: wallet,
    actorWallet: null,
    uniqueKey: `mkt:review_eligible:${link.contractAddress}:${wallet}`,
    title: "You can leave a verified review",
    body: "Your marketplace contract is Completed on-chain. You can now review the other party.",
    href: link.jobId ? jobHref(link.jobId) : link.gigId ? `/marketplace/gigs/${link.gigId}` : `/contracts/${link.contractAddress}`,
    contractAddress: link.contractAddress,
  }));
}

export function reviewReceivedNotice(review: MarketplaceReviewRecord): MarketplaceNotice {
  return {
    kind: "marketplace_review_received",
    recipientWallet: review.revieweeWallet,
    actorWallet: review.reviewerWallet,
    uniqueKey: `mkt:review_received:${review.id}`,
    title: "New verified review",
    body: "You received a verified review for a Completed PREMIFLOW contract.",
    href: `/marketplace/profiles/${review.revieweeWallet}`,
    contractAddress: review.contractAddress,
    payload: { reviewId: review.id },
  };
}
