import { PublicKey } from "@solana/web3.js";

import { randomId } from "../crypto";
import { HttpError } from "../http";
import type { NotificationStore } from "../stores";
import { cleanText } from "./catalog-validation";
import type { ContractFacts, ContractFactsReader } from "./contract-reader";
import {
  gigHiredNotice,
  invitationAnsweredNotice,
  invitationReceivedNotice,
  reviewEligibleNotices,
  reviewReceivedNotice,
  sendMarketplaceNotice,
} from "./notify";
import { requireMarketplaceWallet } from "./service";
import type { MarketplaceJobRecord, MarketplaceStore } from "./store";
import {
  DuplicateInvitationError,
  DuplicateReviewError,
  LINK_SOURCES,
  type InvitationStatus,
  type LinkSource,
  type MarketplaceContractLinkRecord,
  type MarketplaceInvitationRecord,
  type MarketplaceReviewRecord,
  type MarketplaceTrustStore,
  type ReviewRole,
} from "./trust-store";

export const TRUST_LIMITS = {
  reviewBody: 1_000,
  invitationMessage: 500,
  invitationsPerJob: 50,
  myInvitations: 100,
  reputationSample: 500,
  recentReviews: 10,
  linksPerListing: 10,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TrustDeps = {
  market: MarketplaceStore;
  trust: MarketplaceTrustStore;
  notifications?: NotificationStore | null;
  readContract?: ContractFactsReader;
};

function invalid(message: string): HttpError {
  return new HttpError(400, "invalid_marketplace_input", message);
}

function parseUuid(value: unknown, message: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) throw new HttpError(404, "not_found", message);
  return value.trim().toLowerCase();
}

function parseWalletInput(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw invalid(`${field} is required.`);
  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    throw invalid(`${field} is not a valid wallet address.`);
  }
}

function parseContractAddress(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw invalid("Contract address is required.");
  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    throw invalid("Contract address is invalid.");
  }
}

async function readFacts(deps: TrustDeps, address: string): Promise<ContractFacts> {
  if (!deps.readContract) throw new HttpError(503, "contract_unavailable", "Contract reads are not configured.");
  return deps.readContract(address);
}

/* ---------------- verified reviews ---------------- */

export type PublicReview = {
  id: string;
  contractAddress: string;
  reviewerWallet: string;
  revieweeWallet: string;
  reviewerRole: ReviewRole;
  score: number;
  body: string;
  createdAt: string;
};

export function toPublicReview(row: MarketplaceReviewRecord): PublicReview {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function parseScore(value: unknown): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 5) {
    throw invalid("Score must be a whole number from 1 to 5.");
  }
  return n;
}

export type ReviewEligibility = {
  contractAddress: string;
  eligible: boolean;
  reason: "eligible" | "not_completed" | "not_participant" | "self_contract" | "already_reviewed";
  role: ReviewRole | null;
  revieweeWallet: string | null;
  status: ContractFacts["status"];
};

function eligibilityFor(facts: ContractFacts, wallet: string): Omit<ReviewEligibility, "contractAddress"> {
  const role: ReviewRole | null =
    facts.employer === wallet ? "employer" : facts.freelancer === wallet ? "freelancer" : null;
  const reviewee = role === "employer" ? facts.freelancer : role === "freelancer" ? facts.employer : null;
  if (!role) return { eligible: false, reason: "not_participant", role: null, revieweeWallet: null, status: facts.status };
  if (facts.employer === facts.freelancer) {
    return { eligible: false, reason: "self_contract", role, revieweeWallet: null, status: facts.status };
  }
  if (facts.status !== "Completed") {
    return { eligible: false, reason: "not_completed", role, revieweeWallet: reviewee, status: facts.status };
  }
  return { eligible: true, reason: "eligible", role, revieweeWallet: reviewee, status: facts.status };
}

export async function getReviewEligibility(
  deps: TrustDeps,
  input: { sessionWallet: string | null; contractAddress: unknown }
): Promise<ReviewEligibility> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const address = parseContractAddress(input.contractAddress);
  const facts = await readFacts(deps, address);
  const base = eligibilityFor(facts, wallet);
  if (base.eligible && (await deps.trust.getReviewByReviewer(wallet, facts.address))) {
    return { contractAddress: facts.address, ...base, eligible: false, reason: "already_reviewed" };
  }
  return { contractAddress: facts.address, ...base };
}

