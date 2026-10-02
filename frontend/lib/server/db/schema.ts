import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
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

export const resolutionCases = pgTable(
  "resolution_cases",
  {
    id: uuid("id").primaryKey(),
    contractAddress: text("contract_address").notNull(),
    disputeOpener: text("dispute_opener").notNull(),
    disputeCategory: text("dispute_category"),
    disputeDescription: text("dispute_description"),
    resolverWallet: text("resolver_wallet").notNull(),
    workflowStatus: text("workflow_status").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    contestedAmountSnapshot: text("contested_amount_snapshot").notNull(),
    openSignature: text("open_signature"),
    resolveSignature: text("resolve_signature"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("resolution_cases_contract_address_uidx").on(table.contractAddress),
    index("resolution_cases_resolver_idx").on(table.resolverWallet),
    check(
      "resolution_cases_opener_enum",
      sql`${table.disputeOpener} in ('Employer', 'Freelancer')`
    ),
    check(
      "resolution_cases_category_enum",
      sql`${table.disputeCategory} is null or ${table.disputeCategory} in (
        'work_not_delivered',
        'incomplete_work',
        'work_quality',
        'scope',
        'payment',
        'deadline_abandonment',
        'time_hours',
        'other'
      )`
    ),
    check(
      "resolution_cases_workflow_enum",
      sql`${table.workflowStatus} in (
        'awaiting_statements',
        'ready_for_resolver',
        'under_review',
        'settlement_submitted'
      )`
    ),
    check(
      "resolution_cases_description_len",
      sql`${table.disputeDescription} is null or char_length(${table.disputeDescription}) between 0 and 4000`
    ),
    check(
      "resolution_cases_amount_digits",
      sql`${table.contestedAmountSnapshot} ~ '^[0-9]+$'`
    ),
  ]
);

export const partyStatements = pgTable(
  "party_statements",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => resolutionCases.id, { onDelete: "cascade" }),
    partyWallet: text("party_wallet").notNull(),
    partyRole: text("party_role").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("party_statements_case_wallet_uidx").on(table.caseId, table.partyWallet),
    index("party_statements_case_idx").on(table.caseId),
    check("party_statements_role_enum", sql`${table.partyRole} in ('employer', 'freelancer')`),
    check(
      "party_statements_body_len",
      sql`char_length(${table.body}) between 1 and 4000`
    ),
  ]
);

export const caseEvents = pgTable(
  "case_events",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => resolutionCases.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorWallet: text("actor_wallet"),
    payload: text("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("case_events_case_created_idx").on(table.caseId, table.createdAt, table.id),
    check(
      "case_events_type_len",
      sql`char_length(${table.eventType}) between 1 and 64`
    ),
  ]
);

/**
 * Immutable selected-message snapshots submitted to a Resolution Case.
 *
 * This table deliberately stores copied message facts instead of granting the
 * resolver access to the private employer/freelancer conversation.
 */
export const caseEvidenceSnapshots = pgTable(
  "case_evidence_snapshots",
  {
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => resolutionCases.id, { onDelete: "cascade" }),
    contractAddress: text("contract_address").notNull(),
    messageId: uuid("message_id").notNull(),
    submittedBy: text("submitted_by").notNull(),
    submittedByRole: text("submitted_by_role").notNull(),
    senderWalletSnapshot: text("sender_wallet_snapshot").notNull(),
    bodySnapshot: text("body_snapshot").notNull(),
    createdAtSnapshot: timestamp("created_at_snapshot", {
      withTimezone: true,
    }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("case_evidence_case_message_uidx").on(
      table.caseId,
      table.messageId
    ),
    index("case_evidence_case_submitted_idx").on(
      table.caseId,
      table.submittedAt,
      table.id
    ),
    check(
      "case_evidence_submitter_role_enum",
      sql`${table.submittedByRole} in ('employer', 'freelancer')`
    ),
    check(
      "case_evidence_body_len",
      sql`char_length(${table.bodySnapshot}) between 1 and 2000`
    ),
  ]
);

/**
 * Append-only off-chain delivery history for Submit Trial / Submit Work.
 * Solana remains authoritative for eligibility and review lifecycle.
 * Block 3C attachments will reference submissionId — do not store file bytes here.
 */
export const contractWorkSubmissions = pgTable(
  "contract_work_submissions",
  {
    id: uuid("id").primaryKey(),
    contractAddress: text("contract_address").notNull(),
    submissionKind: text("submission_kind").notNull(),
    workUnitIndex: integer("work_unit_index").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    freelancerWallet: text("freelancer_wallet").notNull(),
    deliveryNote: text("delivery_note").notNull(),
    onChainSubmissionUri: text("on_chain_submission_uri").notNull(),
    transactionSignature: text("transaction_signature"),
    chainSubmittedAt: timestamp("chain_submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("contract_work_submissions_contract_created_idx").on(
      table.contractAddress,
      table.createdAt,
      table.id
    ),
    index("contract_work_submissions_contract_unit_idx").on(
      table.contractAddress,
      table.submissionKind,
      table.workUnitIndex,
      table.revisionNumber
    ),
    uniqueIndex("contract_work_submissions_tx_sig_uidx").on(table.transactionSignature),
    check(
      "contract_work_submissions_kind_enum",
      sql`${table.submissionKind} in ('trial', 'fixed', 'milestone')`
    ),
    check(
      "contract_work_submissions_note_len",
      sql`char_length(${table.deliveryNote}) between 1 and 4000`
    ),
    check(
      "contract_work_submissions_uri_len",
      sql`char_length(${table.onChainSubmissionUri}) between 1 and 200`
    ),
    check(
      "contract_work_submissions_revision_nonneg",
      sql`${table.revisionNumber} >= 0`
    ),
    check(
      "contract_work_submissions_index_nonneg",
      sql`${table.workUnitIndex} >= 0`
    ),
  ]
);

