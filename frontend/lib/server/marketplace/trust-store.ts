/**
 * Phase 5 off-chain trust and hiring records: verified reviews (only for
 * Completed PREMIFLOW contracts), job invitations, the employer-private
 * proposal shortlist, and marketplace <-> contract links. Reputation is never
 * stored; it is computed from verified reviews on read.
 */
export const REVIEW_ROLES = ["employer", "freelancer"] as const;
export type ReviewRole = (typeof REVIEW_ROLES)[number];

export type MarketplaceReviewRecord = {
  id: string;
  contractAddress: string;
  reviewerWallet: string;
  revieweeWallet: string;
  reviewerRole: ReviewRole;
  /** 1..5 */
  score: number;
  body: string;
  createdAt: Date;
};

export const INVITATION_STATUSES = ["pending", "accepted", "declined"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export type MarketplaceInvitationRecord = {
  id: string;
  jobId: string;
  employerWallet: string;
  freelancerWallet: string;
  message: string;
  status: InvitationStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type MarketplaceShortlistRecord = {
  jobId: string;
  proposalId: string;
  employerWallet: string;
  createdAt: Date;
};

export const LINK_SOURCES = ["job", "gig"] as const;
export type LinkSource = (typeof LINK_SOURCES)[number];

export type MarketplaceContractLinkRecord = {
  contractAddress: string;
  source: LinkSource;
  jobId: string | null;
  proposalId: string | null;
  gigId: string | null;
  employerWallet: string;
  freelancerWallet: string;
  linkedBy: string;
  createdAt: Date;
};

export class DuplicateReviewError extends Error {
  constructor() {
    super("duplicate_review");
    this.name = "DuplicateReviewError";
  }
}

export class DuplicateInvitationError extends Error {
  constructor() {
    super("duplicate_invitation");
    this.name = "DuplicateInvitationError";
  }
}

export interface MarketplaceTrustStore {
  /** Throws DuplicateReviewError on (reviewer, contract) conflict. */
  insertReview(row: MarketplaceReviewRecord): Promise<MarketplaceReviewRecord>;
  getReviewByReviewer(reviewerWallet: string, contractAddress: string): Promise<MarketplaceReviewRecord | null>;
  listReviewsFor(revieweeWallet: string, limit: number): Promise<MarketplaceReviewRecord[]>;
  listReviewsForContract(contractAddress: string): Promise<MarketplaceReviewRecord[]>;

  /** Throws DuplicateInvitationError on (job, freelancer) conflict. */
  insertInvitation(row: MarketplaceInvitationRecord): Promise<MarketplaceInvitationRecord>;
  getInvitation(id: string): Promise<MarketplaceInvitationRecord | null>;
  listInvitationsForJob(jobId: string): Promise<MarketplaceInvitationRecord[]>;
  listInvitationsForFreelancer(wallet: string, limit: number): Promise<MarketplaceInvitationRecord[]>;
  updateInvitationIfStatus(
    id: string,
    from: InvitationStatus,
    patch: Pick<MarketplaceInvitationRecord, "status" | "updatedAt">
  ): Promise<MarketplaceInvitationRecord | null>;

  addShortlist(row: MarketplaceShortlistRecord): Promise<boolean>;
  removeShortlist(jobId: string, proposalId: string): Promise<boolean>;
  listShortlist(jobId: string): Promise<MarketplaceShortlistRecord[]>;

  getContractLink(contractAddress: string): Promise<MarketplaceContractLinkRecord | null>;
  /** Insert-if-absent keyed by contract address. */
  insertContractLink(
    row: MarketplaceContractLinkRecord
  ): Promise<{ record: MarketplaceContractLinkRecord; created: boolean }>;
  listContractLinks(filter: { jobId?: string; gigId?: string }, limit: number): Promise<MarketplaceContractLinkRecord[]>;
}

const byNewest = <T extends { createdAt: Date }>(a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();

export function createMemoryMarketplaceTrustStore(): MarketplaceTrustStore {
  const reviews: MarketplaceReviewRecord[] = [];
  const invitations: MarketplaceInvitationRecord[] = [];
  const shortlist: MarketplaceShortlistRecord[] = [];
  const links: MarketplaceContractLinkRecord[] = [];
  return {
    async insertReview(row) {
      if (reviews.some((r) => r.reviewerWallet === row.reviewerWallet && r.contractAddress === row.contractAddress)) {
        throw new DuplicateReviewError();
      }
      reviews.push({ ...row });
      return { ...row };
    },
    async getReviewByReviewer(reviewerWallet, contractAddress) {
      const r = reviews.find((x) => x.reviewerWallet === reviewerWallet && x.contractAddress === contractAddress);
      return r ? { ...r } : null;
    },
    async listReviewsFor(revieweeWallet, limit) {
      return reviews.filter((r) => r.revieweeWallet === revieweeWallet).sort(byNewest).slice(0, limit).map((r) => ({ ...r }));
    },
    async listReviewsForContract(contractAddress) {
      return reviews.filter((r) => r.contractAddress === contractAddress).sort(byNewest).map((r) => ({ ...r }));
    },
    async insertInvitation(row) {
      if (invitations.some((i) => i.jobId === row.jobId && i.freelancerWallet === row.freelancerWallet)) {
        throw new DuplicateInvitationError();
      }
      invitations.push({ ...row });
      return { ...row };
    },
    async getInvitation(id) {
      const i = invitations.find((x) => x.id === id);
      return i ? { ...i } : null;
    },
    async listInvitationsForJob(jobId) {
      return invitations.filter((i) => i.jobId === jobId).sort(byNewest).map((i) => ({ ...i }));
    },
    async listInvitationsForFreelancer(wallet, limit) {
      return invitations.filter((i) => i.freelancerWallet === wallet).sort(byNewest).slice(0, limit).map((i) => ({ ...i }));
    },
    async updateInvitationIfStatus(id, from, patch) {
      const i = invitations.find((x) => x.id === id);
      if (!i || i.status !== from) return null;
      Object.assign(i, patch);
      return { ...i };
    },
    async addShortlist(row) {
      if (shortlist.some((s) => s.jobId === row.jobId && s.proposalId === row.proposalId)) return false;
      shortlist.push({ ...row });
      return true;
    },
    async removeShortlist(jobId, proposalId) {
      const idx = shortlist.findIndex((s) => s.jobId === jobId && s.proposalId === proposalId);
      if (idx < 0) return false;
      shortlist.splice(idx, 1);
      return true;
    },
    async listShortlist(jobId) {
      return shortlist.filter((s) => s.jobId === jobId).map((s) => ({ ...s }));
    },
    async getContractLink(contractAddress) {
      const l = links.find((x) => x.contractAddress === contractAddress);
      return l ? { ...l } : null;
    },
    async insertContractLink(row) {
      const existing = links.find((x) => x.contractAddress === row.contractAddress);
      if (existing) return { record: { ...existing }, created: false };
      links.push({ ...row });
      return { record: { ...row }, created: true };
    },
    async listContractLinks(filter, limit) {
      return links
        .filter((l) => (filter.jobId ? l.jobId === filter.jobId : true) && (filter.gigId ? l.gigId === filter.gigId : true))
        .sort(byNewest)
        .slice(0, limit)
        .map((l) => ({ ...l }));
    },
  };
}
