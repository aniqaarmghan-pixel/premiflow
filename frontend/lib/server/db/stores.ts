import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import type { MessagingDatabase } from "./client";
import {
  authChallenges,
  caseEvents,
  contractMessages,
  contractWorkSubmissionLinks,
  contractWorkSubmissions,
  notifications,
  partyStatements,
  rateLimitEvents,
  resolutionCases,
  sessions,
  threadReads,
} from "./schema";
import { randomId } from "../crypto";
import type {
  AuthStore,
  CaseStore,
  MessageStore,
  NotificationRecord,
  NotificationStore,
  PartyStatementRecord,
  RateLimitStore,
  ResolutionCaseRecord,
  SubmissionStore,
  WorkSubmissionKind,
  WorkSubmissionLinkRecord,
  WorkSubmissionRecord,
  WorkSubmissionWithLinks,
} from "../stores";

export function createDrizzleAuthStore(db: MessagingDatabase): AuthStore {
  return {
    async insertChallenge(row) {
      await db.insert(authChallenges).values(row);
    },
    async getChallenge(id) {
      const [row] = await db.select().from(authChallenges).where(eq(authChallenges.id, id));
      return row ?? null;
    },
    async latestChallengeForWallet(wallet) {
      const [row] = await db
        .select()
        .from(authChallenges)
        .where(eq(authChallenges.walletAddress, wallet))
        .orderBy(desc(authChallenges.createdAt))
        .limit(1);
      return row ?? null;
    },
    async consumeChallenge(id, now) {
      const rows = await db
        .update(authChallenges)
        .set({ consumedAt: now })
        .where(
          and(
            eq(authChallenges.id, id),
            isNull(authChallenges.consumedAt),
            gt(authChallenges.expiresAt, now)
          )
        )
        .returning();
      return rows[0] ?? null;
    },
    async insertSession(row) {
      await db.insert(sessions).values(row);
    },
    async getSessionByTokenHash(tokenHash) {
      const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
      return row ?? null;
    },
    async revokeSession(id, now) {
      const rows = await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)))
        .returning();
      return rows.length > 0;
    },
  };
}

