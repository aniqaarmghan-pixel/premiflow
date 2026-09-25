/**
 * Attachment upload / bind / authorize / delete lifecycle.
 * Authority comes from session + on-chain parties — never from client role fields.
 */

import {
  ATTACHMENT_AI_POLICY,
  maxFilesForContext,
  validateAttachmentFile,
  type AttachmentContext,
} from "@/lib/app/attachments-policy";
import { randomId } from "../crypto";
import type { BlobStorage } from "../blob/adapter";
import { BlobConfigError } from "../blob/env";
import { buildAttachmentObjectKey } from "../blob/keys";
import { parseContractAddress, MessageValidationError } from "../messages/service";
import { RATE_LIMITS, consumeRateLimit } from "../rate-limit";
import type {
  AttachmentRecord,
  AttachmentStore,
  RateLimitStore,
} from "../stores";
import type { ContractParties } from "../solana/read-contract-parties";
import {
  isAuthorizedSubmissionReader,
  isAuthorizedSubmissionWriter,
} from "../submissions/service";
import { isAuthorizedMessageWallet } from "../messages/authorize";

export { ATTACHMENT_AI_POLICY };

/** Sanitized client-facing copy when storage fails after a valid file policy check. */
export const ATTACHMENT_STORAGE_UNAVAILABLE_MESSAGE =
  "Attachment storage is temporarily unavailable. Try again in a moment.";

/** Safe upload timing — never logs tokens, cookies, or file bytes. */
function logAttachmentUploadTiming(payload: {
  context: AttachmentContext;
  contentType: string;
  byteSize: number;
  validationMs: number;
  rateLimitMs: number;
  blobPutMs: number;
  dbMs: number;
  totalMs: number;
}): void {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.ATTACHMENT_UPLOAD_TIMING !== "1"
  ) {
    return;
  }
  console.info("[premiflow:attachment-upload]", payload);
}

export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentValidationError";
  }
}

export class AttachmentAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentAccessError";
  }
}

/** Storage/provider failure — not an invalid user file. Maps to 503. */
export class AttachmentStorageError extends Error {
  constructor(
    message: string = ATTACHMENT_STORAGE_UNAVAILABLE_MESSAGE,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "AttachmentStorageError";
  }
}

export function uploadBucket(wallet: string, contract: string): string {
  return `upload:${wallet}:${contract}`;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/vercel_blob_[A-Za-z0-9_]+/gi, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/premiflow_session=[^;\s]+/gi, "premiflow_session=[redacted]")
    .slice(0, 300);
}

/** Safe diagnostic fields for server logs — never includes tokens, cookies, or file bytes. */
export function buildAttachmentBlobFailureLog(
  context: {
    operation: "putPrivate";
    contractAddress: string;
    attachmentContext: AttachmentContext;
    contentType: string;
    byteSize: number;
  },
  err: unknown
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    scope: "attachments",
    operation: context.operation,
    contractAddress: context.contractAddress,
    attachmentContext: context.attachmentContext,
    contentType: context.contentType,
    byteSize: context.byteSize,
  };
  if (err instanceof Error) {
    const withExtras = err as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };
    base.errorName = err.name;
    base.errorMessage = redactSensitiveText(err.message);
    if (withExtras.code != null) base.errorCode = String(withExtras.code).slice(0, 80);
    const status = withExtras.status ?? withExtras.statusCode;
    if (typeof status === "number") base.errorStatus = status;
    if (err.cause != null && err.cause instanceof Error) {
      base.causeName = err.cause.name;
      base.causeMessage = redactSensitiveText(err.cause.message);
    }
    return base;
  }
  base.errorMessage = redactSensitiveText(String(err));
  return base;
}

export function logAttachmentBlobFailure(
  context: Parameters<typeof buildAttachmentBlobFailureLog>[0],
  err: unknown,
  log: (entry: Record<string, unknown>) => void = (entry) => {
    console.error("[attachments]", JSON.stringify(entry));
  }
): void {
  log(buildAttachmentBlobFailureLog(context, err));
}

/**
 * Map a Blob put failure to a thrown error for the route layer.
 * BlobConfigError stays distinct; other failures become AttachmentStorageError.
 */
export function throwMappedBlobPutFailure(
  context: Parameters<typeof buildAttachmentBlobFailureLog>[0],
  err: unknown
): never {
  logAttachmentBlobFailure(context, err);
  if (err instanceof BlobConfigError) {
    throw err;
  }
  throw new AttachmentStorageError(ATTACHMENT_STORAGE_UNAVAILABLE_MESSAGE, {
    cause: err,
  });
}

