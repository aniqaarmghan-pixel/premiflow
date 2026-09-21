import { z } from "zod";

import {
  validateDeliveryPayload,
  type SubmissionKind,
} from "@/lib/app/work-delivery";
import { MAX_URI_LEN } from "@/lib/streampay-v2/constants";
import {
  AttachmentAccessError,
  AttachmentValidationError,
  assertPendingOwnedAttachments,
  parseAttachmentIdList,
  toPublicAttachment,
  type PublicAttachment,
} from "../attachments/service";
import { randomId } from "../crypto";
import { RATE_LIMITS, consumeRateLimit, sendBucket } from "../rate-limit";
import type {
  AttachmentStore,
  RateLimitStore,
  SubmissionStore,
  WorkSubmissionWithLinks,
} from "../stores";
import { parseContractAddress, MessageValidationError } from "../messages/service";
import type { ContractParties } from "../solana/read-contract-parties";

export class SubmissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionValidationError";
  }
}

export class SubmissionAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionAccessError";
  }
}

const BANNED_BODY_KEYS = [
  "payout",
  "settlement",
  "resolverAward",
  "freelancerContestedAward",
  "mint",
  "mintOverride",
  "employer",
  "employerOverride",
  "freelancer",
  "freelancerOverride",
  "programId",
  "programIdOverride",
  "availableActions",
] as const;

const persistBodySchema = z
  .object({
    submissionKind: z.enum(["trial", "fixed", "milestone"]),
    workUnitIndex: z.number().int().min(0).max(255),
    revisionNumber: z.number().int().min(0).max(255),
    deliveryNote: z.string(),
    links: z.array(
      z
        .object({
          url: z.string(),
          label: z.string().optional().nullable(),
        })
        .strict()
    ),
    onChainSubmissionUri: z.string().min(1).max(MAX_URI_LEN),
    transactionSignature: z
      .string()
      .min(64)
      .max(128)
      .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Transaction signature is invalid."),
    chainSubmittedAt: z.union([z.number().int().positive(), z.string().datetime()]).optional().nullable(),
    attachmentIds: z.array(z.string()).max(10).optional(),
  })
  .strict();

export function assertNoBannedSubmissionKeys(body: Record<string, unknown>): void {
  for (const key of BANNED_BODY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new SubmissionValidationError(`Field "${key}" is not allowed.`);
    }
  }
}

export function isAuthorizedSubmissionReader(
  wallet: string,
  parties: ContractParties
): boolean {
  return wallet === parties.employer || wallet === parties.freelancer;
}

export function isAuthorizedSubmissionWriter(
  wallet: string,
  parties: ContractParties
): boolean {
  return wallet === parties.freelancer;
}

function toPublicSubmission(
  row: WorkSubmissionWithLinks,
  attachments: PublicAttachment[] = []
) {
  return {
    id: row.id,
    contractAddress: row.contractAddress,
    submissionKind: row.submissionKind,
    workUnitIndex: row.workUnitIndex,
    revisionNumber: row.revisionNumber,
    freelancerWallet: row.freelancerWallet,
    deliveryNote: row.deliveryNote,
    onChainSubmissionUri: row.onChainSubmissionUri,
    transactionSignature: row.transactionSignature,
    chainSubmittedAt: row.chainSubmittedAt
      ? row.chainSubmittedAt.toISOString()
      : null,
    createdAt: row.createdAt.toISOString(),
    links: row.links.map((link) => ({
      id: link.id,
      url: link.url,
      label: link.label,
      position: link.position,
    })),
    attachments: attachments.map((item) => ({
      id: item.id,
      displayFilename: item.displayFilename,
      contentType: item.contentType,
      byteSize: item.byteSize,
      downloadPath: item.downloadPath,
    })),
  };
}

export type PublicWorkSubmission = ReturnType<typeof toPublicSubmission>;

async function attachmentsForSubmissions(
  attachments: AttachmentStore | undefined,
  rows: WorkSubmissionWithLinks[]
): Promise<Map<string, PublicAttachment[]>> {
  const map = new Map<string, PublicAttachment[]>();
  if (!attachments || rows.length === 0) return map;
  const bound = await attachments.listForSubmissions(rows.map((row) => row.id));
  for (const item of bound) {
    const list = map.get(item.submissionId) ?? [];
    list.push(toPublicAttachment(item.attachment));
    map.set(item.submissionId, list);
  }
  return map;
}

export async function listWorkSubmissions(
  store: SubmissionStore,
  input: { contractAddress: string },
  attachments?: AttachmentStore
): Promise<{ submissions: PublicWorkSubmission[] }> {
  let contractAddress: string;
  try {
    contractAddress = parseContractAddress(input.contractAddress);
  } catch (err) {
    if (err instanceof MessageValidationError) {
      throw new SubmissionValidationError(err.message);
    }
    throw err;
  }
  const rows = await store.listByContract(contractAddress);
  const bySubmission = await attachmentsForSubmissions(attachments, rows);
  return {
    submissions: rows.map((row) =>
      toPublicSubmission(row, bySubmission.get(row.id) ?? [])
    ),
  };
}

