import { and, desc, eq } from "drizzle-orm";

import type { MessagingDatabase } from "./client";
import {
  marketplaceContractLinks,
  marketplaceInvitations,
  marketplaceReviews,
  marketplaceShortlist,
} from "./schema";
import {
  DuplicateInvitationError,
  DuplicateReviewError,
  type InvitationStatus,
  type LinkSource,
  type MarketplaceContractLinkRecord,
  type MarketplaceInvitationRecord,
  type MarketplaceReviewRecord,
  type MarketplaceTrustStore,
  type ReviewRole,
} from "../marketplace/trust-store";

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  const causeCode = (err as { cause?: { code?: string } }).cause?.code;
  return code === "23505" || causeCode === "23505";
}

function asReview(row: typeof marketplaceReviews.$inferSelect): MarketplaceReviewRecord {
  return { ...row, reviewerRole: row.reviewerRole as ReviewRole };
}

function asInvitation(row: typeof marketplaceInvitations.$inferSelect): MarketplaceInvitationRecord {
  return { ...row, status: row.status as InvitationStatus };
}

function asLink(row: typeof marketplaceContractLinks.$inferSelect): MarketplaceContractLinkRecord {
  return { ...row, source: row.source as LinkSource };
}

export function createDrizzleMarketplaceTrustStore(db: MessagingDatabase): MarketplaceTrustStore {
  return {
    async insertReview(row) {
      try {
        const [saved] = await db.insert(marketplaceReviews).values(row).returning();
        return asReview(saved);
      } catch (err) {
        if (isUniqueViolation(err)) throw new DuplicateReviewError();
        throw err;
      }
    },
    async getReviewByReviewer(reviewerWallet, contractAddress) {
      const [row] = await db
        .select()
        .from(marketplaceReviews)
        .where(
          and(
            eq(marketplaceReviews.reviewerWallet, reviewerWallet),
            eq(marketplaceReviews.contractAddress, contractAddress)
          )
        )
        .limit(1);
      return row ? asReview(row) : null;
    },
    async listReviewsFor(revieweeWallet, limit) {
      const rows = await db
        .select()
        .from(marketplaceReviews)
        .where(eq(marketplaceReviews.revieweeWallet, revieweeWallet))
        .orderBy(desc(marketplaceReviews.createdAt))
        .limit(limit);
      return rows.map(asReview);
    },
    async listReviewsForContract(contractAddress) {
      const rows = await db
        .select()
        .from(marketplaceReviews)
        .where(eq(marketplaceReviews.contractAddress, contractAddress))
        .orderBy(desc(marketplaceReviews.createdAt))
        .limit(2);
      return rows.map(asReview);
    },

    async insertInvitation(row) {
      try {
        const [saved] = await db.insert(marketplaceInvitations).values(row).returning();
        return asInvitation(saved);
      } catch (err) {
        if (isUniqueViolation(err)) throw new DuplicateInvitationError();
        throw err;
      }
    },
    async getInvitation(id) {
      const [row] = await db.select().from(marketplaceInvitations).where(eq(marketplaceInvitations.id, id)).limit(1);
      return row ? asInvitation(row) : null;
    },
    async listInvitationsForJob(jobId) {
      const rows = await db
        .select()
        .from(marketplaceInvitations)
        .where(eq(marketplaceInvitations.jobId, jobId))
        .orderBy(desc(marketplaceInvitations.createdAt))
        .limit(100);
      return rows.map(asInvitation);
    },
    async listInvitationsForFreelancer(wallet, limit) {
      const rows = await db
        .select()
        .from(marketplaceInvitations)
        .where(eq(marketplaceInvitations.freelancerWallet, wallet))
        .orderBy(desc(marketplaceInvitations.createdAt))
        .limit(limit);
      return rows.map(asInvitation);
    },
    async updateInvitationIfStatus(id, from, patch) {
      const [row] = await db
        .update(marketplaceInvitations)
        .set({ status: patch.status, updatedAt: patch.updatedAt })
        .where(and(eq(marketplaceInvitations.id, id), eq(marketplaceInvitations.status, from)))
        .returning();
      return row ? asInvitation(row) : null;
    },

    async addShortlist(row) {
      const inserted = await db
        .insert(marketplaceShortlist)
        .values(row)
        .onConflictDoNothing({ target: [marketplaceShortlist.jobId, marketplaceShortlist.proposalId] })
        .returning({ id: marketplaceShortlist.proposalId });
      return inserted.length > 0;
    },
    async removeShortlist(jobId, proposalId) {
      const removed = await db
        .delete(marketplaceShortlist)
        .where(and(eq(marketplaceShortlist.jobId, jobId), eq(marketplaceShortlist.proposalId, proposalId)))
        .returning({ id: marketplaceShortlist.proposalId });
      return removed.length > 0;
    },
    async listShortlist(jobId) {
      return db
        .select()
        .from(marketplaceShortlist)
        .where(eq(marketplaceShortlist.jobId, jobId))
        .orderBy(desc(marketplaceShortlist.createdAt))
        .limit(200);
    },

    async getContractLink(contractAddress) {
      const [row] = await db
        .select()
        .from(marketplaceContractLinks)
        .where(eq(marketplaceContractLinks.contractAddress, contractAddress))
        .limit(1);
      return row ? asLink(row) : null;
    },
    async insertContractLink(row) {
      const inserted = await db
        .insert(marketplaceContractLinks)
        .values(row)
        .onConflictDoNothing({ target: marketplaceContractLinks.contractAddress })
        .returning();
      if (inserted.length > 0) return { record: asLink(inserted[0]), created: true };
      const [existing] = await db
        .select()
        .from(marketplaceContractLinks)
        .where(eq(marketplaceContractLinks.contractAddress, row.contractAddress))
        .limit(1);
      return { record: existing ? asLink(existing) : row, created: false };
    },
    async listContractLinks(filter, limit) {
      const where = filter.jobId
        ? eq(marketplaceContractLinks.jobId, filter.jobId)
        : filter.gigId
          ? eq(marketplaceContractLinks.gigId, filter.gigId)
          : undefined;
      if (!where) return [];
      const rows = await db
        .select()
        .from(marketplaceContractLinks)
        .where(where)
        .orderBy(desc(marketplaceContractLinks.createdAt))
        .limit(limit);
      return rows.map(asLink);
    },
  };
}
