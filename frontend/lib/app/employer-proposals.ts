import type { JobDetail } from "@/lib/server/marketplace/service";

/** A submitted (not yet answered) proposal on one of the employer's open jobs. */
export type EmployerProposalItem = {
  jobId: string;
  jobTitle: string;
  proposalId: string;
  freelancerWallet: string;
  proposedAmount: string;
  createdAt: string;
};

/** Deep link to the job detail proposal section, highlighting one proposal when given. */
export function proposalReviewHref(jobId: string, proposalId?: string | null): string {
  const base = `/marketplace/jobs/${encodeURIComponent(jobId)}`;
  return proposalId ? `${base}?proposal=${encodeURIComponent(proposalId)}#proposals` : `${base}#proposals`;
}

/** Submitted proposals from owner job details (existing API data), newest first. */
export function submittedProposalItems(details: readonly JobDetail[]): EmployerProposalItem[] {
  const items: EmployerProposalItem[] = [];
  for (const detail of details) {
    if (detail.viewerRole !== "owner" || detail.job.status !== "open") continue;
    for (const p of detail.proposals) {
      if (p.status !== "submitted") continue;
      items.push({
        jobId: detail.job.id,
        jobTitle: detail.job.title,
        proposalId: p.id,
        freelancerWallet: p.freelancerWallet,
        proposedAmount: p.proposedAmount,
        createdAt: p.createdAt,
      });
    }
  }
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function proposalCountsByJob(items: readonly EmployerProposalItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.jobId, (counts.get(item.jobId) ?? 0) + 1);
  return counts;
}

export function reviewProposalsLabel(count: number): string {
  return count === 1 ? "Review proposal" : "Review proposals";
}

export function newProposalsLabel(count: number): string {
  return `${count} new ${count === 1 ? "proposal" : "proposals"}`;
}

export function shortWallet(wallet: string): string {
  return wallet.length > 10 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;
}