export const contractWorkSubmissionLinks = pgTable(
  "contract_work_submission_links",
  {
    id: uuid("id").primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => contractWorkSubmissions.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    label: text("label"),
    position: integer("position").notNull(),
  },
  (table) => [
    index("contract_work_submission_links_submission_idx").on(
      table.submissionId,
      table.position
    ),
    check(
      "contract_work_submission_links_url_len",
      sql`char_length(${table.url}) between 1 and 200`
    ),
    check(
      "contract_work_submission_links_label_len",
      sql`${table.label} is null or char_length(${table.label}) between 1 and 80`
    ),
    check(
      "contract_work_submission_links_position_nonneg",
      sql`${table.position} >= 0`
    ),
  ]
);

/**
 * Private attachment metadata (Vercel Blob). Bytes live in Blob store only.
 * Bindings enforce one active use per attachment (message XOR work submission).
 */
export const contractAttachments = pgTable(
  "contract_attachments",
  {
    id: uuid("id").primaryKey(),
    contractAddress: text("contract_address").notNull(),
    uploaderWallet: text("uploader_wallet").notNull(),
    context: text("context").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    blobUrl: text("blob_url").notNull(),
    displayFilename: text("display_filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("contract_attachments_pathname_uidx").on(table.blobPathname),
    index("contract_attachments_contract_created_idx").on(
      table.contractAddress,
      table.createdAt,
      table.id
    ),
    index("contract_attachments_uploader_status_idx").on(
      table.uploaderWallet,
      table.status,
      table.createdAt
    ),
    check(
      "contract_attachments_context_enum",
      sql`${table.context} in ('message', 'work_submission')`
    ),
    check(
      "contract_attachments_status_enum",
      sql`${table.status} in ('pending', 'active', 'deleted')`
    ),
    check(
      "contract_attachments_filename_len",
      sql`char_length(${table.displayFilename}) between 1 and 180`
    ),
    check(
      "contract_attachments_content_type_len",
      sql`char_length(${table.contentType}) between 1 and 120`
    ),
    check(
      "contract_attachments_byte_size_positive",
      sql`${table.byteSize} > 0 AND ${table.byteSize} <= 10485760`
    ),
    check(
      "contract_attachments_pathname_len",
      sql`char_length(${table.blobPathname}) between 1 and 512`
    ),
  ]
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => contractMessages.id, { onDelete: "cascade" }),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => contractAttachments.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.messageId, table.attachmentId],
      name: "message_attachments_pk",
    }),
    uniqueIndex("message_attachments_attachment_uidx").on(table.attachmentId),
    index("message_attachments_message_idx").on(table.messageId, table.position),
    check(
      "message_attachments_position_nonneg",
      sql`${table.position} >= 0`
    ),
  ]
);

export const workSubmissionAttachments = pgTable(
  "work_submission_attachments",
  {
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => contractWorkSubmissions.id, { onDelete: "cascade" }),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => contractAttachments.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.submissionId, table.attachmentId],
      name: "work_submission_attachments_pk",
    }),
    uniqueIndex("work_submission_attachments_attachment_uidx").on(
      table.attachmentId
    ),
    index("work_submission_attachments_submission_idx").on(
      table.submissionId,
      table.position
    ),
    check(
      "work_submission_attachments_position_nonneg",
      sql`${table.position} >= 0`
    ),
  ]
);

/**
 * Persistent wallet-scoped in-app notifications (off-chain).
 * Solana remains authoritative for contract/payment state; rows are delivery hints only.
 * Do not store private chat message bodies in payload.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    recipientWallet: text("recipient_wallet").notNull(),
    type: text("type").notNull(),
    contractAddress: text("contract_address"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    uniqueKey: text("unique_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("notifications_recipient_unique_key_uidx").on(
      table.recipientWallet,
      table.uniqueKey
    ),
    index("notifications_recipient_read_created_idx").on(
      table.recipientWallet,
      table.readAt,
      table.createdAt
    ),
    check(
      "notifications_type_enum",
      sql`${table.type} in (
        'message_received',
        'contract_offer_received',
        'offer_accepted',
        'offer_declined',
        'awaiting_activation',
        'contract_activated',
        'work_submitted',
        'revision_requested',
        'revised_work_submitted',
        'work_approved',
        'payment_released',
        'payment_withdrawn',
        'contract_cancelled',
        'dispute_opened',
        'dispute_resolved',
        'deadline_warning'
      )`
    ),
    check(
      "notifications_title_len",
      sql`char_length(${table.title}) between 1 and 200`
    ),
    check(
      "notifications_body_len",
      sql`char_length(${table.body}) between 1 and 2000`
    ),
    check(
      "notifications_unique_key_len",
      sql`char_length(${table.uniqueKey}) between 1 and 200`
    ),
    check(
      "notifications_href_len",
      sql`${table.href} is null or char_length(${table.href}) between 1 and 500`
    ),
  ]
);
