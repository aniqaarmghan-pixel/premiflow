import type { NotificationCursor } from "../stores";

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.createdAt.toISOString(), i: cursor.id }),
    "utf8"
  ).toString("base64url");
}

export function decodeNotificationCursor(raw: string | null): NotificationCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      t?: unknown;
      i?: unknown;
    };
    if (typeof parsed.t !== "string" || typeof parsed.i !== "string") return null;
    const createdAt = new Date(parsed.t);
    if (Number.isNaN(createdAt.getTime()) || !parsed.i) return null;
    return { createdAt, id: parsed.i };
  } catch {
    return null;
  }
}

export function toPublicNotification(row: {
  id: string;
  recipientWallet: string;
  type: string;
  contractAddress: string | null;
  title: string;
  body: string;
  href: string | null;
  payload: Record<string, unknown> | null;
  uniqueKey: string;
  createdAt: Date;
  readAt: Date | null;
}) {
  return {
    id: row.id,
    type: row.type,
    contractAddress: row.contractAddress,
    title: row.title,
    body: row.body,
    href: row.href,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  };
}

export type PublicNotification = ReturnType<typeof toPublicNotification>;
