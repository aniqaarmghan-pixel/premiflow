import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    nonceHash: text("nonce_hash").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("auth_challenges_nonce_hash_uidx").on(table.nonceHash),
    index("auth_challenges_wallet_created_idx").on(
      table.walletAddress,
      table.createdAt
    ),
    index("auth_challenges_expires_idx").on(table.expiresAt),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    walletAddress: text("wallet_address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash),
    index("sessions_wallet_idx").on(table.walletAddress),
    index("sessions_expires_idx").on(table.expiresAt),
  ]
);

export const contractMessages = pgTable(
  "contract_messages",
  {
    id: uuid("id").primaryKey(),
    contractAddress: text("contract_address").notNull(),
    senderWallet: text("sender_wallet").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("contract_messages_thread_idx").on(
      table.contractAddress,
      table.createdAt,
      table.id
    ),
    check(
      "contract_messages_body_len",
      sql`char_length("body") BETWEEN 1 AND 2000`
    ),
  ]
);

export const threadReads = pgTable(
  "thread_reads",
  {
    contractAddress: text("contract_address").notNull(),
    walletAddress: text("wallet_address").notNull(),
    lastReadMessageId: uuid("last_read_message_id"),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.contractAddress, table.walletAddress],
      name: "thread_reads_pk",
    }),
  ]
);

export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: uuid("id").primaryKey(),
    bucket: text("bucket").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limit_events_bucket_created_idx").on(table.bucket, table.createdAt)]
);
