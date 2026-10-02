import {
  ACTIVE_PROPOSAL_STATUSES,
  DuplicateProposalError,
  type MarketplaceJobRecord,
  type MarketplaceProposalRecord,
  type MarketplaceStore,
} from "./store";

const newestFirst = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }) =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);

export function createMemoryMarketplaceStore(): MarketplaceStore {
  const jobs: MarketplaceJobRecord[] = [];
  const proposals: MarketplaceProposalRecord[] = [];
  return {
    async insertJob(row) {
      jobs.push({ ...row });
      return { ...row };
    },
    async getJob(id) {
      const row = jobs.find((item) => item.id === id);
      return row ? { ...row } : null;
    },
    async updateJobIfStatus(id, expected, patch) {
      const row = jobs.find((item) => item.id === id);
      if (!row || row.status !== expected) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    async listOpenJobs(limit) {
      return jobs
        .filter((row) => row.status === "open")
        .sort(newestFirst)
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
    async listJobsByEmployer(wallet) {
      return jobs
        .filter((row) => row.employerWallet === wallet)
        .sort(newestFirst)
        .map((row) => ({ ...row }));
    },
    async insertProposal(row) {
      const duplicate = proposals.some(
        (item) =>
          item.jobId === row.jobId &&
          item.freelancerWallet === row.freelancerWallet &&
          ACTIVE_PROPOSAL_STATUSES.includes(item.status)
      );
      if (duplicate) throw new DuplicateProposalError();
      proposals.push({ ...row });
      return { ...row };
    },
    async getProposal(id) {
      const row = proposals.find((item) => item.id === id);
      return row ? { ...row } : null;
    },
    async findActiveProposal(jobId, wallet) {
      const row = proposals.find(
        (item) =>
          item.jobId === jobId &&
          item.freelancerWallet === wallet &&
          ACTIVE_PROPOSAL_STATUSES.includes(item.status)
      );
      return row ? { ...row } : null;
    },
    async updateProposalIfStatus(id, expected, patch) {
      const row = proposals.find((item) => item.id === id);
      if (!row || row.status !== expected) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    async rejectOtherSubmitted(jobId, keepProposalId, now) {
      let count = 0;
      for (const row of proposals) {
        if (row.jobId === jobId && row.id !== keepProposalId && row.status === "submitted") {
          row.status = "rejected";
          row.updatedAt = now;
          count += 1;
        }
      }
      return count;
    },
    async listProposalsForJob(jobId) {
      return proposals
        .filter((row) => row.jobId === jobId)
        .sort(newestFirst)
        .map((row) => ({ ...row }));
    },
    async listProposalsByFreelancer(wallet) {
      return proposals
        .filter((row) => row.freelancerWallet === wallet)
        .sort(newestFirst)
        .map((row) => ({ ...row }));
    },
  };
}
