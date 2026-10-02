import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";

import type { MessagingDatabase } from "./client";
import {
  marketplaceGigs,
  marketplaceJobs,
  marketplaceProfiles,
  marketplaceProposals,
} from "./schema";
import { escapeLike } from "../marketplace/catalog-validation";
import {
  ACTIVE_PROPOSAL_STATUSES,
  DuplicateProposalError,
  type JobPaymentMode,
  type GigStatus,
  type JobStatus,
  type MarketplaceGigRecord,
  type MarketplaceProfileRecord,
  type MarketplaceSearchFilter,
  type ProfileAvailability,
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

function asProfile(row: typeof marketplaceProfiles.$inferSelect): MarketplaceProfileRecord {
  return {
    ...row,
    skills: Array.isArray(row.skills) ? row.skills : [],
    portfolio: Array.isArray(row.portfolio) ? row.portfolio : [],
    availability: row.availability as ProfileAvailability,
  };
}

function asGig(row: typeof marketplaceGigs.$inferSelect): MarketplaceGigRecord {
  return {
    ...row,
    skills: Array.isArray(row.skills) ? row.skills : [],
    paymentMode: row.paymentMode as JobPaymentMode,
    status: row.status as GigStatus,
  };
}

/**
 * Shared search conditions. Every user value is a bound parameter; LIKE
 * wildcards are escaped. `skillColumn` null means skills match title/description.
 */
function searchConditions(
  filter: MarketplaceSearchFilter,
  cols: {
    title: typeof marketplaceJobs.title | typeof marketplaceGigs.title;
    description: typeof marketplaceJobs.description | typeof marketplaceGigs.description;
    paymentMode: typeof marketplaceJobs.paymentMode | typeof marketplaceGigs.paymentMode;
    amount: typeof marketplaceJobs.budgetAmount | typeof marketplaceGigs.priceAmount;
    skills: typeof marketplaceGigs.skills | null;
  }
): SQL[] {
  const conditions: SQL[] = [];
  const textMatch = (value: string) => {
    const pattern = `%${escapeLike(value)}%`;
    return or(ilike(cols.title, pattern), ilike(cols.description, pattern)) as SQL;
  };
  if (filter.text) conditions.push(textMatch(filter.text));
  for (const skill of filter.skills) {
    conditions.push(
      cols.skills ? sql`${cols.skills} @> ${JSON.stringify([skill])}::jsonb` : textMatch(skill)
    );
  }
  if (filter.paymentMode) conditions.push(eq(cols.paymentMode, filter.paymentMode));
  if (filter.minAmount) conditions.push(sql`(${cols.amount})::numeric >= ${filter.minAmount}::numeric`);
  if (filter.maxAmount) conditions.push(sql`(${cols.amount})::numeric <= ${filter.maxAmount}::numeric`);
  return conditions;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  const causeCode = (err as { cause?: { code?: string } }).cause?.code;
  return code === "23505" || causeCode === "23505";
}

export function createDrizzleMarketplaceStore(db: MessagingDatabase): MarketplaceStore {
  return {
    async searchOpenJobs(filter) {
      const rows = await db
        .select()
        .from(marketplaceJobs)
        .where(
          and(
            eq(marketplaceJobs.status, "open"),
            ...searchConditions(filter, {
              title: marketplaceJobs.title,
              description: marketplaceJobs.description,
              paymentMode: marketplaceJobs.paymentMode,
              amount: marketplaceJobs.budgetAmount,
              skills: null,
            })
          )
        )
        .orderBy(desc(marketplaceJobs.createdAt), desc(marketplaceJobs.id))
        .limit(filter.limit);
      return rows.map(asJob);
    },
    async getProfile(wallet) {
      const [row] = await db
        .select()
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.wallet, wallet));
      return row ? asProfile(row) : null;
    },
    async upsertProfile(row) {
      const { wallet, createdAt, ...rest } = row;
      const [saved] = await db
        .insert(marketplaceProfiles)
        .values(row)
        .onConflictDoUpdate({ target: marketplaceProfiles.wallet, set: rest })
        .returning();
      void wallet;
      void createdAt;
      return asProfile(saved);
    },
    async insertGig(row) {
      const [saved] = await db.insert(marketplaceGigs).values(row).returning();
      return asGig(saved);
    },
    async getGig(id) {
      const [row] = await db.select().from(marketplaceGigs).where(eq(marketplaceGigs.id, id));
      return row ? asGig(row) : null;
    },
    async updateGigForOwner(id, owner, patch) {
      const [row] = await db
        .update(marketplaceGigs)
        .set(patch)
        .where(and(eq(marketplaceGigs.id, id), eq(marketplaceGigs.freelancerWallet, owner)))
        .returning();
      return row ? asGig(row) : null;
    },
    async deleteGigForOwner(id, owner) {
      const rows = await db
        .delete(marketplaceGigs)
        .where(and(eq(marketplaceGigs.id, id), eq(marketplaceGigs.freelancerWallet, owner)))
        .returning({ id: marketplaceGigs.id });
      return rows.length > 0;
    },
    async listGigsByFreelancer(wallet) {
      const rows = await db
        .select()
        .from(marketplaceGigs)
        .where(eq(marketplaceGigs.freelancerWallet, wallet))
        .orderBy(desc(marketplaceGigs.createdAt));
      return rows.map(asGig);
    },
    async searchActiveGigs(filter) {
      const rows = await db
        .select()
        .from(marketplaceGigs)
        .where(
          and(
            eq(marketplaceGigs.status, "active"),
            ...searchConditions(filter, {
              title: marketplaceGigs.title,
              description: marketplaceGigs.description,
              paymentMode: marketplaceGigs.paymentMode,
              amount: marketplaceGigs.priceAmount,
              skills: marketplaceGigs.skills,
            })
          )
        )
        .orderBy(desc(marketplaceGigs.createdAt), desc(marketplaceGigs.id))
        .limit(filter.limit);
      return rows.map(asGig);
    },
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
