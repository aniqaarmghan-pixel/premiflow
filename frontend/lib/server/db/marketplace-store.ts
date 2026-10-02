import { and, desc, eq, inArray, ne } from "drizzle-orm";

import type { MessagingDatabase } from "./client";
import { marketplaceJobs, marketplaceProposals } from "./schema";
import {
  ACTIVE_PROPOSAL_STATUSES,
  DuplicateProposalError,
  type JobPaymentMode,
  type JobStatus,
  type MarketplaceJobRecord,
  type MarketplaceProposalRecord,
  type MarketplaceStore,
  type ProposalStatus,
} from "../marketplace/store";

function asJob(row: typeof marketplaceJobs.$inferSelect): MarketplaceJobRecord {
  return {
    ...row,
    paymentMode: row.paymentMode as JobPaymentMode,
    status: row.status as JobStatus,
  };
}

function asProposal(row: typeof marketplaceProposals.$inferSelect): MarketplaceProposalRecord {
  return { ...row, status: row.status as ProposalStatus };
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  const causeCode = (err as { cause?: { code?: string } }).cause?.code;
  return code === "23505" || causeCode === "23505";
}

export function createDrizzleMarketplaceStore(db: MessagingDatabase): MarketplaceStore {
  return {
    async insertJob(row) {
      const [saved] = await db.insert(marketplaceJobs).values(row).returning();
      return asJob(saved);
    },
    async getJob(id) {
      const [row] = await db.select().from(marketplaceJobs).where(eq(marketplaceJobs.id, id));
      return row ? asJob(row) : null;
    },
    async updateJobIfStatus(id, expected, patch) {
      const [row] = await db
        .update(marketplaceJobs)
        .set(patch)
        .where(and(eq(marketplaceJobs.id, id), eq(marketplaceJobs.status, expected)))
        .returning();
      return row ? asJob(row) : null;
    },
    async listOpenJobs(limit) {
      const rows = await db
        .select()
        .from(marketplaceJobs)
        .where(eq(marketplaceJobs.status, "open"))
        .orderBy(desc(marketplaceJobs.createdAt), desc(marketplaceJobs.id))
        .limit(limit);
      return rows.map(asJob);
    },
    async listJobsByEmployer(wallet) {
      const rows = await db
        .select()
        .from(marketplaceJobs)
        .where(eq(marketplaceJobs.employerWallet, wallet))
        .orderBy(desc(marketplaceJobs.createdAt));
      return rows.map(asJob);
    },
    async insertProposal(row) {
      try {
        const [saved] = await db.insert(marketplaceProposals).values(row).returning();
        return asProposal(saved);
      } catch (err) {
        if (isUniqueViolation(err)) throw new DuplicateProposalError();
        throw err;
      }
    },
    async getProposal(id) {
      const [row] = await db
        .select()
        .from(marketplaceProposals)
        .where(eq(marketplaceProposals.id, id));
      return row ? asProposal(row) : null;
    },
    async findActiveProposal(jobId, wallet) {
      const [row] = await db
        .select()
        .from(marketplaceProposals)
        .where(
          and(
            eq(marketplaceProposals.jobId, jobId),
            eq(marketplaceProposals.freelancerWallet, wallet),
            inArray(marketplaceProposals.status, [...ACTIVE_PROPOSAL_STATUSES])
          )
        );
      return row ? asProposal(row) : null;
    },
    async updateProposalIfStatus(id, expected, patch) {
      const [row] = await db
        .update(marketplaceProposals)
        .set(patch)
        .where(and(eq(marketplaceProposals.id, id), eq(marketplaceProposals.status, expected)))
        .returning();
      return row ? asProposal(row) : null;
    },
    async rejectOtherSubmitted(jobId, keepProposalId, now) {
      const rows = await db
        .update(marketplaceProposals)
        .set({ status: "rejected", updatedAt: now })
        .where(
          and(
            eq(marketplaceProposals.jobId, jobId),
            ne(marketplaceProposals.id, keepProposalId),
            eq(marketplaceProposals.status, "submitted")
          )
        )
        .returning({ id: marketplaceProposals.id });
      return rows.length;
    },
    async listProposalsForJob(jobId) {
      const rows = await db
        .select()
        .from(marketplaceProposals)
        .where(eq(marketplaceProposals.jobId, jobId))
        .orderBy(desc(marketplaceProposals.createdAt));
      return rows.map(asProposal);
    },
    async listProposalsByFreelancer(wallet) {
      const rows = await db
        .select()
        .from(marketplaceProposals)
        .where(eq(marketplaceProposals.freelancerWallet, wallet))
        .orderBy(desc(marketplaceProposals.createdAt));
      return rows.map(asProposal);
    },
  };
}
