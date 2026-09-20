import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import type { MessagingDatabase } from "./client";
import {
  authChallenges,
  contractMessages,
  rateLimitEvents,
  sessions,
  threadReads,
} from "./schema";
import { randomId } from "../crypto";
import type {
  AuthStore,
  MessageStore,
  RateLimitStore,
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
