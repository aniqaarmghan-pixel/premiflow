import type { NotificationStore } from "../stores";
import {
  proposalReceivedNotice,
  proposalSelectedNotice,
  proposalWithdrawnNotice,
  sendMarketplaceNotice,
} from "./notify";
import type { MarketplaceStore } from "./store";

/**
 * Best-effort proposal notifications, sent by the routes after the Phase 1
 * service call succeeded (the service itself stays unchanged). A failure here
 * never fails the proposal action.
 */
export async function notifyProposalReceived(
  market: MarketplaceStore,
  notifications: NotificationStore | null | undefined,
  proposalId: string
): Promise<void> {
  try {
    const proposal = await market.getProposal(proposalId);
    const job = proposal ? await market.getJob(proposal.jobId) : null;
    if (proposal && job) await sendMarketplaceNotice(notifications, proposalReceivedNotice(job, proposal));
  } catch {
    /* best effort */
  }
}

export async function notifyProposalWithdrawn(
  market: MarketplaceStore,
  notifications: NotificationStore | null | undefined,
  proposalId: string
): Promise<void> {
  try {
    const proposal = await market.getProposal(proposalId);
    const job = proposal ? await market.getJob(proposal.jobId) : null;
    if (proposal && job) await sendMarketplaceNotice(notifications, proposalWithdrawnNotice(job, proposal));
  } catch {
    /* best effort */
  }
}

export async function notifyProposalSelected(
  market: MarketplaceStore,
  notifications: NotificationStore | null | undefined,
  jobId: string
): Promise<void> {
  try {
    const job = await market.getJob(jobId);
    const proposal = job?.selectedProposalId ? await market.getProposal(job.selectedProposalId) : null;
    if (proposal && job) await sendMarketplaceNotice(notifications, proposalSelectedNotice(job, proposal));
  } catch {
    /* best effort */
  }
}