/**
 * Verified review: the contract is re-read from chain; only a participant of a
 * Completed contract may review, and only the counterparty, once.
 */
export async function submitReview(
  deps: TrustDeps,
  input: { sessionWallet: string | null; contractAddress: unknown; score: unknown; body: unknown },
  now = new Date()
): Promise<PublicReview> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const address = parseContractAddress(input.contractAddress);
  const score = parseScore(input.score);
  const body = cleanText(input.body, "Review", TRUST_LIMITS.reviewBody, { multiline: true });
  const facts = await readFacts(deps, address);
  const e = eligibilityFor(facts, wallet);
  if (e.reason === "not_participant") {
    throw new HttpError(403, "not_participant", "Only the employer or freelancer of this contract can review it.");
  }
  if (e.reason === "self_contract" || !e.revieweeWallet || e.revieweeWallet === wallet) {
    throw new HttpError(403, "self_review", "You cannot review yourself.");
  }
  if (e.reason === "not_completed") {
    throw new HttpError(409, "contract_not_completed", "Reviews open once the contract is Completed on-chain.");
  }
  try {
    const saved = await deps.trust.insertReview({
      id: randomId(),
      contractAddress: facts.address,
      reviewerWallet: wallet,
      revieweeWallet: e.revieweeWallet,
      reviewerRole: e.role as ReviewRole,
      score,
      body,
      createdAt: now,
    });
    await sendMarketplaceNotice(deps.notifications, reviewReceivedNotice(saved), now);
    return toPublicReview(saved);
  } catch (err) {
    if (err instanceof DuplicateReviewError) {
      throw new HttpError(409, "duplicate_review", "You already reviewed this contract.");
    }
    throw err;
  }
}

export type TrustSummary = {
  wallet: string;
  reviewCount: number;
  /** One decimal; null when there are no verified reviews. */
  averageScore: number | null;
  asFreelancerCount: number;
  asEmployerCount: number;
  /** Distinct Completed contracts behind the verified reviews. */
  completedContracts: number;
  recent: PublicReview[];
};

/** Derived only from verified reviews; nothing here is user-editable. */
export function deriveTrustSummary(wallet: string, reviews: MarketplaceReviewRecord[]): TrustSummary {
  const received = reviews.filter((r) => r.revieweeWallet === wallet && r.reviewerWallet !== wallet);
  const total = received.reduce((sum, r) => sum + r.score, 0);
  return {
    wallet,
    reviewCount: received.length,
    averageScore: received.length > 0 ? Math.round((total / received.length) * 10) / 10 : null,
    // Reviewer role "employer" means the reviewee worked as the freelancer.
    asFreelancerCount: received.filter((r) => r.reviewerRole === "employer").length,
    asEmployerCount: received.filter((r) => r.reviewerRole === "freelancer").length,
    completedContracts: new Set(received.map((r) => r.contractAddress)).size,
    recent: [...received]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, TRUST_LIMITS.recentReviews)
      .map(toPublicReview),
  };
}

export async function getTrustSummary(deps: Pick<TrustDeps, "trust">, input: { wallet: unknown }): Promise<TrustSummary> {
  let wallet: string;
  try {
    wallet = parseWalletInput(input.wallet, "Wallet");
  } catch {
    throw new HttpError(404, "not_found", "Profile not found.");
  }
  return deriveTrustSummary(wallet, await deps.trust.listReviewsFor(wallet, TRUST_LIMITS.reputationSample));
}

/* ---------------- invitations ---------------- */

export type PublicInvitation = {
  id: string;
  jobId: string;
  employerWallet: string;
  freelancerWallet: string;
  message: string;
  status: InvitationStatus;
  createdAt: string;
  updatedAt: string;
};

