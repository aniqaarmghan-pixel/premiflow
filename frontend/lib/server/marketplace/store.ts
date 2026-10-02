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

export interface MarketplaceStore {
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
