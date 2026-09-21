import type { MessageCursor, MessageRecord } from "../stores";

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.createdAt.toISOString(), i: cursor.id }),
    "utf8"
  ).toString("base64url");
}

export function decodeMessageCursor(raw: string | null): MessageCursor | null {
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

export type PublicMessageAttachment = {
  id: string;
  displayFilename: string;
  contentType: string;
  byteSize: number;
  downloadPath: string;
};

export function toPublicMessage(
  row: MessageRecord,
  attachments: PublicMessageAttachment[] = []
) {
  return {
    id: row.id,
    contractAddress: row.contractAddress,
    senderWallet: row.senderWallet,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    attachments,
  };
}

export type PublicContractMessage = ReturnType<typeof toPublicMessage>;