export function createDrizzleMessageStore(db: MessagingDatabase): MessageStore {
  return {
    async insertMessage(row) {
      const [saved] = await db.insert(contractMessages).values(row).returning();
      return saved;
    },
    async getMessage(id) {
      const [row] = await db.select().from(contractMessages).where(eq(contractMessages.id, id));
      return row ?? null;
    },
    async listMessagesBefore(contractAddress, cursor, limit) {
      const rows = await db
        .select()
        .from(contractMessages)
        .where(
          cursor
            ? and(
                eq(contractMessages.contractAddress, contractAddress),
                or(
                  lt(contractMessages.createdAt, cursor.createdAt),
                  and(
                    eq(contractMessages.createdAt, cursor.createdAt),
                    lt(contractMessages.id, cursor.id)
                  )
                )
              )
            : eq(contractMessages.contractAddress, contractAddress)
        )
        .orderBy(desc(contractMessages.createdAt), desc(contractMessages.id))
        .limit(limit);
      return rows;
    },
    async upsertRead(row) {
      await db
        .insert(threadReads)
        .values(row)
        .onConflictDoUpdate({
          target: [threadReads.contractAddress, threadReads.walletAddress],
          set: {
            lastReadMessageId: row.lastReadMessageId,
            lastReadAt: row.lastReadAt,
          },
        });
    },
    async getRead(contractAddress, walletAddress) {
      const [row] = await db
        .select()
        .from(threadReads)
        .where(
          and(
            eq(threadReads.contractAddress, contractAddress),
            eq(threadReads.walletAddress, walletAddress)
          )
        );
      return row ?? null;
    },
    async countUnread({ contractAddress, wallet, after }) {
      const afterClause = after
        ? sql`and (${contractMessages.createdAt}, ${contractMessages.id}) > (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
        : sql``;
      const [row] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(contractMessages)
        .where(
          sql`${contractMessages.contractAddress} = ${contractAddress}
            and ${contractMessages.senderWallet} <> ${wallet}
            ${afterClause}`
        );
      return Number(row?.count ?? 0);
    },
  };
}

export function createDrizzleRateLimitStore(db: MessagingDatabase): RateLimitStore {
  return {
    async addEvent(bucket, at) {
      await db.insert(rateLimitEvents).values({
        id: randomId(),
        bucket,
        createdAt: at,
      });
    },
    async countSince(bucket, since) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(rateLimitEvents)
        .where(
          and(eq(rateLimitEvents.bucket, bucket), gt(rateLimitEvents.createdAt, since))
        );
      return Number(row?.count ?? 0);
    },
  };
}

function asCase(row: typeof resolutionCases.$inferSelect): ResolutionCaseRecord {
  return {
    ...row,
    disputeOpener: row.disputeOpener as ResolutionCaseRecord["disputeOpener"],
    workflowStatus: row.workflowStatus as ResolutionCaseRecord["workflowStatus"],
  };
}

function asStatement(row: typeof partyStatements.$inferSelect): PartyStatementRecord {
  return {
    ...row,
    partyRole: row.partyRole as PartyStatementRecord["partyRole"],
  };
}

export function createDrizzleCaseStore(db: MessagingDatabase): CaseStore {
  return {
    async getCaseByContract(contractAddress) {
      const [row] = await db
        .select()
        .from(resolutionCases)
        .where(eq(resolutionCases.contractAddress, contractAddress));
      return row ? asCase(row) : null;
    },
    async getCaseById(id) {
      const [row] = await db.select().from(resolutionCases).where(eq(resolutionCases.id, id));
      return row ? asCase(row) : null;
    },
    async insertCase(row) {
      const [saved] = await db.insert(resolutionCases).values(row).returning();
      return asCase(saved);
    },
    async updateCase(id, patch) {
      const rows = await db
        .update(resolutionCases)
        .set(patch)
        .where(eq(resolutionCases.id, id))
        .returning();
      return rows[0] ? asCase(rows[0]) : null;
    },
    async listStatements(caseId) {
      const rows = await db
        .select()
        .from(partyStatements)
        .where(eq(partyStatements.caseId, caseId));
      return rows.map(asStatement);
    },
    async getStatement(caseId, partyWallet) {
      const [row] = await db
        .select()
        .from(partyStatements)
        .where(
          and(eq(partyStatements.caseId, caseId), eq(partyStatements.partyWallet, partyWallet))
        );
      return row ? asStatement(row) : null;
    },
    async upsertStatement(row) {
      const [saved] = await db
        .insert(partyStatements)
        .values(row)
        .onConflictDoUpdate({
          target: [partyStatements.caseId, partyStatements.partyWallet],
          set: {
            body: row.body,
            partyRole: row.partyRole,
            updatedAt: row.updatedAt,
            submittedAt: row.submittedAt,
          },
        })
        .returning();
      return asStatement(saved);
    },
    async insertEvent(row) {
      const [saved] = await db.insert(caseEvents).values(row).returning();
      return saved;
    },
  };
}

function asSubmission(row: typeof contractWorkSubmissions.$inferSelect): WorkSubmissionRecord {
  return {
    ...row,
    submissionKind: row.submissionKind as WorkSubmissionKind,
  };
}

function asLink(row: typeof contractWorkSubmissionLinks.$inferSelect): WorkSubmissionLinkRecord {
  return { ...row };
}

async function loadLinks(
  db: MessagingDatabase,
  submissionId: string
): Promise<WorkSubmissionLinkRecord[]> {
  const rows = await db
    .select()
    .from(contractWorkSubmissionLinks)
    .where(eq(contractWorkSubmissionLinks.submissionId, submissionId))
    .orderBy(contractWorkSubmissionLinks.position);
  return rows.map(asLink);
}

export function createDrizzleSubmissionStore(db: MessagingDatabase): SubmissionStore {
  return {
    async insertSubmission(row, links) {
      if (row.transactionSignature) {
        const existing = await this.getByTransactionSignature(row.transactionSignature);
        if (existing) return existing;
      }
      try {
        await db.insert(contractWorkSubmissions).values(row);
        if (links.length > 0) {
          await db.insert(contractWorkSubmissionLinks).values(
            links.map((link) => ({
              id: randomId(),
              submissionId: row.id,
              url: link.url,
              label: link.label,
              position: link.position,
            }))
          );
        }
      } catch (err) {
        if (row.transactionSignature) {
          const raced = await this.getByTransactionSignature(row.transactionSignature);
          if (raced) return raced;
        }
        throw err;
      }
      return {
        ...row,
        links: await loadLinks(db, row.id),
      };
    },
    async getByTransactionSignature(signature) {
      if (!signature) return null;
      const [row] = await db
        .select()
        .from(contractWorkSubmissions)
        .where(eq(contractWorkSubmissions.transactionSignature, signature));
      if (!row) return null;
      return { ...asSubmission(row), links: await loadLinks(db, row.id) };
    },
    async listByContract(contractAddress) {
      const rows = await db
        .select()
        .from(contractWorkSubmissions)
        .where(eq(contractWorkSubmissions.contractAddress, contractAddress))
        .orderBy(desc(contractWorkSubmissions.createdAt), desc(contractWorkSubmissions.id));
      const out: WorkSubmissionWithLinks[] = [];
      for (const row of rows) {
        out.push({
          ...asSubmission(row),
          links: await loadLinks(db, row.id),
        });
      }
      return out;
    },
  };
}

function asNotification(row: typeof notifications.$inferSelect): NotificationRecord {
  const payload = row.payload;
  return {
    ...row,
    payload:
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null,
  };
}

export function createDrizzleNotificationStore(db: MessagingDatabase): NotificationStore {
  return {
    async insertIdempotent(row) {
      const inserted = await db
        .insert(notifications)
        .values({
          id: row.id,
          recipientWallet: row.recipientWallet,
          type: row.type,
          contractAddress: row.contractAddress,
          title: row.title,
          body: row.body,
          href: row.href,
          payload: row.payload,
          uniqueKey: row.uniqueKey,
          createdAt: row.createdAt,
          readAt: row.readAt,
        })
        .onConflictDoNothing({
          target: [notifications.recipientWallet, notifications.uniqueKey],
        })
        .returning();
      if (inserted[0]) {
        return { row: asNotification(inserted[0]), created: true };
      }
      const [existing] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientWallet, row.recipientWallet),
            eq(notifications.uniqueKey, row.uniqueKey)
          )
        );
      if (!existing) {
        throw new Error("Notification insert conflict without existing row.");
      }
      return { row: asNotification(existing), created: false };
    },
    async getByIdForWallet(id, recipientWallet) {
      const [row] = await db
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.id, id), eq(notifications.recipientWallet, recipientWallet))
        );
      return row ? asNotification(row) : null;
    },
    async listForWallet(recipientWallet, cursor, limit) {
      const rows = await db
        .select()
        .from(notifications)
        .where(
          cursor
            ? and(
                eq(notifications.recipientWallet, recipientWallet),
                or(
                  lt(notifications.createdAt, cursor.createdAt),
                  and(
                    eq(notifications.createdAt, cursor.createdAt),
                    lt(notifications.id, cursor.id)
                  )
                )
              )
            : eq(notifications.recipientWallet, recipientWallet)
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit);
      return rows.map(asNotification);
    },
    async countUnread(recipientWallet) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientWallet, recipientWallet),
            isNull(notifications.readAt)
          )
        );
      return Number(row?.count ?? 0);
    },
    async markRead(id, recipientWallet, now) {
      const updated = await db
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.recipientWallet, recipientWallet),
            isNull(notifications.readAt)
          )
        )
        .returning();
      if (updated[0]) return asNotification(updated[0]);
      const existing = await this.getByIdForWallet(id, recipientWallet);
      return existing;
    },
    async markAllRead(recipientWallet, now) {
      const updated = await db
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.recipientWallet, recipientWallet),
            isNull(notifications.readAt)
          )
        )
        .returning({ id: notifications.id });
      return updated.length;
    },
  };
}
