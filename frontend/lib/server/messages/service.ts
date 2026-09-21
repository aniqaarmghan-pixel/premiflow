import { PublicKey } from "@solana/web3.js";

import { CONTRACT_MESSAGE_MAX_LENGTH, validateMessageBody } from "@/lib/app/contract-messages";
import {
  assertPendingOwnedAttachments,
  parseAttachmentIdList,
  toPublicAttachment,
} from "../attachments/service";
import { randomId } from "../crypto";
import { compareCursor } from "../memory-stores";
import { RATE_LIMITS, consumeRateLimit, sendBucket } from "../rate-limit";
import type {
  AttachmentStore,
  MessageRecord,
  MessageStore,
  RateLimitStore,
} from "../stores";
import {
  decodeMessageCursor,
  encodeMessageCursor,
  toPublicMessage,
  type PublicContractMessage,
  type PublicMessageAttachment,
} from "./pagination";

export const MESSAGE_PAGE_DEFAULT = 30;
export const MESSAGE_PAGE_MAX = 50;

export class MessageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageValidationError";
  }
}

export function parseContractAddress(raw: string): string {
  try {
    return new PublicKey(raw).toBase58();
  } catch {
    throw new MessageValidationError("Contract address is invalid.");
  }
}

export function normalizeLimit(raw: string | null): number {
  if (raw == null || raw === "") return MESSAGE_PAGE_DEFAULT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new MessageValidationError("Limit is invalid.");
  }
  return Math.min(value, MESSAGE_PAGE_MAX);
}

export async function unreadCountForWallet(
  store: MessageStore,
  contractAddress: string,
  wallet: string
): Promise<number> {
  const read = await store.getRead(contractAddress, wallet);
  let after = read?.lastReadMessageId
    ? await store.getMessage(read.lastReadMessageId)
    : null;
  if (read && !after) {
    after = {
      id: "0",
      contractAddress,
      senderWallet: wallet,
      body: "",
      createdAt: read.lastReadAt,
    };
  }
  return store.countUnread({
    contractAddress,
    wallet,
    after: after ? { createdAt: after.createdAt, id: after.id } : null,
  });
}

async function attachmentsForMessages(
  attachments: AttachmentStore | undefined,
  messages: MessageRecord[]
): Promise<Map<string, PublicMessageAttachment[]>> {
  const map = new Map<string, PublicMessageAttachment[]>();
  if (!attachments || messages.length === 0) return map;
  const rows = await attachments.listForMessages(messages.map((m) => m.id));
  for (const row of rows) {
    const pub = toPublicAttachment(row.attachment);
    const list = map.get(row.messageId) ?? [];
    list.push({
      id: pub.id,
      displayFilename: pub.displayFilename,
      contentType: pub.contentType,
      byteSize: pub.byteSize,
      downloadPath: pub.downloadPath,
    });
    map.set(row.messageId, list);
  }
  return map;
}

export async function listContractMessages(
  store: MessageStore,
  input: {
    contractAddress: string;
    cursor: string | null;
    limit: string | null;
    wallet: string;
  },
  attachments?: AttachmentStore
): Promise<{
  messages: PublicContractMessage[];
  nextCursor: string | null;
  unreadCount: number;
}> {
  const contractAddress = parseContractAddress(input.contractAddress);
  const limit = normalizeLimit(input.limit);
  const cursor = decodeMessageCursor(input.cursor);
  if (input.cursor && !cursor) {
    throw new MessageValidationError("Cursor is invalid.");
  }
  const descending = await store.listMessagesBefore(contractAddress, cursor, limit + 1);
  const hasMore = descending.length > limit;
  const pageDesc = hasMore ? descending.slice(0, limit) : descending;
  const oldestNewest = [...pageDesc].reverse();
  const nextCursor =
    hasMore && pageDesc.length > 0
      ? encodeMessageCursor({
          createdAt: pageDesc[pageDesc.length - 1].createdAt,
          id: pageDesc[pageDesc.length - 1].id,
        })
      : null;
  const byMessage = await attachmentsForMessages(attachments, oldestNewest);
  return {
    messages: oldestNewest.map((row) =>
      toPublicMessage(row, byMessage.get(row.id) ?? [])
    ),
    nextCursor,
    unreadCount: await unreadCountForWallet(store, contractAddress, input.wallet),
  };
}

export async function createContractMessage(
  stores: {
    messages: MessageStore;
    rates: RateLimitStore;
    attachments?: AttachmentStore;
  },
  input: {
    contractAddress: string;
    wallet: string;
    body: unknown;
    attachmentIds?: unknown;
  },
  now = new Date()
): Promise<PublicContractMessage> {
  const contractAddress = parseContractAddress(input.contractAddress);
  if (typeof input.body !== "string") {
    throw new MessageValidationError("Message cannot be empty.");
  }
  const parsed = validateMessageBody(input.body);
  if (!parsed.ok) throw new MessageValidationError(parsed.error);
  if (input.body.trim().length > CONTRACT_MESSAGE_MAX_LENGTH) {
    throw new MessageValidationError(
      `Message must be ${CONTRACT_MESSAGE_MAX_LENGTH} characters or fewer.`
    );
  }

  const attachmentIds = parseAttachmentIdList(input.attachmentIds, "message");
  if (attachmentIds.length > 0 && !stores.attachments) {
    throw new MessageValidationError("Attachments are unavailable.");
  }
  if (attachmentIds.length > 0 && stores.attachments) {
    await assertPendingOwnedAttachments(stores.attachments, {
      ids: attachmentIds,
      contractAddress,
      uploaderWallet: input.wallet,
      context: "message",
    });
  }

  await consumeRateLimit(
    stores.rates,
    sendBucket(input.wallet, contractAddress),
    RATE_LIMITS.sendMax,
    RATE_LIMITS.sendWindowMs,
    now
  );
  const saved = await stores.messages.insertMessage({
    id: randomId(),
    contractAddress,
    senderWallet: input.wallet,
    body: input.body.trim(),
    createdAt: now,
  });

  let publicAttachments: PublicMessageAttachment[] = [];
  if (attachmentIds.length > 0 && stores.attachments) {
    const bound = await stores.attachments.bindToMessage(saved.id, attachmentIds);
    publicAttachments = bound.map((row) => {
      const pub = toPublicAttachment(row);
      return {
        id: pub.id,
        displayFilename: pub.displayFilename,
        contentType: pub.contentType,
        byteSize: pub.byteSize,
        downloadPath: pub.downloadPath,
      };
    });
  }

  return toPublicMessage(saved, publicAttachments);
}

export async function markThreadRead(
  store: MessageStore,
  input: { contractAddress: string; wallet: string; lastReadMessageId: string },
  now = new Date()
): Promise<{ unreadCount: number }> {
  const contractAddress = parseContractAddress(input.contractAddress);
  const message = await store.getMessage(input.lastReadMessageId);
  if (!message || message.contractAddress !== contractAddress) {
    throw new MessageValidationError("Message is not part of this contract.");
  }
  await store.upsertRead({
    contractAddress,
    walletAddress: input.wallet,
    lastReadMessageId: message.id,
    lastReadAt: message.createdAt,
  });
  return {
    unreadCount: await unreadCountForWallet(store, contractAddress, input.wallet),
  };
}

export function sortMessagesStable(rows: MessageRecord[]): MessageRecord[] {
  return [...rows].sort((a, b) => compareCursor(a, b));
}
