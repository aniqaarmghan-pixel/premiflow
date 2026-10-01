import { PublicKey } from "@solana/web3.js";

import { randomId } from "../crypto";
import type { NotificationRecord, NotificationStore } from "../stores";
import { isNotificationKind, type NotificationKind } from "./kinds";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  toPublicNotification,
  type PublicNotification,
} from "./pagination";

export const NOTIFICATION_PAGE_DEFAULT = 20;
export const NOTIFICATION_PAGE_MAX = 50;

/** Payload keys that must never be persisted (private chat content). */
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "body",
  "message",
  "messageBody",
  "message_body",
  "chatBody",
  "chat_body",
  "text",
  "content",
]);

export class NotificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationValidationError";
  }
}

export class NotificationAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationAccessError";
  }
}

function parseWallet(raw: string): string {
  try {
    return new PublicKey(raw.trim()).toBase58();
  } catch {
    throw new NotificationValidationError("Wallet address is invalid.");
  }
}

function parseOptionalContractAddress(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  try {
    return new PublicKey(raw.trim()).toBase58();
  } catch {
    throw new NotificationValidationError("Contract address is invalid.");
  }
}

export function normalizeNotificationLimit(raw: string | null): number {
  if (raw == null || raw === "") return NOTIFICATION_PAGE_DEFAULT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new NotificationValidationError("Limit is invalid.");
  }
  return Math.min(value, NOTIFICATION_PAGE_MAX);
}

function sanitizePayload(
  payload: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (payload == null) return null;
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new NotificationValidationError("Payload is invalid.");
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function assertNonEmptyText(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new NotificationValidationError(`${label} is required.`);
  }
  if (trimmed.length > max) {
    throw new NotificationValidationError(`${label} is too long.`);
  }
  return trimmed;
}

export type CreateNotificationInput = {
  recipientWallet: string;
  type: NotificationKind | string;
  uniqueKey: string;
  title: string;
  body: string;
  contractAddress?: string | null;
  href?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function createNotification(
  store: NotificationStore,
  input: CreateNotificationInput,
  now = new Date()
): Promise<{ notification: PublicNotification; created: boolean }> {
  const recipientWallet = parseWallet(input.recipientWallet);
  if (!isNotificationKind(input.type)) {
    throw new NotificationValidationError("Notification type is invalid.");
  }
  const uniqueKey = assertNonEmptyText(input.uniqueKey, "Unique key", 200);
  const title = assertNonEmptyText(input.title, "Title", 200);
  const body = assertNonEmptyText(input.body, "Body", 2000);
  const contractAddress = parseOptionalContractAddress(input.contractAddress ?? null);
  let href: string | null = null;
  if (input.href != null && input.href !== "") {
    href = assertNonEmptyText(input.href, "Href", 500);
  }
  const payload = sanitizePayload(input.payload ?? null);

  const row: NotificationRecord = {
    id: randomId(),
    recipientWallet,
    type: input.type,
    contractAddress,
    title,
    body,
    href,
    payload,
    uniqueKey,
    createdAt: now,
    readAt: null,
  };

  const result = await store.insertIdempotent(row);
  return {
    notification: toPublicNotification(result.row),
    created: result.created,
  };
}

export async function listNotifications(
  store: NotificationStore,
  input: {
    /** Must be the authenticated session wallet. */
    recipientWallet: string;
    cursor: string | null;
    limit: string | null;
  }
): Promise<{
  notifications: PublicNotification[];
  nextCursor: string | null;
}> {
  const recipientWallet = parseWallet(input.recipientWallet);
  const limit = normalizeNotificationLimit(input.limit);
  const cursor = decodeNotificationCursor(input.cursor);
  if (input.cursor && !cursor) {
    throw new NotificationValidationError("Cursor is invalid.");
  }
  const page = await store.listForWallet(recipientWallet, cursor, limit + 1);
  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;
  const nextCursor =
    hasMore && items.length > 0
      ? encodeNotificationCursor({
          createdAt: items[items.length - 1].createdAt,
          id: items[items.length - 1].id,
        })
      : null;
  return {
    notifications: items.map(toPublicNotification),
    nextCursor,
  };
}


function normalizedWalletSet(wallets: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of wallets) {
    const wallet = parseWallet(raw);
    if (seen.has(wallet)) continue;
    seen.add(wallet);
    result.push(wallet);
  }

  return result;
}