function toPublicInvitation(row: MarketplaceInvitationRecord): PublicInvitation {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

async function loadOwnedJob(deps: TrustDeps, jobId: unknown, wallet: string): Promise<MarketplaceJobRecord> {
  const job = await deps.market.getJob(parseUuid(jobId, "Job was not found."));
  if (!job) throw new HttpError(404, "not_found", "Job was not found.");
  if (job.employerWallet !== wallet) {
    throw new HttpError(403, "forbidden", "Only the job owner can do this.");
  }
  return job;
}

export async function inviteFreelancer(
  deps: TrustDeps,
  input: { sessionWallet: string | null; jobId: unknown; invitee: unknown; message: unknown },
  now = new Date()
): Promise<PublicInvitation> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const job = await loadOwnedJob(deps, input.jobId, wallet);
  if (job.status !== "open") throw new HttpError(409, "job_not_open", "Only open jobs can send invitations.");
  const invitee = parseWalletInput(input.invitee, "Freelancer wallet");
  if (invitee === wallet) throw invalid("You cannot invite yourself.");
  const message = cleanText(input.message, "Message", TRUST_LIMITS.invitationMessage, { multiline: true });
  const existing = await deps.trust.listInvitationsForJob(job.id);
  if (existing.some((i) => i.freelancerWallet === invitee)) {
    throw new HttpError(409, "duplicate_invitation", "This freelancer was already invited to this job.");
  }
  if (existing.length >= TRUST_LIMITS.invitationsPerJob) {
    throw new HttpError(409, "invitation_limit", `A job can have at most ${TRUST_LIMITS.invitationsPerJob} invitations.`);
  }
  try {
    const saved = await deps.trust.insertInvitation({
      id: randomId(),
      jobId: job.id,
      employerWallet: wallet,
      freelancerWallet: invitee,
      message,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await sendMarketplaceNotice(deps.notifications, invitationReceivedNotice(job, saved), now);
    return toPublicInvitation(saved);
  } catch (err) {
    if (err instanceof DuplicateInvitationError) {
      throw new HttpError(409, "duplicate_invitation", "This freelancer was already invited to this job.");
    }
    throw err;
  }
}

export async function listJobInvitations(
  deps: TrustDeps,
  input: { sessionWallet: string | null; jobId: unknown }
): Promise<PublicInvitation[]> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const job = await loadOwnedJob(deps, input.jobId, wallet);
  return (await deps.trust.listInvitationsForJob(job.id)).map(toPublicInvitation);
}

export type MyInvitationItem = {
  invitation: PublicInvitation;
  job: { id: string; title: string; status: MarketplaceJobRecord["status"] } | null;
};

export async function listMyInvitations(
  deps: TrustDeps,
  input: { sessionWallet: string | null }
): Promise<MyInvitationItem[]> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const rows = await deps.trust.listInvitationsForFreelancer(wallet, TRUST_LIMITS.myInvitations);
  const items: MyInvitationItem[] = [];
  for (const row of rows) {
    const job = await deps.market.getJob(row.jobId);
    items.push({
      invitation: toPublicInvitation(row),
      job: job ? { id: job.id, title: job.title, status: job.status } : null,
    });
  }
  return items;
}

export async function respondToInvitation(
  deps: TrustDeps,
  input: { sessionWallet: string | null; invitationId: unknown; action: unknown },
  now = new Date()
): Promise<PublicInvitation> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  if (input.action !== "accept" && input.action !== "decline") throw invalid("Action must be accept or decline.");
  const inv = await deps.trust.getInvitation(parseUuid(input.invitationId, "Invitation was not found."));
  if (!inv) throw new HttpError(404, "not_found", "Invitation was not found.");
  if (inv.freelancerWallet !== wallet) {
    throw new HttpError(403, "forbidden", "Only the invited freelancer can answer this invitation.");
  }
  if (inv.status !== "pending") throw new HttpError(409, "invitation_answered", "This invitation was already answered.");
  const job = await deps.market.getJob(inv.jobId);
  if (!job) throw new HttpError(404, "not_found", "Job was not found.");
  if (input.action === "accept" && job.status !== "open") {
    throw new HttpError(409, "job_not_open", "This job is no longer open.");
  }
  const status: InvitationStatus = input.action === "accept" ? "accepted" : "declined";
  const saved = await deps.trust.updateInvitationIfStatus(inv.id, "pending", { status, updatedAt: now });
  if (!saved) throw new HttpError(409, "invitation_answered", "This invitation was already answered.");
  await sendMarketplaceNotice(deps.notifications, invitationAnsweredNotice(job, saved), now);
  return toPublicInvitation(saved);
}

