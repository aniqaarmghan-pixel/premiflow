import { PublicKey } from "@solana/web3.js";

import {
  SUPPORT_DESCRIPTION_MAX,
  SUPPORT_DESCRIPTION_MIN,
  SUPPORT_REPLY_MAX,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_SUBJECT_MIN,
  SUPPORT_TICKET_STATUS_LABEL,
  isSupportTicketCategory,
  isSupportTicketStatus,
  type AdminSupportTicket,
  type PublicSupportMessage,
  type PublicSupportTicket,
  type SupportTicketDetail,
  type SupportTicketStatus,
} from "@/lib/app/support-tickets";

import { randomId } from "../crypto";
import { createNotification } from "../notifications/service";
import type { NotificationStore } from "../stores";
import type { SupportStore, SupportTicketMessageRecord, SupportTicketRecord } from "./store";

export class SupportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportValidationError";
  }
}

/** Missing and not-owned tickets look identical (no enumeration). */
export class SupportNotFoundError extends Error {
  constructor() {
    super("Support ticket was not found.");
    this.name = "SupportNotFoundError";
  }
}

export const SUPPORT_LIST_LIMIT = 100;
export const SUPPORT_NOTIFICATION_KIND = "support_ticket_updated" as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanText(raw: unknown, label: string, min: number, max: number): string {
  if (typeof raw !== "string") throw new SupportValidationError(`${label} is required.`);
  const text = raw.replace(/\u0000/g, "").trim();
  if (text.length < min) {
    throw new SupportValidationError(
      min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`
    );
  }
  if (text.length > max) {
    throw new SupportValidationError(`${label} must be at most ${max} characters.`);
  }
  return text;
}

export function parseTicketId(raw: unknown): string {
  if (typeof raw !== "string" || !UUID_RE.test(raw)) throw new SupportNotFoundError();
  return raw.toLowerCase();
}

function parseContractReference(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") throw new SupportValidationError("Contract reference is invalid.");
  const value = raw.trim();
  if (!value) return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new SupportValidationError("Contract reference must be a Solana contract address.");
  }
}

export function parseStatusFilter(raw: string | null): SupportTicketStatus | null {
  if (raw == null || raw === "" || raw === "all") return null;
  if (!isSupportTicketStatus(raw)) throw new SupportValidationError("Status filter is invalid.");
  return raw;
}

function toPublicTicket(row: SupportTicketRecord): PublicSupportTicket {
  return {
    id: row.id,
    category: row.category,
    subject: row.subject,
    description: row.description,
    contractAddress: row.contractAddress,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminTicket(row: SupportTicketRecord): AdminSupportTicket {
  return { ...toPublicTicket(row), requesterEmail: row.requesterEmail };
}

function toPublicMessage(row: SupportTicketMessageRecord): PublicSupportMessage {
  return { id: row.id, authorRole: row.authorRole, body: row.body, createdAt: row.createdAt.toISOString() };
}

async function ownTicket(store: SupportStore, userId: string, ticketId: unknown) {
  const id = parseTicketId(ticketId);
  const row = await store.getTicket(id);
  if (!row || row.userId !== userId) throw new SupportNotFoundError();
  return row;
}

async function userDetail(store: SupportStore, row: SupportTicketRecord): Promise<SupportTicketDetail> {
  const messages = await store.listMessages(row.id);
  return { ticket: toPublicTicket(row), messages: messages.map(toPublicMessage) };
}

async function adminDetail(
  store: SupportStore,
  row: SupportTicketRecord
): Promise<SupportTicketDetail<AdminSupportTicket>> {
  const messages = await store.listMessages(row.id);
  return { ticket: toAdminTicket(row), messages: messages.map(toPublicMessage) };
}

export async function createSupportTicket(
  store: SupportStore,
  input: { userId: string; requesterEmail: string | null; body: Record<string, unknown> },
  now = new Date()
): Promise<SupportTicketDetail> {
  const { body } = input;
  if (!isSupportTicketCategory(body.category)) {
    throw new SupportValidationError("Choose a ticket category.");
  }
  const row: SupportTicketRecord = {
    id: randomId(),
    userId: input.userId,
    requesterEmail: input.requesterEmail,
    category: body.category,
    subject: cleanText(body.subject, "Subject", SUPPORT_SUBJECT_MIN, SUPPORT_SUBJECT_MAX),
    description: cleanText(
      body.description,
      "Description",
      SUPPORT_DESCRIPTION_MIN,
      SUPPORT_DESCRIPTION_MAX
    ),
    contractAddress: parseContractReference(body.contractAddress),
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  const saved = await store.insertTicket(row);
  return userDetail(store, saved);
}

export async function listOwnSupportTickets(
  store: SupportStore,
  userId: string
): Promise<PublicSupportTicket[]> {
  const rows = await store.listTicketsForUser(userId, SUPPORT_LIST_LIMIT);
  return rows.map(toPublicTicket);
}

export async function getOwnSupportTicket(
  store: SupportStore,
  userId: string,
  ticketId: unknown
): Promise<SupportTicketDetail> {
  return userDetail(store, await ownTicket(store, userId, ticketId));
}

/** The requester replies on their own ticket. A reply reopens a resolved ticket. */
export async function replyToOwnSupportTicket(
  store: SupportStore,
  input: { userId: string; ticketId: unknown; body: unknown },
  now = new Date()
): Promise<SupportTicketDetail> {
  const row = await ownTicket(store, input.userId, input.ticketId);
  const body = cleanText(input.body, "Reply", 1, SUPPORT_REPLY_MAX);
  await store.insertMessage({
    id: randomId(),
    ticketId: row.id,
    authorRole: "user",
    authorUserId: input.userId,
    body,
    createdAt: now,
  });
  if (row.status === "resolved") {
    await store.updateStatus(row.id, "resolved", "open", now);
  } else {
    await store.touchTicket(row.id, now);
  }
  const current = (await store.getTicket(row.id)) ?? row;
  return userDetail(store, current);
}

export async function adminListSupportTickets(
  store: SupportStore,
  filter: { status: SupportTicketStatus | null }
): Promise<AdminSupportTicket[]> {
  const rows = await store.listTickets({ status: filter.status, limit: SUPPORT_LIST_LIMIT });
  return rows.map(toAdminTicket);
}

export async function adminGetSupportTicket(
  store: SupportStore,
  ticketId: unknown
): Promise<SupportTicketDetail<AdminSupportTicket>> {
  const row = await store.getTicket(parseTicketId(ticketId));
  if (!row) throw new SupportNotFoundError();
  return adminDetail(store, row);
}

export type SupportRecipientResolver = (userId: string) => Promise<readonly string[]>;

async function notifyOwner(
  notifications: NotificationStore | undefined,
  recipients: SupportRecipientResolver | undefined,
  owner: SupportTicketRecord,
  input: { uniqueKey: string; title: string; body: string; ticketId: string },
  now: Date
): Promise<number> {
  if (!notifications || !recipients) return 0;
  let recipientWallets: readonly string[];
  try {
    recipientWallets = await recipients(owner.userId);
  } catch {
    return 0;
  }
  let created = 0;
  for (const wallet of new Set(recipientWallets)) {
    try {
      const result = await createNotification(
        notifications,
        {
          recipientWallet: wallet,
          type: SUPPORT_NOTIFICATION_KIND,
          uniqueKey: `${input.uniqueKey}:${wallet}`.slice(0, 200),
          title: input.title,
          body: input.body,
          href: `/support?ticket=${input.ticketId}`,
          payload: { ticketId: input.ticketId },
        },
        now
      );
      if (result.created) created += 1;
    } catch {
      // Notifications are best-effort; the ticket remains the source of truth.
    }
  }
  return created;
}

function subjectLine(subject: string): string {
  return subject.length > 120 ? `${subject.slice(0, 117)}...` : subject;
}

/**
 * Help Desk reply. Admin authority is account data only: no escrow, no
 * settlement, no private contract-message access.
 */
export async function adminReplyToSupportTicket(
  stores: { support: SupportStore; notifications?: NotificationStore },
  input: { adminUserId: string; ticketId: unknown; body: unknown; recipients?: SupportRecipientResolver },
  now = new Date()
): Promise<SupportTicketDetail<AdminSupportTicket>> {
  const row = await stores.support.getTicket(parseTicketId(input.ticketId));
  if (!row) throw new SupportNotFoundError();
  const body = cleanText(input.body, "Reply", 1, SUPPORT_REPLY_MAX);
  const message = await stores.support.insertMessage({
    id: randomId(),
    ticketId: row.id,
    authorRole: "admin",
    authorUserId: input.adminUserId,
    body,
    createdAt: now,
  });
  await stores.support.touchTicket(row.id, now);
  await notifyOwner(
    stores.notifications,
    input.recipients,
    row,
    {
      uniqueKey: `support:${row.id}:reply:${message.id}`,
      title: "PREMIFLOW Help Desk replied",
      body: `New reply on your ticket: ${subjectLine(row.subject)}`,
      ticketId: row.id,
    },
    now
  );
  const current = (await stores.support.getTicket(row.id)) ?? row;
  return adminDetail(stores.support, current);
}

/** Status change. Unchanged status is a no-op and never notifies. */
export async function adminSetSupportTicketStatus(
  stores: { support: SupportStore; notifications?: NotificationStore },
  input: { ticketId: unknown; status: unknown; recipients?: SupportRecipientResolver },
  now = new Date()
): Promise<{ detail: SupportTicketDetail<AdminSupportTicket>; changed: boolean }> {
  if (!isSupportTicketStatus(input.status)) {
    throw new SupportValidationError("Status is invalid.");
  }
  const next = input.status;
  const row = await stores.support.getTicket(parseTicketId(input.ticketId));
  if (!row) throw new SupportNotFoundError();
  if (row.status === next) {
    return { detail: await adminDetail(stores.support, row), changed: false };
  }
  const updated = await stores.support.updateStatus(row.id, row.status, next, now);
  if (!updated) {
    // Another request already changed it; report the current state without notifying.
    const current = (await stores.support.getTicket(row.id)) ?? row;
    return { detail: await adminDetail(stores.support, current), changed: false };
  }
  await notifyOwner(
    stores.notifications,
    input.recipients,
    row,
    {
      uniqueKey: `support:${row.id}:status:${next}:${updated.updatedAt.getTime()}`,
      title: next === "resolved" ? "Support ticket resolved" : "Support ticket updated",
      body: `${subjectLine(row.subject)} is now ${SUPPORT_TICKET_STATUS_LABEL[next]}.`,
      ticketId: row.id,
    },
    now
  );
  return { detail: await adminDetail(stores.support, updated), changed: true };
}
