import { compareForSort, matchesProfileSearch, matchesSearch } from "./catalog-validation";
import {
  ACTIVE_PROPOSAL_STATUSES,
  DuplicateProposalError,
  type MarketplaceGigRecord,
  type MarketplaceJobRecord,
  type MarketplaceProfileRecord,
  type MarketplaceFavoriteRecord,
  type MarketplaceProposalRecord,
  type MarketplaceStore,
} from "./store";

const newestFirst = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }) =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);

export function createMemoryMarketplaceStore(): MarketplaceStore {
  const jobs: MarketplaceJobRecord[] = [];
  const proposals: MarketplaceProposalRecord[] = [];
  const profiles = new Map<string, MarketplaceProfileRecord>();
  const gigs: MarketplaceGigRecord[] = [];
  const cloneProfile = (row: MarketplaceProfileRecord): MarketplaceProfileRecord => ({
    ...row,
    skills: [...row.skills],
    portfolio: row.portfolio.map((item) => ({ ...item })),
  });
  const cloneGig = (row: MarketplaceGigRecord): MarketplaceGigRecord => ({
    ...row,
    skills: [...row.skills],
    media: [...(row.media ?? [])],
    packages: (row.packages ?? []).map((p) => ({ ...p })),
  });
  const favorites: MarketplaceFavoriteRecord[] = [];
  return {
    async searchOpenJobs(filter) {
      return jobs
        .filter(
          (row) =>
            row.status === "open" &&
            matchesSearch({ ...row, amount: row.budgetAmount, skillFallback: true }, filter)
        )
        .sort(compareForSort(filter.sort, (row) => row.budgetAmount))
        .slice(0, filter.limit)
        .map((row) => ({ ...row }));
    },
    async getProfile(wallet) {
      const row = profiles.get(wallet);
      return row ? cloneProfile(row) : null;
    },
    async upsertProfile(row) {
      profiles.set(row.wallet, cloneProfile(row));
      return cloneProfile(row);
    },
    async insertGig(row) {
      gigs.push(cloneGig(row));
      return cloneGig(row);
    },
    async getGig(id) {
      const row = gigs.find((item) => item.id === id);
      return row ? cloneGig(row) : null;
    },
    async updateGigForOwner(id, owner, patch) {
      const row = gigs.find((item) => item.id === id);
      if (!row || row.freelancerWallet !== owner) return null;
      Object.assign(row, patch, patch.skills ? { skills: [...patch.skills] } : {});
      return cloneGig(row);
    },
    async deleteGigForOwner(id, owner) {
      const index = gigs.findIndex((item) => item.id === id && item.freelancerWallet === owner);
      if (index < 0) return false;
      gigs.splice(index, 1);
      return true;
    },
    async listGigsByFreelancer(wallet) {
      return gigs
        .filter((row) => row.freelancerWallet === wallet)
        .sort(newestFirst)
        .map(cloneGig);
    },
    async searchActiveGigs(filter) {
      return gigs
        .filter(
          (row) =>
            row.status === "active" &&
            matchesSearch({ ...row, amount: row.priceAmount, skillFallback: true }, filter)
        )
        .sort(compareForSort(filter.sort, (row) => row.priceAmount))
        .slice(0, filter.limit)
        .map(cloneGig);
    },
    async searchProfiles(filter, opts) {
      // Profiles have no id; "newest" means most recently updated.
      type Keyed = { createdAt: Date; id: string; rate: string | null; row: MarketplaceProfileRecord };
      return [...profiles.values()]
        .filter((row) => matchesProfileSearch(row, filter, opts))
        .map((row): Keyed => ({ createdAt: row.updatedAt, id: row.wallet, rate: row.rateAmount, row }))
        .sort(compareForSort<Keyed>(filter.sort, (k) => k.rate))
        .slice(0, filter.limit)
        .map((k) => cloneProfile(k.row));
    },
    async addFavorite(row) {
      const existing = favorites.find(
        (f) => f.wallet === row.wallet && f.targetType === row.targetType && f.targetId === row.targetId
      );
      if (existing) return { record: { ...existing }, created: false };
      favorites.push({ ...row });
      return { record: { ...row }, created: true };
    },
    async removeFavorite(wallet, targetType, targetId) {
      const index = favorites.findIndex(
        (f) => f.wallet === wallet && f.targetType === targetType && f.targetId === targetId
      );
      if (index < 0) return false;
      favorites.splice(index, 1);
      return true;
    },
    async listFavorites(wallet, limit) {
      return favorites
        .filter((f) => f.wallet === wallet)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map((f) => ({ ...f }));
    },
    async countFavorites(wallet) {
      return favorites.filter((f) => f.wallet === wallet).length;
    },
    async getProfilesByWallets(wallets) {
      return wallets
        .map((wallet) => profiles.get(wallet))
        .filter((row): row is MarketplaceProfileRecord => Boolean(row))
        .map(cloneProfile);
    },
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