/* ---------------- employer-private shortlist ---------------- */

export async function getShortlist(
  deps: TrustDeps,
  input: { sessionWallet: string | null; jobId: unknown }
): Promise<{ proposalIds: string[] }> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const job = await loadOwnedJob(deps, input.jobId, wallet);
  return { proposalIds: (await deps.trust.listShortlist(job.id)).map((s) => s.proposalId) };
}

export async function setShortlisted(
  deps: TrustDeps,
  input: { sessionWallet: string | null; jobId: unknown; proposalId: unknown; shortlisted: boolean },
  now = new Date()
): Promise<{ proposalIds: string[] }> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const job = await loadOwnedJob(deps, input.jobId, wallet);
  const proposalId = parseUuid(input.proposalId, "Proposal was not found.");
  const proposal = await deps.market.getProposal(proposalId);
  if (!proposal || proposal.jobId !== job.id) throw new HttpError(404, "not_found", "Proposal was not found.");
  if (input.shortlisted) {
    await deps.trust.addShortlist({ jobId: job.id, proposalId, employerWallet: wallet, createdAt: now });
  } else {
    await deps.trust.removeShortlist(job.id, proposalId);
  }
  return getShortlist(deps, { sessionWallet: wallet, jobId: job.id });
}

/* ---------------- marketplace <-> contract links ---------------- */

export type PublicContractLink = {
  contractAddress: string;
  source: LinkSource;
  jobId: string | null;
  proposalId: string | null;
  gigId: string | null;
  employerWallet: string;
  freelancerWallet: string;
  createdAt: string;
};

export type ContractLinkView = PublicContractLink & {
  /** Live on-chain status, or null when the RPC read failed. */
  status: ContractFacts["status"] | null;
  reviews: PublicReview[];
};

function toPublicLink(row: MarketplaceContractLinkRecord): PublicContractLink {
  return {
    contractAddress: row.contractAddress,
    source: row.source,
    jobId: row.jobId,
    proposalId: row.proposalId,
    gigId: row.gigId,
    employerWallet: row.employerWallet,
    freelancerWallet: row.freelancerWallet,
    createdAt: row.createdAt.toISOString(),
  };
}

function mismatch(message: string): HttpError {
  return new HttpError(409, "contract_mismatch", message);
}

/**
 * Record which marketplace listing a PREMIFLOW contract came from. The
 * contract is re-read from chain and its parties must match the listing.
 */