function notificationRecordNewestFirst(
  a: NotificationRecord,
  b: NotificationRecord
): number {
  const time = b.createdAt.getTime() - a.createdAt.getTime();
  if (time !== 0) return time;
  return b.id.localeCompare(a.id);
}

export async function listNotificationsForWallets(
  store: NotificationStore,
  input: {
    recipientWallets: readonly string[];
    cursor: string | null;
    limit: string | null;
  }
): Promise<{
  notifications: PublicNotification[];
  nextCursor: string | null;
}> {
  const wallets = normalizedWalletSet(input.recipientWallets);
  const limit = normalizeNotificationLimit(input.limit);
  const cursor = decodeNotificationCursor(input.cursor);

  if (input.cursor && !cursor) {
    throw new NotificationValidationError("Cursor is invalid.");
  }

  if (wallets.length === 0) {
    return { notifications: [], nextCursor: null };
  }

  const pages = await Promise.all(
    wallets.map((wallet) =>
      store.listForWallet(wallet, cursor, limit + 1)
    )
  );

  const merged = pages
    .flat()
    .sort(notificationRecordNewestFirst);

  const hasMore = merged.length > limit;
  const items = hasMore ? merged.slice(0, limit) : merged;

  const nextCursor =
    hasMore && items.length > 0
      ? encodeNotificationCursor({
          createdAt: items[items.length - 1].createdAt,
          id: items[items.length - 1].id,
        })
      : null;

  return {
    notifications: items.map(toPublicNotification),
    nextCursor,
  };
}

export async function unreadNotificationCountForWallets(
  store: NotificationStore,
  recipientWallets: readonly string[]
): Promise<{ unreadCount: number }> {
  const wallets = normalizedWalletSet(recipientWallets);

  const counts = await Promise.all(
    wallets.map((wallet) => store.countUnread(wallet))
  );

  return {
    unreadCount: counts.reduce((total, value) => total + value, 0),
  };
}

export async function markNotificationReadForWallets(
  store: NotificationStore,
  input: {
    id: string;
    recipientWallets: readonly string[];
  },
  now = new Date()
): Promise<{ notification: PublicNotification }> {
  if (!input.id || typeof input.id !== "string") {
    throw new NotificationValidationError("Notification id is invalid.");
  }

  const wallets = normalizedWalletSet(input.recipientWallets);

  for (const wallet of wallets) {
    const existing = await store.getByIdForWallet(input.id, wallet);
    if (!existing) continue;

    if (existing.readAt) {
      return { notification: toPublicNotification(existing) };
    }

    const updated = await store.markRead(input.id, wallet, now);
    if (!updated) {
      throw new NotificationAccessError("Notification was not found.");
    }

    return { notification: toPublicNotification(updated) };
  }

  throw new NotificationAccessError("Notification was not found.");
}

export async function markAllNotificationsReadForWallets(
  store: NotificationStore,
  recipientWallets: readonly string[],
  now = new Date()
): Promise<{ markedCount: number }> {
  const wallets = normalizedWalletSet(recipientWallets);

  const counts = await Promise.all(
    wallets.map((wallet) => store.markAllRead(wallet, now))
  );

  return {
    markedCount: counts.reduce((total, value) => total + value, 0),
  };
}

export async function unreadNotificationCount(
  store: NotificationStore,
  recipientWallet: string
): Promise<{ unreadCount: number }> {
  const wallet = parseWallet(recipientWallet);
  return { unreadCount: await store.countUnread(wallet) };
}

export async function markNotificationRead(
  store: NotificationStore,
  input: { id: string; recipientWallet: string },
  now = new Date()
): Promise<{ notification: PublicNotification }> {
  const recipientWallet = parseWallet(input.recipientWallet);
  if (!input.id || typeof input.id !== "string") {
    throw new NotificationValidationError("Notification id is invalid.");
  }
  const existing = await store.getByIdForWallet(input.id, recipientWallet);
  if (!existing) {
    throw new NotificationAccessError("Notification was not found.");
  }
  if (existing.readAt) {
    return { notification: toPublicNotification(existing) };
  }
  const updated = await store.markRead(input.id, recipientWallet, now);
  if (!updated) {
    throw new NotificationAccessError("Notification was not found.");
  }
  return { notification: toPublicNotification(updated) };
}

export async function markAllNotificationsRead(
  store: NotificationStore,
  recipientWallet: string,
  now = new Date()
): Promise<{ markedCount: number }> {
  const wallet = parseWallet(recipientWallet);
  const markedCount = await store.markAllRead(wallet, now);
  return { markedCount };
}