function parseChainSubmittedAt(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw <= 0) {
      throw new SubmissionValidationError("chainSubmittedAt is invalid.");
    }
    return new Date(raw * 1000);
  }
  if (typeof raw === "string") {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new SubmissionValidationError("chainSubmittedAt is invalid.");
    }
    return date;
  }
  throw new SubmissionValidationError("chainSubmittedAt is invalid.");
}

export async function persistConfirmedWorkSubmission(
  stores: {
    submissions: SubmissionStore;
    rates: RateLimitStore;
    attachments?: AttachmentStore;
  },
  input: {
    contractAddress: string;
    sessionWallet: string;
    parties: ContractParties;
    body: Record<string, unknown>;
  }
): Promise<{ submission: PublicWorkSubmission; created: boolean }> {
  if (!isAuthorizedSubmissionWriter(input.sessionWallet, input.parties)) {
    throw new SubmissionAccessError("Only the freelancer can save delivery history.");
  }

  assertNoBannedSubmissionKeys(input.body);

  // Ignore any client-supplied freelancer/employer identity.
  const parsed = persistBodySchema.safeParse(input.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SubmissionValidationError(issue?.message ?? "Invalid submission payload.");
  }

  const delivery = validateDeliveryPayload({
    deliveryNote: parsed.data.deliveryNote,
    links: parsed.data.links,
  });
  if (!delivery.ok) {
    throw new SubmissionValidationError(delivery.error);
  }

  if (parsed.data.onChainSubmissionUri !== delivery.value.onChainSubmissionUri) {
    throw new SubmissionValidationError(
      "onChainSubmissionUri must match the primary HTTPS work link."
    );
  }

  const contractAddress = (() => {
    try {
      return parseContractAddress(input.contractAddress);
    } catch (err) {
      if (err instanceof MessageValidationError) {
        throw new SubmissionValidationError(err.message);
      }
      throw err;
    }
  })();

  let attachmentIds: string[] = [];
  try {
    attachmentIds = parseAttachmentIdList(
      parsed.data.attachmentIds ?? [],
      "work_submission"
    );
  } catch (err) {
    if (err instanceof AttachmentValidationError) {
      throw new SubmissionValidationError(err.message);
    }
    throw err;
  }

  if (attachmentIds.length > 0) {
    if (!stores.attachments) {
      throw new SubmissionValidationError("Attachments are unavailable.");
    }
    try {
      await assertPendingOwnedAttachments(stores.attachments, {
        ids: attachmentIds,
        contractAddress,
        uploaderWallet: input.sessionWallet,
        context: "work_submission",
      });
    } catch (err) {
      // Idempotent retry: attachments may already be bound to an existing submission.
      const existingEarly = await stores.submissions.getByTransactionSignature(
        parsed.data.transactionSignature
      );
      if (!existingEarly) {
        if (err instanceof AttachmentValidationError) {
          throw new SubmissionValidationError(err.message);
        }
        if (err instanceof AttachmentAccessError) {
          throw new SubmissionAccessError(err.message);
        }
        throw err;
      }
    }
  }

  await consumeRateLimit(
    stores.rates,
    sendBucket(input.sessionWallet, contractAddress),
    RATE_LIMITS.sendMax,
    RATE_LIMITS.sendWindowMs
  );

  const existing = await stores.submissions.getByTransactionSignature(
    parsed.data.transactionSignature
  );
  if (existing) {
    let attachments: PublicAttachment[] = [];
    if (stores.attachments) {
      if (attachmentIds.length > 0) {
        const pending = (
          await stores.attachments.listByIds(attachmentIds)
        ).filter((row) => row.status === "pending");
        if (pending.length > 0) {
          await stores.attachments.bindToSubmission(
            existing.id,
            pending.map((row) => row.id)
          );
        }
      }
      const bound = await stores.attachments.listForSubmissions([existing.id]);
      attachments = bound.map((item) => toPublicAttachment(item.attachment));
    }
    return { submission: toPublicSubmission(existing, attachments), created: false };
  }

  const now = new Date();
  const saved = await stores.submissions.insertSubmission(
    {
      id: randomId(),
      contractAddress,
      submissionKind: parsed.data.submissionKind as SubmissionKind,
      workUnitIndex: parsed.data.workUnitIndex,
      revisionNumber: parsed.data.revisionNumber,
      freelancerWallet: input.parties.freelancer,
      deliveryNote: delivery.value.deliveryNote,
      onChainSubmissionUri: delivery.value.onChainSubmissionUri,
      transactionSignature: parsed.data.transactionSignature,
      chainSubmittedAt: parseChainSubmittedAt(parsed.data.chainSubmittedAt),
      createdAt: now,
    },
    delivery.value.links.map((link) => ({
      url: link.url,
      label: link.label,
      position: link.position,
    }))
  );

  let attachments: PublicAttachment[] = [];
  if (attachmentIds.length > 0 && stores.attachments) {
    const bound = await stores.attachments.bindToSubmission(saved.id, attachmentIds);
    attachments = bound.map((row) => toPublicAttachment(row));
  }

  return { submission: toPublicSubmission(saved, attachments), created: true };
}