export async function linkContract(
  deps: TrustDeps,
  input: {
    sessionWallet: string | null;
    contractAddress: unknown;
    source: unknown;
    jobId?: unknown;
    proposalId?: unknown;
    gigId?: unknown;
    /** Gig hires: the chosen package tier, checked against the gig (not stored). */
    packageTier?: unknown;
  },
  now = new Date()
): Promise<{ link: PublicContractLink; created: boolean }> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const address = parseContractAddress(input.contractAddress);
  if (typeof input.source !== "string" || !(LINK_SOURCES as readonly string[]).includes(input.source)) {
    throw invalid("Source must be job or gig.");
  }
  const source = input.source as LinkSource;
  const facts = await readFacts(deps, address);
  if (wallet !== facts.employer && wallet !== facts.freelancer) {
    throw new HttpError(403, "not_participant", "Only a party to this contract can link it.");
  }
  if (facts.employer === facts.freelancer) throw mismatch("This contract has the same wallet on both sides.");

  let row: MarketplaceContractLinkRecord;
  let gigTitle: { id: string; title: string } | null = null;
  if (source === "job") {
    const job = await deps.market.getJob(parseUuid(input.jobId, "Job was not found."));
    if (!job) throw new HttpError(404, "not_found", "Job was not found.");
    const proposal = await deps.market.getProposal(parseUuid(input.proposalId, "Proposal was not found."));
    if (!proposal || proposal.jobId !== job.id) throw new HttpError(404, "not_found", "Proposal was not found.");
    if (job.selectedProposalId !== proposal.id || proposal.status !== "selected") {
      throw new HttpError(409, "proposal_not_selected", "Only the selected proposal can be linked to a contract.");
    }
    if (job.employerWallet !== facts.employer || proposal.freelancerWallet !== facts.freelancer) {
      throw mismatch("The contract parties do not match this job and proposal.");
    }
    row = {
      contractAddress: facts.address,
      source,
      jobId: job.id,
      proposalId: proposal.id,
      gigId: null,
      employerWallet: facts.employer,
      freelancerWallet: facts.freelancer,
      linkedBy: wallet,
      createdAt: now,
    };
  } else {
    const gig = await deps.market.getGig(parseUuid(input.gigId, "Gig was not found."));
    if (!gig) throw new HttpError(404, "not_found", "Gig was not found.");
    if (gig.freelancerWallet !== facts.freelancer) {
      throw mismatch("The contract freelancer is not this gig's seller.");
    }
    // A gig hire is recorded by the buyer: the session wallet must be the on-chain employer.
    if (wallet !== facts.employer) {
      throw new HttpError(403, "not_employer", "Only the employer who hired this gig can link the contract.");
    }
    if (input.packageTier !== undefined && input.packageTier !== null && input.packageTier !== "") {
      const tier = input.packageTier;
      const packages = gig.packages ?? [];
      if (typeof tier !== "string" || (packages.length > 0 && !packages.some((p) => p.tier === tier))) {
        throw invalid("That package is not offered by this gig.");
      }
    }
    gigTitle = { id: gig.id, title: gig.title };
    row = {
      contractAddress: facts.address,
      source,
      jobId: null,
      proposalId: null,
      gigId: gig.id,
      employerWallet: facts.employer,
      freelancerWallet: facts.freelancer,
      linkedBy: wallet,
      createdAt: now,
    };
  }

  const existing = await deps.trust.getContractLink(facts.address);
  if (existing) {
    const same =
      existing.source === row.source &&
      existing.jobId === row.jobId &&
      existing.proposalId === row.proposalId &&
      existing.gigId === row.gigId;
    if (!same) throw new HttpError(409, "contract_already_linked", "This contract is already linked to another listing.");
  }
  const { record, created } = existing ? { record: existing, created: false } : await deps.trust.insertContractLink(row);
  if (created && record.source === "gig" && gigTitle) {
    const gig = await deps.market.getGig(gigTitle.id);
    if (gig) await sendMarketplaceNotice(deps.notifications, gigHiredNotice(gig, record), now);
  }
  if (facts.status === "Completed") {
    for (const notice of reviewEligibleNotices(record)) await sendMarketplaceNotice(deps.notifications, notice, now);
  }
  return { link: toPublicLink(record), created };
}

/** Linked contracts for a listing, visible only to that contract's parties. */
export async function listContractLinks(
  deps: TrustDeps,
  input: { sessionWallet: string | null; jobId?: unknown; gigId?: unknown }
): Promise<ContractLinkView[]> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const filter =
    input.jobId !== undefined && input.jobId !== null && input.jobId !== ""
      ? { jobId: parseUuid(input.jobId, "Job was not found.") }
      : input.gigId !== undefined && input.gigId !== null && input.gigId !== ""
        ? { gigId: parseUuid(input.gigId, "Gig was not found.") }
        : null;
  if (!filter) throw invalid("Pass a jobId or gigId.");
  const rows = (await deps.trust.listContractLinks(filter, TRUST_LIMITS.linksPerListing)).filter(
    (l) => l.employerWallet === wallet || l.freelancerWallet === wallet
  );
  const out: ContractLinkView[] = [];
  for (const row of rows) {
    let status: ContractFacts["status"] | null = null;
    if (deps.readContract) {
      try {
        status = (await deps.readContract(row.contractAddress)).status;
      } catch {
        status = null;
      }
    }
    const reviews = (await deps.trust.listReviewsForContract(row.contractAddress)).map(toPublicReview);
    out.push({ ...toPublicLink(row), status, reviews });
  }
  return out;
}