export type PublicAttachment = {
  id: string;
  contractAddress: string;
  context: AttachmentContext;
  displayFilename: string;
  contentType: string;
  byteSize: number;
  status: "pending" | "active" | "deleted";
  createdAt: string;
  downloadPath: string;
};

export function toPublicAttachment(row: AttachmentRecord): PublicAttachment {
  return {
    id: row.id,
    contractAddress: row.contractAddress,
    context: row.context,
    displayFilename: row.displayFilename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    downloadPath: `/api/contracts/${row.contractAddress}/attachments/${row.id}/download`,
  };
}

function parseContext(raw: unknown): AttachmentContext {
  if (raw === "message" || raw === "work_submission") return raw;
  throw new AttachmentValidationError("Attachment context is invalid.");
}

export function assertCanUploadAttachment(
  wallet: string,
  parties: ContractParties,
  context: AttachmentContext
): void {
  if (context === "message") {
    if (!isAuthorizedMessageWallet(wallet, parties)) {
      throw new AttachmentAccessError("Not a participant on this contract.");
    }
    return;
  }
  if (!isAuthorizedSubmissionWriter(wallet, parties)) {
    throw new AttachmentAccessError(
      "Only the freelancer can upload work submission attachments."
    );
  }
}

export function assertCanReadAttachment(
  wallet: string,
  parties: ContractParties,
  row: AttachmentRecord
): void {
  // Pending uploads are private to the uploader until bound into an active record.
  if (row.status === "pending") {
    if (row.uploaderWallet !== wallet) {
      throw new AttachmentAccessError("Pending upload is only available to the uploader.");
    }
    if (row.context === "message") {
      if (!isAuthorizedMessageWallet(wallet, parties)) {
        throw new AttachmentAccessError("Not a participant on this contract.");
      }
      return;
    }
    if (!isAuthorizedSubmissionWriter(wallet, parties)) {
      throw new AttachmentAccessError("Not allowed to download this attachment.");
    }
    return;
  }

  if (row.status !== "active") {
    throw new AttachmentAccessError("Attachment was not found.");
  }

  if (row.context === "message") {
    if (!isAuthorizedMessageWallet(wallet, parties)) {
      throw new AttachmentAccessError("Not a participant on this contract.");
    }
    return;
  }
  if (!isAuthorizedSubmissionReader(wallet, parties)) {
    throw new AttachmentAccessError("Not allowed to download this attachment.");
  }
}

export async function uploadPendingAttachment(
  stores: { attachments: AttachmentStore; rates: RateLimitStore },
  blob: BlobStorage,
  input: {
    contractAddress: string;
    sessionWallet: string;
    parties: ContractParties;
    context: unknown;
    filename: unknown;
    contentType: unknown;
    byteSize: unknown;
    body: ArrayBuffer | Blob | Buffer | File;
  },
  now = new Date()
): Promise<PublicAttachment> {
  const t0 = Date.now();
  const contractAddress = (() => {
    try {
      return parseContractAddress(input.contractAddress);
    } catch (err) {
      if (err instanceof MessageValidationError) {
        throw new AttachmentValidationError(err.message);
      }
      throw err;
    }
  })();
  const context = parseContext(input.context);
  assertCanUploadAttachment(input.sessionWallet, input.parties, context);

  const policy = validateAttachmentFile({
    filename: input.filename,
    contentType: input.contentType,
    byteSize: input.byteSize,
  });
  if (!policy.ok) throw new AttachmentValidationError(policy.error);
  const tValidated = Date.now();

  await consumeRateLimit(
    stores.rates,
    uploadBucket(input.sessionWallet, contractAddress),
    RATE_LIMITS.sendMax,
    RATE_LIMITS.sendWindowMs,
    now
  );
  const tRateLimited = Date.now();

  const pathname = buildAttachmentObjectKey({
    contractAddress,
    context,
    displayFilename: policy.displayFilename,
  });

  let putResult;
  try {
    putResult = await blob.putPrivate({
      pathname,
      body: input.body,
      contentType: policy.contentType,
      byteSize: policy.byteSize,
    });
  } catch (err) {
    throwMappedBlobPutFailure(
      {
        operation: "putPrivate",
        contractAddress,
        attachmentContext: context,
        contentType: policy.contentType,
        byteSize: policy.byteSize,
      },
      err
    );
  }
  const tBlob = Date.now();

  const saved = await stores.attachments.insertPending({
    id: randomId(),
    contractAddress,
    uploaderWallet: input.sessionWallet,
    context,
    blobPathname: putResult.pathname,
    blobUrl: putResult.url,
    displayFilename: policy.displayFilename,
    contentType: policy.contentType,
    byteSize: policy.byteSize,
    status: "pending",
    createdAt: now,
    deletedAt: null,
  });
  const tDb = Date.now();

  logAttachmentUploadTiming({
    context,
    contentType: policy.contentType,
    byteSize: policy.byteSize,
    validationMs: tValidated - t0,
    rateLimitMs: tRateLimited - tValidated,
    blobPutMs: tBlob - tRateLimited,
    dbMs: tDb - tBlob,
    totalMs: tDb - t0,
  });

  return toPublicAttachment(saved);
}

