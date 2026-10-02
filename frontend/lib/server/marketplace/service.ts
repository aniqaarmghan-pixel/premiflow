import { PublicKey } from "@solana/web3.js";

import { randomId } from "../crypto";
import { HttpError } from "../http";
import {
  JOB_PAYMENT_MODES,
  DuplicateProposalError,
  type JobPaymentMode,
  type JobStatus,
  type MarketplaceJobPatch,
  type MarketplaceJobRecord,
  type MarketplaceProposalRecord,
  type MarketplaceStore,
  type ProposalStatus,
} from "./store";

export const JOB_TITLE_MAX = 120;
export const JOB_DESCRIPTION_MAX = 4_000;
export const PROPOSAL_MESSAGE_MAX = 2_000;
export const OPEN_JOBS_LIMIT = 50;
const U64_MAX = 18_446_744_073_709_551_615n;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublicJob = {
  id: string;
  employerWallet: string;
  title: string;
  description: string;
  paymentMode: JobPaymentMode;
  budgetAmount: string;
  tokenMint: string;
  status: JobStatus;
  selectedProposalId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type PublicProposal = {
  id: string;
  jobId: string;
  freelancerWallet: string;
  message: string;
  proposedAmount: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
};

export type JobViewerRole = "owner" | "freelancer" | "visitor";

export type JobDetail = {
  job: PublicJob;
  viewerRole: JobViewerRole;
  /** Every proposal for the owner; empty for everyone else. */
  proposals: PublicProposal[];
  /** The viewer's own latest proposal on this job, if any. */
  ownProposal: PublicProposal | null;
};

export type MyProposalItem = { proposal: PublicProposal; job: PublicJob | null };

/** Everything the Create wizard may prefill; never mint, resolver or decimals. */
export type CreateHandoff = {
  /** Absent on job handoffs (older records); "gig" when an employer hires a gig. */
  source?: "job" | "gig";
  /** Gig handoffs only. */
  gigId?: string;
  /** Job handoffs: job id. Gig handoffs: empty string. */
  jobId: string;
  /** Job handoffs: selected proposal id. Gig handoffs: empty string. */
  proposalId: string;
  title: string;
  description: string;
  paymentMode: JobPaymentMode;
  amount: string;
  freelancerWallet: string;
};

export function toPublicJob(row: MarketplaceJobRecord): PublicJob {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

function toPublicProposal(row: MarketplaceProposalRecord): PublicProposal {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The signed session is the only source of identity. */
export function requireMarketplaceWallet(sessionWallet: string | null | undefined): string {
  if (!sessionWallet) {
    throw new HttpError(401, "unauthenticated", "Verify your wallet to continue.");
  }
  return sessionWallet;
}

function invalid(message: string): HttpError {
  return new HttpError(400, "invalid_marketplace_input", message);
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw invalid(`${field} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw invalid(`${field} is required.`);
  if (trimmed.length > max) throw invalid(`${field} must be at most ${max} characters.`);
  return trimmed;
}

function baseAmount(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) {
    throw invalid(`${field} must be a whole number of token base units.`);
  }
  const amount = BigInt(value);
  if (amount <= 0n) throw invalid(`${field} must be greater than zero.`);
  if (amount > U64_MAX) throw invalid(`${field} is too large.`);
  return amount.toString();
}

function paymentMode(value: unknown): JobPaymentMode {
  if (typeof value === "string" && (JOB_PAYMENT_MODES as readonly string[]).includes(value)) {
    return value as JobPaymentMode;
  }
  throw invalid("Payment mode must be Fixed, Milestone, Streaming, or Hourly.");
}

function tokenMint(value: unknown): string {
  try {
    return new PublicKey(String(value)).toBase58();
  } catch {
    throw invalid("Token mint is not valid.");
  }
}

function notFound(message = "Job was not found."): HttpError {
  return new HttpError(404, "not_found", message);
}

function parseId(value: unknown, message?: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw notFound(message);
  return value.toLowerCase();
}

async function loadOwnedJob(
  store: MarketplaceStore,
  jobId: unknown,
  wallet: string
): Promise<MarketplaceJobRecord> {
  const job = await store.getJob(parseId(jobId));
  if (!job) throw notFound();
  if (job.employerWallet !== wallet) {
    throw new HttpError(403, "forbidden", "Only the job owner can do this.");
  }
  return job;
}

function requireOpen(job: MarketplaceJobRecord): void {
  if (job.status !== "open") {
    throw new HttpError(409, "job_not_open", "This job is no longer open.");
  }
}

export async function createJob(
  store: MarketplaceStore,
  input: {
    sessionWallet: string | null;
    title: unknown;
    description: unknown;
    paymentMode: unknown;
    budgetAmount: unknown;
    tokenMint: unknown;
  },
  now = new Date()
): Promise<PublicJob> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const row: MarketplaceJobRecord = {
    id: randomId(),
    employerWallet: wallet,
    title: requiredText(input.title, "Title", JOB_TITLE_MAX),
    description: requiredText(input.description, "Description", JOB_DESCRIPTION_MAX),
    paymentMode: paymentMode(input.paymentMode),
    budgetAmount: baseAmount(input.budgetAmount, "Budget"),
    tokenMint: tokenMint(input.tokenMint),
    status: "open",
    selectedProposalId: null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
  };
  return toPublicJob(await store.insertJob(row));
}

export async function updateJob(
  store: MarketplaceStore,
  input: {
    sessionWallet: string | null;
    jobId: unknown;
    title?: unknown;
    description?: unknown;
    paymentMode?: unknown;
    budgetAmount?: unknown;
  },
  now = new Date()
): Promise<PublicJob> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const job = await loadOwnedJob(store, input.jobId, wallet);
  requireOpen(job);
  const patch: MarketplaceJobPatch = { updatedAt: now };
  if (input.title !== undefined) patch.title = requiredText(input.title, "Title", JOB_TITLE_MAX);
  if (input.description !== undefined) {
    patch.description = requiredText(input.description, "Description", JOB_DESCRIPTION_MAX);
  }
  if (input.paymentMode !== undefined) patch.paymentMode = paymentMode(input.paymentMode);
  if (input.budgetAmount !== undefined) patch.budgetAmount = baseAmount(input.budgetAmount, "Budget");
  const saved = await store.updateJobIfStatus(job.id, "open", patch);
  if (!saved) throw new HttpError(409, "job_not_open", "This job is no longer open.");
  return toPublicJob(saved);
}

/** Closing leaves existing proposals as they are; a closed job accepts no new activity. */
export async function closeJob(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; jobId: unknown },
  now = new Date()
): Promise<PublicJob> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const job = await loadOwnedJob(store, input.jobId, wallet);
  requireOpen(job);
  const saved = await store.updateJobIfStatus(job.id, "open", {
    status: "closed",
    closedAt: now,
    updatedAt: now,
  });
  if (!saved) throw new HttpError(409, "job_not_open", "This job is no longer open.");
  return toPublicJob(saved);
}

export async function listOpenJobs(store: MarketplaceStore): Promise<PublicJob[]> {
  return (await store.listOpenJobs(OPEN_JOBS_LIMIT)).map(toPublicJob);
}

export async function listMyJobs(
  store: MarketplaceStore,
  input: { sessionWallet: string | null }
): Promise<PublicJob[]> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  return (await store.listJobsByEmployer(wallet)).map(toPublicJob);
}

export async function getJobDetail(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; jobId: unknown }
): Promise<JobDetail> {
  const job = await store.getJob(parseId(input.jobId));
  if (!job) throw notFound();
  const wallet = input.sessionWallet ?? null;
  if (wallet && job.employerWallet === wallet) {
    const proposals = await store.listProposalsForJob(job.id);
    return {
      job: toPublicJob(job),
      viewerRole: "owner",
      proposals: proposals.map(toPublicProposal),
      ownProposal: null,
    };
  }
  const own = wallet
    ? (await store.listProposalsForJob(job.id)).find((row) => row.freelancerWallet === wallet) ??
      null
    : null;
  // Closed or filled jobs stay visible only to the owner and to wallets that proposed.
  if (job.status !== "open" && !own) throw notFound();
  return {
    job: toPublicJob(job),
    viewerRole: own ? "freelancer" : "visitor",
    proposals: [],
    ownProposal: own ? toPublicProposal(own) : null,
  };
}

export async function submitProposal(
  store: MarketplaceStore,
  input: {
    sessionWallet: string | null;
    jobId: unknown;
    message: unknown;
    proposedAmount: unknown;
  },
  now = new Date()
): Promise<PublicProposal> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const job = await store.getJob(parseId(input.jobId));
  if (!job) throw notFound();
  if (job.employerWallet === wallet) {
    throw new HttpError(403, "own_job", "You cannot propose on your own job.");
  }
  requireOpen(job);
  const message = requiredText(input.message, "Message", PROPOSAL_MESSAGE_MAX);
  const proposedAmount = baseAmount(input.proposedAmount, "Proposed amount");
  if (await store.findActiveProposal(job.id, wallet)) {
    throw new HttpError(409, "duplicate_proposal", "You already have an active proposal on this job.");
  }
  try {
    const saved = await store.insertProposal({
      id: randomId(),
      jobId: job.id,
      freelancerWallet: wallet,
      message,
      proposedAmount,
      status: "submitted",
      createdAt: now,
      updatedAt: now,
    });
    return toPublicProposal(saved);
  } catch (err) {
    if (err instanceof DuplicateProposalError) {
      throw new HttpError(409, "duplicate_proposal", "You already have an active proposal on this job.");
    }
    throw err;
  }
}

export async function withdrawProposal(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; proposalId: unknown },
  now = new Date()
): Promise<PublicProposal> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const proposal = await store.getProposal(parseId(input.proposalId, "Proposal was not found."));
  if (!proposal) throw notFound("Proposal was not found.");
  if (proposal.freelancerWallet !== wallet) {
    throw new HttpError(403, "forbidden", "Only the freelancer who sent this proposal can withdraw it.");
  }
  const job = await store.getJob(proposal.jobId);
  if (!job) throw notFound();
  requireOpen(job);
  const saved = await store.updateProposalIfStatus(proposal.id, "submitted", {
    status: "withdrawn",
    updatedAt: now,
  });
  if (!saved) {
    throw new HttpError(409, "proposal_not_submitted", "Only a submitted proposal can be withdrawn.");
  }
  return toPublicProposal(saved);
}

/**
 * Owner selects one submitted proposal: the job becomes filled, the proposal
 * selected, and every other still-submitted proposal rejected. No funds move.
 */
export async function selectProposal(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; jobId: unknown; proposalId: unknown },
  now = new Date()
): Promise<JobDetail> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const job = await loadOwnedJob(store, input.jobId, wallet);
  requireOpen(job);
  const proposal = await store.getProposal(parseId(input.proposalId, "Proposal was not found."));
  if (!proposal || proposal.jobId !== job.id) throw notFound("Proposal was not found.");
  if (proposal.status !== "submitted") {
    throw new HttpError(409, "proposal_not_submitted", "Only a submitted proposal can be selected.");
  }
  const filled = await store.updateJobIfStatus(job.id, "open", {
    status: "filled",
    selectedProposalId: proposal.id,
    updatedAt: now,
  });
  if (!filled) throw new HttpError(409, "job_not_open", "This job is no longer open.");
  const selected = await store.updateProposalIfStatus(proposal.id, "submitted", {
    status: "selected",
    updatedAt: now,
  });
  if (!selected) {
    // Withdrawn in between: reopen the job instead of pointing at a dead proposal.
    await store.updateJobIfStatus(job.id, "filled", {
      status: "open",
      selectedProposalId: null,
      updatedAt: now,
    });
    throw new HttpError(409, "proposal_not_submitted", "That proposal is no longer available.");
  }
  await store.rejectOtherSubmitted(job.id, proposal.id, now);
  return getJobDetail(store, { sessionWallet: wallet, jobId: job.id });
}

export async function listMyProposals(
  store: MarketplaceStore,
  input: { sessionWallet: string | null }
): Promise<MyProposalItem[]> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const proposals = await store.listProposalsByFreelancer(wallet);
  const items: MyProposalItem[] = [];
  for (const proposal of proposals) {
    const job = await store.getJob(proposal.jobId);
    items.push({ proposal: toPublicProposal(proposal), job: job ? toPublicJob(job) : null });
  }
  return items;
}

/** Owner-only prefill data for the existing Create wizard after a selection. */
export async function getCreateHandoff(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; jobId: unknown }
): Promise<CreateHandoff> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const job = await loadOwnedJob(store, input.jobId, wallet);
  if (job.status !== "filled" || !job.selectedProposalId) {
    throw new HttpError(409, "job_not_filled", "Select a proposal before creating the contract.");
  }
  const proposal = await store.getProposal(job.selectedProposalId);
  if (!proposal || proposal.status !== "selected" || proposal.jobId !== job.id) {
    throw new HttpError(409, "job_not_filled", "The selected proposal is no longer available.");
  }
  return {
    jobId: job.id,
    proposalId: proposal.id,
    title: job.title,
    description: job.description,
    paymentMode: job.paymentMode,
    amount: proposal.proposedAmount,
    freelancerWallet: proposal.freelancerWallet,
  };
}
