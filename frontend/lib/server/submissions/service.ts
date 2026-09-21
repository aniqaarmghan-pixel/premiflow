import { z } from "zod";

import {
  validateDeliveryPayload,
  type SubmissionKind,
} from "@/lib/app/work-delivery";
import { MAX_URI_LEN } from "@/lib/streampay-v2/constants";
import { randomId } from "../crypto";
import { RATE_LIMITS, consumeRateLimit, sendBucket } from "../rate-limit";
import type {
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

function toPublicSubmission(row: WorkSubmissionWithLinks) {
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
  };
}

export type PublicWorkSubmission = ReturnType<typeof toPublicSubmission>;

export async function listWorkSubmissions(
  store: SubmissionStore,
  input: { contractAddress: string }
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
  return { submissions: rows.map(toPublicSubmission) };
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
  stores: { submissions: SubmissionStore; rates: RateLimitStore },
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
    return { submission: toPublicSubmission(existing), created: false };
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

  return { submission: toPublicSubmission(saved), created: true };
}