export async function deletePendingAttachment(
  stores: { attachments: AttachmentStore },
  blob: BlobStorage,
  input: {
    contractAddress: string;
    sessionWallet: string;
    attachmentId: string;
  },
  now = new Date()
): Promise<{ ok: true }> {
  const contractAddress = (() => {
    try {
      return parseContractAddress(input.contractAddress);
    } catch (err) {
      if (err instanceof MessageValidationError) {
        throw new AttachmentValidationError(err.message);
      }
      throw err;
    }
  })();

  const row = await stores.attachments.getById(input.attachmentId);
  if (!row || row.contractAddress !== contractAddress) {
    throw new AttachmentAccessError("Attachment was not found.");
  }
  if (row.uploaderWallet !== input.sessionWallet) {
    throw new AttachmentAccessError("Only the uploader can discard a pending upload.");
  }
  if (row.status !== "pending") {
    throw new AttachmentValidationError("Only pending uploads can be discarded.");
  }

  // Never allow delete by arbitrary pathname — only by authorized attachment id.
  await blob.deletePrivate(row.blobPathname);
  await stores.attachments.markDeleted(row.id, now);
  return { ok: true };
}

export async function authorizeAttachmentDownload(
  stores: { attachments: AttachmentStore },
  blob: BlobStorage,
  input: {
    contractAddress: string;
    sessionWallet: string;
    parties: ContractParties;
    attachmentId: string;
  }
) {
  const contractAddress = (() => {
    try {
      return parseContractAddress(input.contractAddress);
    } catch (err) {
      if (err instanceof MessageValidationError) {
        throw new AttachmentValidationError(err.message);
      }
      throw err;
    }
  })();

  const row = await stores.attachments.getById(input.attachmentId);
  if (!row || row.contractAddress !== contractAddress || row.status === "deleted") {
    throw new AttachmentAccessError("Attachment was not found.");
  }
  assertCanReadAttachment(input.sessionWallet, input.parties, row);

  const payload = await blob.getPrivate(row.blobPathname);
  if (!payload) {
    throw new AttachmentAccessError("Attachment was not found.");
  }

  const safeName = row.displayFilename.replace(/"/g, "");
  return {
    attachment: row,
    stream: payload.stream,
    contentType: row.contentType,
    contentDisposition: `attachment; filename="${safeName}"`,
    byteSize: row.byteSize,
  };
}

export function parseAttachmentIdList(
  raw: unknown,
  context: AttachmentContext
): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new AttachmentValidationError("attachmentIds must be an array.");
  }
  const max = maxFilesForContext(context);
  if (raw.length > max) {
    throw new AttachmentValidationError(
      context === "message"
        ? `Messages support at most ${max} attachments.`
        : `Work submissions support at most ${max} attachments.`
    );
  }
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !/^[0-9a-f-]{36}$/i.test(item)) {
      throw new AttachmentValidationError("attachmentIds contains an invalid id.");
    }
    ids.push(item);
  }
  if (new Set(ids).size !== ids.length) {
    throw new AttachmentValidationError("attachmentIds must be unique.");
  }
  return ids;
}

export async function assertPendingOwnedAttachments(
  store: AttachmentStore,
  input: {
    ids: string[];
    contractAddress: string;
    uploaderWallet: string;
    context: AttachmentContext;
  }
): Promise<AttachmentRecord[]> {
  if (input.ids.length === 0) return [];
  const rows = await store.listByIds(input.ids);
  if (rows.length !== input.ids.length) {
    throw new AttachmentValidationError("One or more attachments were not found.");
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered: AttachmentRecord[] = [];
  for (const id of input.ids) {
    const row = byId.get(id)!;
    if (row.contractAddress !== input.contractAddress) {
      throw new AttachmentValidationError("Attachment does not belong to this contract.");
    }
    if (row.uploaderWallet !== input.uploaderWallet) {
      throw new AttachmentAccessError("Attachment was uploaded by a different wallet.");
    }
    if (row.context !== input.context) {
      throw new AttachmentValidationError("Attachment context does not match.");
    }
    if (row.status !== "pending") {
      throw new AttachmentValidationError("Attachment is not pending.");
    }
    ordered.push(row);
  }
  return ordered;
}
