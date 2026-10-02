import type { MarketplaceCategorySlug } from "@/lib/app/marketplace-categories";

export const JOB_PAYMENT_MODES = ["Fixed", "Milestone", "Streaming", "Hourly"] as const;
export type JobPaymentMode = (typeof JOB_PAYMENT_MODES)[number];

export const JOB_STATUSES = ["open", "closed", "filled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const PROPOSAL_STATUSES = ["submitted", "withdrawn", "selected", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Statuses that count toward the one-active-proposal-per-job rule. */
export const ACTIVE_PROPOSAL_STATUSES: readonly ProposalStatus[] = ["submitted", "selected"];

export type MarketplaceJobRecord = {
  id: string;
  employerWallet: string;
  title: string;
  description: string;
  paymentMode: JobPaymentMode;
  budgetAmount: string;
  tokenMint: string;
  status: JobStatus;
  selectedProposalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  /** Normalized skills; [] for jobs posted before migration 0010. */
  skills: string[];
  /** Explicit category; null means derive from keywords. */
  category: MarketplaceCategorySlug | null;
};

export type MarketplaceProposalRecord = {
  id: string;
  jobId: string;
  freelancerWallet: string;
  message: string;
  proposedAmount: string;
  status: ProposalStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type MarketplaceJobPatch = Partial<
  Pick<
    MarketplaceJobRecord,
    | "title"
    | "description"
    | "paymentMode"
    | "budgetAmount"
    | "skills"
    | "category"
    | "status"
    | "selectedProposalId"
    | "closedAt"
    | "updatedAt"
  >
>;

export type MarketplaceProposalPatch = Partial<
  Pick<MarketplaceProposalRecord, "status" | "updatedAt">
>;

export class DuplicateProposalError extends Error {
  constructor() {
    super("An active proposal already exists for this job.");
    this.name = "DuplicateProposalError";
  }
}

export interface MarketplaceStore extends MarketplaceCatalogStore {
  insertJob(row: MarketplaceJobRecord): Promise<MarketplaceJobRecord>;
  getJob(id: string): Promise<MarketplaceJobRecord | null>;
  /** Conditional write: applies only while the job is still in `expected` status. */
  updateJobIfStatus(
    id: string,
    expected: JobStatus,
    patch: MarketplaceJobPatch
  ): Promise<MarketplaceJobRecord | null>;
  listOpenJobs(limit: number): Promise<MarketplaceJobRecord[]>;
  listJobsByEmployer(wallet: string): Promise<MarketplaceJobRecord[]>;
  /** Throws DuplicateProposalError when an active proposal already exists. */
  insertProposal(row: MarketplaceProposalRecord): Promise<MarketplaceProposalRecord>;
  getProposal(id: string): Promise<MarketplaceProposalRecord | null>;
  findActiveProposal(jobId: string, wallet: string): Promise<MarketplaceProposalRecord | null>;
  updateProposalIfStatus(
    id: string,
    expected: ProposalStatus,
    patch: MarketplaceProposalPatch
  ): Promise<MarketplaceProposalRecord | null>;
  /** Marks every other still-submitted proposal on the job as rejected. */
  rejectOtherSubmitted(jobId: string, keepProposalId: string, now: Date): Promise<number>;
  listProposalsForJob(jobId: string): Promise<MarketplaceProposalRecord[]>;
  listProposalsByFreelancer(wallet: string): Promise<MarketplaceProposalRecord[]>;
}

/* ---------- Phase 2: profiles + gigs (off-chain only; no ratings) ---------- */

export const GIG_STATUSES = ["active", "paused"] as const;
export type GigStatus = (typeof GIG_STATUSES)[number];

export const PROFILE_AVAILABILITY = ["available", "limited", "unavailable"] as const;
export type ProfileAvailability = (typeof PROFILE_AVAILABILITY)[number];

export type PortfolioItem = { title: string; url: string; description: string };

/** One public profile per wallet (employer and/or freelancer). */
export type MarketplaceProfileRecord = {
  wallet: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string;
  bio: string;
  skills: string[];
  /** Hourly rate in locked-token base units, or null when not offered. */
  rateAmount: string | null;
  availability: ProfileAvailability;
  portfolio: PortfolioItem[];
  createdAt: Date;
  updatedAt: Date;
};

export const PACKAGE_TIERS = ["basic", "standard", "premium"] as const;
export type PackageTier = (typeof PACKAGE_TIERS)[number];

export type GigPackage = {
  tier: PackageTier;
  title: string;
  /** Scope of the package. */
  description: string;
  priceAmount: string;
  deliveryDays: number;
  revisions: number;
};

export type MarketplaceGigRecord = {
  id: string;
  freelancerWallet: string;
  title: string;
  description: string;
  skills: string[];
  paymentMode: JobPaymentMode;
  /** Listing price; the lowest package price when packages exist. */
  priceAmount: string;
  tokenMint: string;
  status: GigStatus;
  createdAt: Date;
  updatedAt: Date;
  /** 0011 columns: nullable/defaulted so gigs created earlier stay valid. */
  category: MarketplaceCategorySlug | null;
  coverUrl: string | null;
  media: string[];
  videoUrl: string | null;
  deliveryDays: number | null;
  packages: GigPackage[];
};

export type MarketplaceGigPatch = Partial<
  Pick<
    MarketplaceGigRecord,
    | "title"
    | "description"
    | "skills"
    | "paymentMode"
    | "priceAmount"
    | "status"
    | "updatedAt"
    | "category"
    | "coverUrl"
    | "media"
    | "videoUrl"
    | "deliveryDays"
    | "packages"
  >
>;

export const FAVORITE_TARGETS = ["job", "gig"] as const;
export type FavoriteTarget = (typeof FAVORITE_TARGETS)[number];

export type MarketplaceFavoriteRecord = {
  wallet: string;
  targetType: FavoriteTarget;
  targetId: string;
  createdAt: Date;
};

/** Already validated and bounded by parseSearchParams. */
export const MARKETPLACE_SORTS = ["newest", "amount_asc", "amount_desc"] as const;
export type MarketplaceSort = (typeof MARKETPLACE_SORTS)[number];

export type MarketplaceSearchFilter = {
  text: string | null;
  skills: string[];
  paymentMode: JobPaymentMode | null;
  minAmount: string | null;
  maxAmount: string | null;
  /** Validated category slug; matched by a constant keyword pattern. */
  category: MarketplaceCategorySlug | null;
  /** amount = job budget, gig price, or profile hourly rate. */
  sort: MarketplaceSort;
  limit: number;
};

export interface MarketplaceCatalogStore {
  /** Open jobs only, newest first. Jobs have no skills column: skills match title/description. */
  searchOpenJobs(filter: MarketplaceSearchFilter): Promise<MarketplaceJobRecord[]>;
  getProfile(wallet: string): Promise<MarketplaceProfileRecord | null>;
  upsertProfile(row: MarketplaceProfileRecord): Promise<MarketplaceProfileRecord>;
  insertGig(row: MarketplaceGigRecord): Promise<MarketplaceGigRecord>;
  getGig(id: string): Promise<MarketplaceGigRecord | null>;
  /** Conditional write: applies only when the gig belongs to `owner`. */
  updateGigForOwner(
    id: string,
    owner: string,
    patch: MarketplaceGigPatch
  ): Promise<MarketplaceGigRecord | null>;
  deleteGigForOwner(id: string, owner: string): Promise<boolean>;
  listGigsByFreelancer(wallet: string): Promise<MarketplaceGigRecord[]>;
  /** Active gigs only, newest first. */
  searchActiveGigs(filter: MarketplaceSearchFilter): Promise<MarketplaceGigRecord[]>;
  /**
   * Public profile listing. paymentMode does not apply; min/max/sort use the
   * hourly rate. completeOnly keeps profiles with a name, headline and skills.
   */
  searchProfiles(
    filter: MarketplaceSearchFilter,
    opts: { completeOnly: boolean }
  ): Promise<MarketplaceProfileRecord[]>;
  /** Bounded batch lookup (callers pass at most SEARCH_LIMITS.maxLimit wallets). */
  getProfilesByWallets(wallets: string[]): Promise<MarketplaceProfileRecord[]>;
  /** Idempotent: unique (wallet, targetType, targetId); created=false when already saved. */
  addFavorite(row: MarketplaceFavoriteRecord): Promise<{ record: MarketplaceFavoriteRecord; created: boolean }>;
  removeFavorite(wallet: string, targetType: FavoriteTarget, targetId: string): Promise<boolean>;
  /** Newest first, bounded. */
  listFavorites(wallet: string, limit: number): Promise<MarketplaceFavoriteRecord[]>;
  countFavorites(wallet: string): Promise<number>;
}
