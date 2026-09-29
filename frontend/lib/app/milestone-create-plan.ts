/**
 * Resumable Create & Send Offer.
 *
 * Creating a Milestone offer takes several wallet transactions:
 * `create_contract` → `add_milestone` × N → `finalize_terms`. Any of them can
 * fail or end with an unknown confirmation. This module keeps that sequence
 * safe to retry:
 *
 * - one stable `contractId` per creation attempt (persisted intent), so a retry
 *   targets the same contract PDA instead of funding a second contract;
 * - once a create may have been sent, the saved terms are immutable: an edited
 *   draft never silently replaces them;
 * - a pure planner that verifies every readable on-chain term against the
 *   saved intent and returns the single next safe step;
 * - a small orchestrator (observe → plan → execute one step → repeat) with
 *   injected side effects, so the sequence is unit-testable with fakes.
 *
 * No React, storage, or RPC side effects live here; callers inject them.
 * The on-chain program remains the security authority.
 */
import { PublicKey } from "@solana/web3.js";

import type { TxPhase } from "@/lib/app/tx-state";
import type {
  ContractStatus,
  ContractType,
  CreateContractRequest,
  CreateHourlyContractRequest,
  PaymentModeName,
  StartMode,
  WorkUnitKind,
} from "@/lib/streampay-v2/types";

export const CREATE_INTENT_VERSION = 2 as const;
export const CREATE_INTENT_STORAGE_PREFIX = "premiflow:create-intent:v2:";

/** Program limits mirrored for saved-data validation (programs/streampay v2 constants). */
const MAX_MILESTONES = 64;
const MAX_METADATA_URI_BYTES = 200;
const U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);
const PAYMENT_MODES: readonly PaymentModeName[] = ["Streaming", "Milestone", "Fixed", "Hourly"];
const CONTRACT_TYPES: readonly ContractType[] = ["Streaming", "Milestone", "Fixed"];
const START_MODES: readonly StartMode[] = ["OnActivation", "Scheduled"];

/** Which deployment a saved intent belongs to. */
export type IntentScope = { cluster: string; programId: string };

export type DeriveContractAddress = (
  employer: string,
  freelancer: string,
  contractId: bigint
) => string;

/** One milestone as it will be written on-chain (base units). */
export type IntentMilestone = {
  /** Base units, decimal string (bigint-safe JSON). */
  amount: string;
  dueOffsetSeconds: number;
};

/** Serializable `create_contract` request (Fixed / Milestone / Streaming). */
export type StandardCreateIntentRequest = {
  kind: "standard";
  paymentMode: ContractType;
  startMode: StartMode;
  totalAmount: string;
  acceptanceDeadline: number;
  scheduledStartTime: number;
  durationSeconds: number;
  checkpointInterval: number;
  reviewDuration: number;
  activationReviewDuration: number;
  maxRevisions: number;
  trialAmount: string;
  resolver: string;
  metadataUri: string;
  metadataHashHex: string;
};

/** Serializable `create_hourly_contract` request. */
export type HourlyCreateIntentRequest = {
  kind: "hourly";
  hourlyRate: string;
  authorizedSeconds: string;
  acceptanceDeadline: number;
  durationSeconds: number;
  reviewDuration: number;
  activationReviewDuration: number;
  maxRevisions: number;
  trialAmount: string;
  resolver: string;
  metadataUri: string;
  metadataHashHex: string;
};

export type CreateIntentRequest =
  | StandardCreateIntentRequest
  | HourlyCreateIntentRequest;

/** Everything the wizard wants on-chain, independent of the contract ID. */
export type CreateIntentTerms = {
  employer: string;
  freelancer: string;
  tokenMint: string;
  paymentMode: PaymentModeName;
  /** Expected on-chain `total_amount`; null when the program derives it (Hourly). */
  totalAmount: string | null;
  trialAmount: string;
  /** Milestone list in order (empty for non-Milestone modes). */
  milestones: IntentMilestone[];
  request: CreateIntentRequest;
};

/** A persisted creation attempt. */
export type CreateIntent = CreateIntentTerms & {
  version: typeof CREATE_INTENT_VERSION;
  cluster: string;
  programId: string;
  /** u64 as a decimal string. Stable for the whole attempt. */
  contractId: string;
  /** Contract PDA derived from employer + freelancer + contractId. */
  contractAddress: string;
  /** True once a create transaction may have been sent with this ID. From then on the terms are immutable. */
  createAttempted: boolean;
  /** ms epoch of the latest create send activity (before the wallet prompt and when it settled). 0 = never. */
  createActivityAt: number;
  /** Recomputed from the terms; never trusted from storage. */
  fingerprint: string;
  updatedAt: number;
};

function canonicalRequest(r: CreateIntentRequest): unknown[] {
  return r.kind === "hourly"
    ? [
        "hourly",
        r.hourlyRate,
        r.authorizedSeconds,
        r.acceptanceDeadline,
        r.durationSeconds,
        r.reviewDuration,
        r.activationReviewDuration,
        r.maxRevisions,
        r.trialAmount,
        r.resolver,
        r.metadataUri,
        r.metadataHashHex.toLowerCase(),
      ]
    : [
        "standard",
        r.paymentMode,
        r.startMode,
        r.totalAmount,
        r.acceptanceDeadline,
        r.scheduledStartTime,
        r.durationSeconds,
        r.checkpointInterval,
        r.reviewDuration,
        r.activationReviewDuration,
        r.maxRevisions,
        r.trialAmount,
        r.resolver,
        r.metadataUri,
        r.metadataHashHex.toLowerCase(),
      ];
}

/** Stable, order-preserving fingerprint of every material term. */
export function createIntentFingerprint(terms: CreateIntentTerms): string {
  return JSON.stringify([
    terms.employer,
    terms.freelancer,
    terms.tokenMint,
    terms.paymentMode,
    terms.totalAmount,
    terms.trialAmount,
    terms.milestones.map((m) => [m.amount, m.dueOffsetSeconds]),
    canonicalRequest(terms.request),
  ]);
}

export type EnsureCreateIntentResult =
  | { kind: "ready"; intent: CreateIntent; reused: boolean }
  | {
      kind: "conflict";
      reason: "earlier_attempt_differs" | "draft_edited_after_attempt";
      message: string;
      /** The saved attempt, unchanged. Resume continues it with its original terms. */
      saved: CreateIntent;
    };

/**
 * Returns the intent to use for this submit.
 *
 * - No saved attempt for this employer and deployment → new intent, fresh ID.
 * - Saved attempt before any create was sent → reuse its ID, adopt the draft.
 * - Saved attempt that may already have sent a create → its terms are
 *   immutable. An identical draft continues it; any material edit is a
 *   conflict (Resume with the original terms, or Discard when safe).
 */
export function ensureCreateIntent(params: {
  terms: CreateIntentTerms;
  saved: CreateIntent | null;
  scope: IntentScope;
  newContractId: () => bigint;
  deriveAddress: DeriveContractAddress;
  now: number;
}): EnsureCreateIntentResult {
  const { terms, saved, scope, now } = params;
  const fingerprint = createIntentFingerprint(terms);
  const usable =
    saved != null &&
    saved.version === CREATE_INTENT_VERSION &&
    saved.employer === terms.employer &&
    saved.cluster === scope.cluster &&
    saved.programId === scope.programId;

  if (!usable) {
    const contractId = params.newContractId();
    return {
      kind: "ready",
      reused: false,
      intent: {
        ...terms,
        version: CREATE_INTENT_VERSION,
        cluster: scope.cluster,
        programId: scope.programId,
        contractId: contractId.toString(),
        contractAddress: params.deriveAddress(terms.employer, terms.freelancer, contractId),
        createAttempted: false,
        createActivityAt: 0,
        fingerprint,
        updatedAt: now,
      },
    };
  }

  if (saved.createAttempted) {
    const original = { ...saved, fingerprint: createIntentFingerprint(saved) };
    if (
      saved.freelancer !== terms.freelancer ||
      saved.tokenMint !== terms.tokenMint ||
      saved.paymentMode !== terms.paymentMode
    ) {
      return {
        kind: "conflict",
        reason: "earlier_attempt_differs",
        message:
          "An earlier Create & Send Offer for a different freelancer or contract type has not finished. Resume it with its original terms, or discard it (once that is safe) to start this one.",
        saved: original,
      };
    }
    if (original.fingerprint !== fingerprint) {
      return {
        kind: "conflict",
        reason: "draft_edited_after_attempt",
        message:
          "Your draft was edited after Create & Send Offer was already attempted, so the edits were not used. Resume setup continues with the original terms; discard the setup (once that is safe) to start over with the edited draft.",
        saved: original,
      };
    }
    return { kind: "ready", reused: true, intent: original };
  }

  const contractId = BigInt(saved.contractId);
  return {
    kind: "ready",
    reused: true,
    intent: {
      ...terms,
      version: CREATE_INTENT_VERSION,
      cluster: scope.cluster,
      programId: scope.programId,
      contractId: saved.contractId,
      contractAddress: params.deriveAddress(terms.employer, terms.freelancer, contractId),
      createAttempted: false,
      createActivityAt: 0,
      fingerprint,
      updatedAt: now,
    },
  };
}

/** Lock the attempt right before a create may be sent. */
export function markCreateAttempted(intent: CreateIntent, nowMs: number): CreateIntent {
  return {
    ...intent,
    createAttempted: true,
    createActivityAt: Math.max(intent.createActivityAt, nowMs),
    updatedAt: nowMs,
  };
}

/** Record that a create send settled (success, failure or unknown). */
export function touchCreateActivity(intent: CreateIntent, nowMs: number): CreateIntent {
  return {
    ...intent,
    createActivityAt: Math.max(intent.createActivityAt, nowMs),
    updatedAt: nowMs,
  };
}

// ---------------------------------------------------------------------------
// Request codec (intent JSON ↔ client request)
// ---------------------------------------------------------------------------

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error("invalid hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** `create_contract` request for the intent's stable contract ID. */
export function toCreateContractRequest(intent: CreateIntent): CreateContractRequest {
  const r = intent.request;
  if (r.kind !== "standard") {
    throw new Error("Saved setup is not a Fixed, Milestone, or Streaming contract.");
  }
  return {
    contractId: BigInt(intent.contractId),
    paymentMode: r.paymentMode,
    startMode: r.startMode,
    totalAmount: BigInt(r.totalAmount),
    acceptanceDeadline: r.acceptanceDeadline,
    scheduledStartTime: r.scheduledStartTime,
    durationSeconds: r.durationSeconds,
    checkpointInterval: r.checkpointInterval,
    reviewDuration: r.reviewDuration,
    activationReviewDuration: r.activationReviewDuration,
    maxRevisions: r.maxRevisions,
    trialAmount: BigInt(r.trialAmount),
    resolver: new PublicKey(r.resolver),
    metadataUri: r.metadataUri,
    metadataHash: hexToBytes(r.metadataHashHex),
  };
}

/** `create_hourly_contract` request for the intent's stable contract ID. */
export function toCreateHourlyContractRequest(
  intent: CreateIntent
): CreateHourlyContractRequest {
  const r = intent.request;
  if (r.kind !== "hourly") {
    throw new Error("Saved setup is not an Hourly contract.");
  }
  return {
    contractId: BigInt(intent.contractId),
    hourlyRate: BigInt(r.hourlyRate),
    authorizedSeconds: BigInt(r.authorizedSeconds),
    acceptanceDeadline: r.acceptanceDeadline,
    durationSeconds: r.durationSeconds,
    reviewDuration: r.reviewDuration,
    activationReviewDuration: r.activationReviewDuration,
    maxRevisions: r.maxRevisions,
    trialAmount: BigInt(r.trialAmount),
    resolver: new PublicKey(r.resolver),
    metadataUri: r.metadataUri,
    metadataHash: hexToBytes(r.metadataHashHex),
  };
}

// ---------------------------------------------------------------------------
// Persistence (storage injected; pure JSON, fully validated on load)
// ---------------------------------------------------------------------------

export type IntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createIntentStorageKey(scope: IntentScope, employer: string): string {
  return `${CREATE_INTENT_STORAGE_PREFIX}${scope.cluster}:${scope.programId}:${employer}`;
}

export const CORRUPT_INTENT_MESSAGE =
  "Saved setup data in this browser is unreadable, so it was not used and nothing was sent. Check your contracts list for a contract from an earlier attempt, then discard the saved setup to continue.";

export type LoadIntentResult =
  | { kind: "none" }
  | { kind: "ready"; intent: CreateIntent }
  | { kind: "corrupt"; message: string };

class IntentValidationError extends Error {
  constructor(field: string) {
    super(`invalid saved setup field: ${field}`);
    this.name = "IntentValidationError";
  }
}

function fail(field: string): never {
  throw new IntentValidationError(field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reqString(o: Record<string, unknown>, key: string): string {
  const value = o[key];
  if (typeof value !== "string") fail(key);
  return value;
}

function reqPubkey(o: Record<string, unknown>, key: string): string {
  const value = reqString(o, key);
  let parsed: PublicKey;
  try {
    parsed = new PublicKey(value);
  } catch {
    return fail(key);
  }
  if (parsed.toBase58() !== value) fail(key);
  return value;
}

function reqU64(
  o: Record<string, unknown>,
  key: string,
  opts: { positive?: boolean } = {}
): string {
  const value = reqString(o, key);
  if (!/^(0|[1-9][0-9]*)$/.test(value)) fail(key);
  const n = BigInt(value);
  if (n > U64_MAX || (opts.positive && n === BigInt(0))) fail(key);
  return value;
}

function reqInt(o: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = o[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(key);
  }
  return value;
}

function reqEnum<T extends string>(
  o: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): T {
  const value = o[key];
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) fail(key);
  return value as T;
}

function parseRequest(
  r: Record<string, unknown>,
  paymentMode: PaymentModeName
): CreateIntentRequest {
  const common = {
    acceptanceDeadline: reqInt(r, "acceptanceDeadline", 1, Number.MAX_SAFE_INTEGER),
    durationSeconds: reqInt(r, "durationSeconds", 0, Number.MAX_SAFE_INTEGER),
    reviewDuration: reqInt(r, "reviewDuration", 0, Number.MAX_SAFE_INTEGER),
    activationReviewDuration: reqInt(r, "activationReviewDuration", 0, Number.MAX_SAFE_INTEGER),
    maxRevisions: reqInt(r, "maxRevisions", 0, 255),
    trialAmount: reqU64(r, "trialAmount"),
    resolver: reqPubkey(r, "resolver"),
    metadataUri: reqString(r, "metadataUri"),
    metadataHashHex: reqString(r, "metadataHashHex"),
  };
  const uriBytes = new TextEncoder().encode(common.metadataUri).length;
  if (uriBytes === 0 || uriBytes > MAX_METADATA_URI_BYTES) fail("metadataUri");
  if (!/^[0-9a-f]{64}$/.test(common.metadataHashHex)) fail("metadataHashHex");

  if (paymentMode === "Hourly") {
    if (r.kind !== "hourly") fail("request.kind");
    return {
      kind: "hourly",
      hourlyRate: reqU64(r, "hourlyRate", { positive: true }),
      authorizedSeconds: reqU64(r, "authorizedSeconds", { positive: true }),
      ...common,
    };
  }
  if (r.kind !== "standard") fail("request.kind");
  const requestMode = reqEnum(r, "paymentMode", CONTRACT_TYPES);
  if (requestMode !== paymentMode) fail("request.paymentMode");
  return {
    kind: "standard",
    paymentMode: requestMode,
    startMode: reqEnum(r, "startMode", START_MODES),
    totalAmount: reqU64(r, "totalAmount", { positive: true }),
    scheduledStartTime: reqInt(r, "scheduledStartTime", 0, Number.MAX_SAFE_INTEGER),
    checkpointInterval: reqInt(r, "checkpointInterval", 0, Number.MAX_SAFE_INTEGER),
    ...common,
  };
}

/**
 * Strict validation of stored data. Throws on anything unexpected; the caller
 * turns that into a controlled "corrupt" result.
 */
export function parseCreateIntent(
  value: unknown,
  expected: { employer: string; scope: IntentScope; deriveAddress: DeriveContractAddress }
): CreateIntent {
  if (!isRecord(value)) fail("intent");
  if (value.version !== CREATE_INTENT_VERSION) fail("version");
  const employer = reqPubkey(value, "employer");
  if (employer !== expected.employer) fail("employer");
  const cluster = reqString(value, "cluster");
  const programId = reqString(value, "programId");
  if (cluster !== expected.scope.cluster || programId !== expected.scope.programId) {
    fail("scope");
  }
  const freelancer = reqPubkey(value, "freelancer");
  const tokenMint = reqPubkey(value, "tokenMint");
  const paymentMode = reqEnum(value, "paymentMode", PAYMENT_MODES);
  const trialAmount = reqU64(value, "trialAmount");
  const contractId = reqU64(value, "contractId");
  const contractAddress = reqPubkey(value, "contractAddress");
  if (expected.deriveAddress(employer, freelancer, BigInt(contractId)) !== contractAddress) {
    fail("contractAddress");
  }
  const createAttempted = value.createAttempted;
  if (typeof createAttempted !== "boolean") fail("createAttempted");
  const createActivityAt = reqInt(value, "createActivityAt", 0, Number.MAX_SAFE_INTEGER);
  const updatedAt = reqInt(value, "updatedAt", 0, Number.MAX_SAFE_INTEGER);

  const rawRequest = value.request;
  if (!isRecord(rawRequest)) fail("request");
  const request = parseRequest(rawRequest, paymentMode);
  if (request.trialAmount !== trialAmount) fail("trialAmount");

  let totalAmount: string | null;
  if (request.kind === "standard") {
    totalAmount = reqU64(value, "totalAmount", { positive: true });
    if (totalAmount !== request.totalAmount) fail("totalAmount");
  } else {
    if (value.totalAmount !== null) fail("totalAmount");
    totalAmount = null;
  }

  const rawMilestones: unknown = value.milestones;
  if (!Array.isArray(rawMilestones)) fail("milestones");
  const milestones: IntentMilestone[] = rawMilestones.map((entry: unknown, i: number) => {
    if (!isRecord(entry)) fail(`milestones[${i}]`);
    return {
      amount: reqU64(entry, "amount", { positive: true }),
      dueOffsetSeconds: reqInt(entry, "dueOffsetSeconds", 1, Number.MAX_SAFE_INTEGER),
    };
  });
  if (paymentMode === "Milestone") {
    if (milestones.length === 0 || milestones.length > MAX_MILESTONES) fail("milestones");
  } else if (milestones.length !== 0) {
    fail("milestones");
  }

  const terms: CreateIntentTerms = {
    employer,
    freelancer,
    tokenMint,
    paymentMode,
    totalAmount,
    trialAmount,
    milestones,
    request,
  };
  return {
    ...terms,
    version: CREATE_INTENT_VERSION,
    cluster,
    programId,
    contractId,
    contractAddress,
    createAttempted,
    createActivityAt,
    fingerprint: createIntentFingerprint(terms),
    updatedAt,
  };
}

/** Never throws: missing → none, anything unreadable → corrupt. */
export function loadCreateIntent(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string,
  deriveAddress: DeriveContractAddress
): LoadIntentResult {
  if (!storage) return { kind: "none" };
  let raw: string | null;
  try {
    raw = storage.getItem(createIntentStorageKey(scope, employer));
  } catch {
    return { kind: "none" };
  }
  if (raw == null || raw === "") return { kind: "none" };
  try {
    return {
      kind: "ready",
      intent: parseCreateIntent(JSON.parse(raw), { employer, scope, deriveAddress }),
    };
  } catch {
    return { kind: "corrupt", message: CORRUPT_INTENT_MESSAGE };
  }
}

/** Throws when the intent cannot be persisted — callers must not send in that case. */
export function saveCreateIntent(storage: IntentStorage | null, intent: CreateIntent): void {
  if (!storage) {
    throw new Error("Browser storage is unavailable, so setup progress cannot be saved. Nothing was sent.");
  }
  storage.setItem(
    createIntentStorageKey({ cluster: intent.cluster, programId: intent.programId }, intent.employer),
    JSON.stringify(intent)
  );
}

export function clearCreateIntent(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string
): void {
  if (!storage) return;
  storage.removeItem(createIntentStorageKey(scope, employer));
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

type KeyLike = { toBase58(): string };

/** The contract fields the planner verifies (a subset of `ContractView`). */
export type ObservedContract = {
  employer: KeyLike;
  freelancer: KeyLike;
  tokenMint: KeyLike;
  contractId: bigint;
  paymentMode: PaymentModeName;
  status: ContractStatus;
  startMode: StartMode;
  totalAmount: bigint;
  trialAmount: bigint;
  workUnitCount: number;
  acceptanceDeadline: number;
  scheduledStartTime: number;
  durationSeconds: number;
  checkpointInterval: number;
  reviewDuration: number;
  activationReviewDuration: number;
  maxRevisions: number;
  resolver: KeyLike;
  metadataUri: string;
  metadataHash: Uint8Array;
};

/** The hourly terms the planner verifies (a subset of `HourlyStateView`). */
export type ObservedHourlyState = {
  contract: KeyLike;
  hourlyRate: bigint;
  authorizedSeconds: bigint;
};

/** The work-unit fields the planner compares (a subset of `WorkUnitView`). */
export type ObservedWorkUnit = {
  index: number;
  kind: WorkUnitKind;
  amount: bigint;
  dueOffsetSeconds: number;
};

export type ObservedCreateState = {
  /** null only when the account does not exist. RPC errors must throw instead. */
  contract: ObservedContract | null;
  /** Work units at indices 0..workUnitCount-1; null where the account was absent. */
  workUnits: Array<ObservedWorkUnit | null>;
  /** Hourly contracts only; null/undefined when it was absent or not read. */
  hourly?: ObservedHourlyState | null;
};

export type CreateConflictReason =
  | "terms_mismatch"
  | "terms_unverified"
  | "extra_milestones"
  | "milestone_mismatch"
  | "milestone_unreadable"
  | "not_draft"
  | "not_live"
  | "acceptance_expired";

/** Conflicts caused by an incomplete read; a later re-check may clear them. */
export function isRetryableConflict(reason: CreateConflictReason): boolean {
  return reason === "terms_unverified" || reason === "milestone_unreadable";
}

/** States in which the offer has been sent (or has progressed normally past it). */
export const OFFER_SENT_STATUSES: readonly ContractStatus[] = [
  "PendingAcceptance",
  "PendingEmployerApproval",
  "Active",
  "Completed",
];

export function isOfferSentStatus(status: ContractStatus): boolean {
  return OFFER_SENT_STATUSES.includes(status);
}

export type CreateStep =
  | { kind: "create" }
  | {
      kind: "addMilestone";
      index: number;
      amount: bigint;
      dueOffsetSeconds: number;
    }
  | { kind: "finalize" }
  | { kind: "complete" }
  | { kind: "conflict"; reason: CreateConflictReason; message: string };

export type CreateProgress = {
  contractExists: boolean;
  contractAddress: string;
  status: ContractStatus | null;
  milestonesDone: number;
  milestonesTotal: number;
};

export type CreatePlan = { step: CreateStep; progress: CreateProgress };

function conflict(
  reason: CreateConflictReason,
  message: string
): Extract<CreateStep, { kind: "conflict" }> {
  return { kind: "conflict", reason, message };
}

type TermsCheck = { ok: true } | { ok: false; unverified: boolean; field: string };

/** Every material term readable on-chain, in the program's stored representation. */
function checkTerms(
  intent: CreateIntent,
  contract: ObservedContract,
  hourly: ObservedHourlyState | null
): TermsCheck {
  const r = intent.request;
  const checks: Array<[string, boolean]> = [
    ["employer", contract.employer.toBase58() === intent.employer],
    ["freelancer", contract.freelancer.toBase58() === intent.freelancer],
    ["token", contract.tokenMint.toBase58() === intent.tokenMint],
    ["contract ID", contract.contractId === BigInt(intent.contractId)],
    ["contract type", contract.paymentMode === intent.paymentMode],
    ["trial amount", contract.trialAmount === BigInt(intent.trialAmount)],
    ["acceptance deadline", contract.acceptanceDeadline === r.acceptanceDeadline],
    ["duration", contract.durationSeconds === r.durationSeconds],
    ["review window", contract.reviewDuration === r.reviewDuration],
    ["activation review window", contract.activationReviewDuration === r.activationReviewDuration],
    ["revision limit", contract.maxRevisions === r.maxRevisions],
    ["resolver", contract.resolver.toBase58() === r.resolver],
    ["metadata URI", contract.metadataUri === r.metadataUri],
    ["metadata hash", bytesToHex(contract.metadataHash) === r.metadataHashHex.toLowerCase()],
  ];
  if (r.kind === "standard") {
    // create_contract stores scheduled_start_time = 0 for OnActivation and
    // checkpoint_interval = 0 for non-Streaming contracts.
    checks.push(
      ["total amount", contract.totalAmount === BigInt(r.totalAmount)],
      ["start mode", contract.startMode === r.startMode],
      [
        "scheduled start",
        contract.scheduledStartTime === (r.startMode === "Scheduled" ? r.scheduledStartTime : 0),
      ],
      [
        "checkpoint interval",
        contract.checkpointInterval === (r.paymentMode === "Streaming" ? r.checkpointInterval : 0),
      ]
    );
  } else {
    // create_hourly_contract always stores OnActivation, no schedule, no checkpoints.
    // total_amount is derived from rate × authorized time + trial, verified via hourly state.
    checks.push(
      ["start mode", contract.startMode === "OnActivation"],
      ["scheduled start", contract.scheduledStartTime === 0],
      ["checkpoint interval", contract.checkpointInterval === 0]
    );
  }
  const bad = checks.find(([, ok]) => !ok);
  if (bad) return { ok: false, unverified: false, field: bad[0] };

  if (r.kind === "hourly") {
    if (!hourly) return { ok: false, unverified: true, field: "hourly rate and authorized time" };
    if (hourly.contract.toBase58() !== intent.contractAddress) {
      return { ok: false, unverified: false, field: "hourly terms account" };
    }
    if (hourly.hourlyRate !== BigInt(r.hourlyRate)) {
      return { ok: false, unverified: false, field: "hourly rate" };
    }
    if (hourly.authorizedSeconds !== BigInt(r.authorizedSeconds)) {
      return { ok: false, unverified: false, field: "authorized time" };
    }
  }
  return { ok: true };
}

function notLive(status: ContractStatus): Extract<CreateStep, { kind: "conflict" }> {
  return conflict(
    "not_live",
    `The contract is ${status}, so this offer is not live and setup cannot finish. Nothing more was sent. Open the contract to review it.`
  );
}

/**
 * Pure: decides the single next safe step from the saved intent and what is
 * actually on-chain. Never trusts the milestone count alone, and never reports
 * completion for a contract whose terms or status it cannot verify.
 */
export function planNextCreateStep(
  intent: CreateIntent,
  observed: ObservedCreateState,
  now: number
): CreatePlan {
  const isMilestone = intent.paymentMode === "Milestone";
  const milestonesTotal = isMilestone ? intent.milestones.length : 0;
  const base: CreateProgress = {
    contractExists: false,
    contractAddress: intent.contractAddress,
    status: null,
    milestonesDone: 0,
    milestonesTotal,
  };

  const contract = observed.contract;
  if (!contract) {
    if (now >= intent.request.acceptanceDeadline) {
      return {
        step: conflict(
          "acceptance_expired",
          "The acceptance deadline in this setup has passed and no contract was created, so nothing was sent. Discard the setup to start over."
        ),
        progress: base,
      };
    }
    return { step: { kind: "create" }, progress: base };
  }

  const progress: CreateProgress = {
    ...base,
    contractExists: true,
    status: contract.status,
  };

  const terms = checkTerms(intent, contract, observed.hourly ?? null);
  if (!terms.ok) {
    return {
      step: terms.unverified
        ? conflict(
            "terms_unverified",
            `The contract exists, but its ${terms.field} could not be read to verify it. Nothing more was sent.`
          )
        : conflict(
            "terms_mismatch",
            `The contract already on-chain for this setup has a different ${terms.field} than the saved setup. Nothing more was sent.`
          ),
      progress,
    };
  }

  if (!isMilestone) {
    // Single-transaction modes: created directly as a live offer.
    if (!isOfferSentStatus(contract.status)) {
      return { step: notLive(contract.status), progress };
    }
    return { step: { kind: "complete" }, progress };
  }

  const onChain = contract.workUnitCount;
  if (onChain > milestonesTotal) {
    return {
      step: conflict(
        "extra_milestones",
        `The contract already has ${onChain} milestones on-chain but the saved setup has ${milestonesTotal}. Nothing more was sent.`
      ),
      progress,
    };
  }

  for (let i = 0; i < onChain; i += 1) {
    const unit = observed.workUnits[i] ?? null;
    if (!unit) {
      return {
        step: conflict(
          "milestone_unreadable",
          `Milestone ${i + 1} could not be read from the chain. Nothing more was sent.`
        ),
        progress: { ...progress, milestonesDone: i },
      };
    }
    const expected = intent.milestones[i];
    if (
      unit.index !== i ||
      unit.kind !== "Milestone" ||
      unit.amount !== BigInt(expected.amount) ||
      unit.dueOffsetSeconds !== expected.dueOffsetSeconds
    ) {
      return {
        step: conflict(
          "milestone_mismatch",
          `Milestone ${i + 1} on-chain does not match the saved setup. Nothing more was sent.`
        ),
        progress: { ...progress, milestonesDone: i },
      };
    }
  }

  const matched: CreateProgress = { ...progress, milestonesDone: onChain };

  if (contract.status !== "Draft") {
    if (!isOfferSentStatus(contract.status)) {
      return { step: notLive(contract.status), progress: matched };
    }
    if (onChain === milestonesTotal) {
      // Already finalized (offer sent) or beyond. Never finalize twice.
      return { step: { kind: "complete" }, progress: matched };
    }
    return {
      step: conflict(
        "not_draft",
        "The contract is no longer a draft, so the remaining milestones cannot be added."
      ),
      progress: matched,
    };
  }

  if (now >= contract.acceptanceDeadline) {
    return {
      step: conflict(
        "acceptance_expired",
        "The acceptance deadline has passed, so setup cannot continue. Open the contract to expire it and recover funds."
      ),
      progress: matched,
    };
  }

  if (onChain < milestonesTotal) {
    const next = intent.milestones[onChain];
    return {
      step: {
        kind: "addMilestone",
        index: onChain,
        amount: BigInt(next.amount),
        dueOffsetSeconds: next.dueOffsetSeconds,
      },
      progress: matched,
    };
  }

  return { step: { kind: "finalize" }, progress: matched };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export type SentStep = { signature: string };

export type CreateSetupDeps = {
  /** Fresh chain read. Must throw on RPC errors (never report "absent" for them). */
  observe: () => Promise<ObservedCreateState>;
  create: () => Promise<SentStep>;
  addMilestone: (step: {
    index: number;
    amount: bigint;
    dueOffsetSeconds: number;
  }) => Promise<SentStep>;
  finalize: () => Promise<SentStep>;
  now: () => number;
  /** Called after every settled observation with the reconciled plan. */
  onPlan?: (plan: CreatePlan) => void;
  /** Called right before a transaction step is sent. */
  onStep?: (step: CreateStep, progress: CreateProgress) => void;
  /** Wait between re-reads when the chain has not caught up yet. */
  sleep?: (ms: number) => Promise<void>;
  staleReadRetries?: number;
  staleReadDelayMs?: number;
};

export const PENDING_RECONCILIATION_MESSAGE =
  "The last step was confirmed, but the chain has not shown it yet, so setup is not finished. Wait a moment, then press Resume setup to verify it and continue.";

export type CreateSetupOutcome =
  | { kind: "complete"; progress: CreateProgress; lastSignature: string | null }
  | {
      kind: "conflict";
      reason: CreateConflictReason;
      message: string;
      progress: CreateProgress;
      lastSignature: string | null;
    }
  | {
      /** A confirmed send whose effect could not be verified yet (stale or failed read). */
      kind: "unverified";
      reason: "stale_read" | "read_failed";
      message: string;
      /** Last verified progress (before the unverified step). */
      progress: CreateProgress | null;
      lastSignature: string;
    };

/** True when `after` shows the chain moved forward from `before`. */
function progressAdvanced(before: CreateProgress, after: CreateProgress): boolean {
  if (!before.contractExists) return after.contractExists;
  if (!after.contractExists) return false;
  if (after.milestonesDone > before.milestonesDone) return true;
  return before.status === "Draft" && after.status !== null && after.status !== "Draft";
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * observe → plan → execute one step → repeat, until complete, conflict, or an
 * unverified (pending reconciliation) state. Chain state is re-read before
 * every send, so a step that landed despite an unknown confirmation is
 * detected instead of repeated. Send errors propagate unchanged; read errors
 * propagate only when nothing was sent in this run.
 */
export async function runCreateSetup(
  intent: CreateIntent,
  deps: CreateSetupDeps
): Promise<CreateSetupOutcome> {
  const sleep = deps.sleep ?? defaultSleep;
  const retries = deps.staleReadRetries ?? 3;
  const delay = deps.staleReadDelayMs ?? 1_500;
  // create + every milestone + finalize, plus slack.
  const maxSends = intent.milestones.length + 3;
  let sends = 0;
  let lastSignature: string | null = null;
  let sentFrom: CreateProgress | null = null;

  const unsettled = (plan: CreatePlan) =>
    sentFrom !== null &&
    (!progressAdvanced(sentFrom, plan.progress) ||
      (plan.step.kind === "conflict" && isRetryableConflict(plan.step.reason)));

  for (;;) {
    let plan: CreatePlan;
    try {
      plan = planNextCreateStep(intent, await deps.observe(), deps.now());
      let attempts = 0;
      while (unsettled(plan) && attempts < retries) {
        attempts += 1;
        await sleep(delay);
        plan = planNextCreateStep(intent, await deps.observe(), deps.now());
      }
    } catch (err) {
      if (lastSignature === null) throw err;
      return {
        kind: "unverified",
        reason: "read_failed",
        message: PENDING_RECONCILIATION_MESSAGE,
        progress: sentFrom,
        lastSignature,
      };
    }
    if (lastSignature !== null && unsettled(plan)) {
      return {
        kind: "unverified",
        reason: "stale_read",
        message: PENDING_RECONCILIATION_MESSAGE,
        progress: sentFrom,
        lastSignature,
      };
    }

    deps.onPlan?.(plan);
    const step = plan.step;
    if (step.kind === "complete") {
      return { kind: "complete", progress: plan.progress, lastSignature };
    }
    if (step.kind === "conflict") {
      return {
        kind: "conflict",
        reason: step.reason,
        message: step.message,
        progress: plan.progress,
        lastSignature,
      };
    }
    if (sends >= maxSends) {
      throw new Error("Create setup did not converge. Press Resume setup to re-check.");
    }

    deps.onStep?.(step, plan.progress);
    let sent: SentStep;
    if (step.kind === "create") {
      sent = await deps.create();
    } else if (step.kind === "addMilestone") {
      sent = await deps.addMilestone({
        index: step.index,
        amount: step.amount,
        dueOffsetSeconds: step.dueOffsetSeconds,
      });
    } else {
      sent = await deps.finalize();
    }
    sends += 1;
    sentFrom = plan.progress;
    lastSignature = sent.signature;
  }
}

// ---------------------------------------------------------------------------
// Concurrency + Discard guards (pure)
// ---------------------------------------------------------------------------

export type RunLock = {
  /** Synchronous: true when the caller now owns the lock. */
  tryAcquire(): boolean;
  release(): void;
  readonly held: boolean;
};

/** In-memory mutex for click handlers. Acquire before any await; release in finally. */
export function createRunLock(): RunLock {
  let held = false;
  return {
    tryAcquire() {
      if (held) return false;
      held = true;
      return true;
    },
    release() {
      held = false;
    },
    get held() {
      return held;
    },
  };
}

/**
 * A create transaction can land until its blockhash expires (~150 blocks,
 * roughly 60–90 s after it was fetched). The blockhash is fetched right after
 * `createActivityAt` is recorded, and the time is recorded again when the send
 * settles, so this window leaves a wide margin.
 */
export const CREATE_LANDING_WINDOW_MS = 180_000;

export type DiscardChainState = "absent" | "exists" | "unknown" | "not_checked";

export type DiscardDecision =
  | { allowed: true; contractExists: boolean }
  | { allowed: false; message: string };

/** Pure decision: may the saved intent be forgotten without risking a duplicate contract? */
export function decideDiscard(params: {
  intent: CreateIntent;
  txPhase: TxPhase;
  chain: DiscardChainState;
  nowMs: number;
}): DiscardDecision {
  const { intent, txPhase, chain, nowMs } = params;
  if (isCreateTxInFlight(txPhase)) {
    return {
      allowed: false,
      message: "A transaction is still in progress. Wait for it to finish before discarding the setup.",
    };
  }
  if (!intent.createAttempted) return { allowed: true, contractExists: false };
  if (chain === "exists") return { allowed: true, contractExists: true };
  if (chain !== "absent") {
    return {
      allowed: false,
      message:
        "Could not check the chain for this setup's contract, so the saved setup was kept. Try again in a moment.",
    };
  }
  const elapsed = nowMs - intent.createActivityAt;
  if (elapsed < CREATE_LANDING_WINDOW_MS) {
    const waitSeconds = Math.ceil((CREATE_LANDING_WINDOW_MS - Math.max(elapsed, 0)) / 1000);
    return {
      allowed: false,
      message: `A create transaction from this setup may still land, so the saved setup was kept to prevent a duplicate contract. Try Discard again in about ${waitSeconds} seconds, or press Resume setup.`,
    };
  }
  return { allowed: true, contractExists: false };
}

// ---------------------------------------------------------------------------
// UI helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Setup can be resumed whenever no transaction is actively in flight. An
 * unknown confirmation (`pending_confirmation`) is resumable: the caller must
 * `tx.reset()` and reconcile with the chain before sending anything.
 */
export function canResumeCreateSetup(phase: TxPhase): boolean {
  return (
    phase === "ready" ||
    phase === "success" ||
    phase === "failed" ||
    phase === "pending_confirmation"
  );
}

/** Phases that must be cleared with `tx.reset()` before a resume. */
export function needsTxResetBeforeResume(phase: TxPhase): boolean {
  return phase === "pending_confirmation" || phase === "failed";
}

/** A transaction is actively being prepared, signed, sent or confirmed. */
export function isCreateTxInFlight(phase: TxPhase): boolean {
  return (
    phase === "preparing" ||
    phase === "awaiting_wallet" ||
    phase === "submitting" ||
    phase === "confirming"
  );
}

/** Progress wording for the step about to be sent. */
export function createStepNote(
  step: CreateStep,
  progress: CreateProgress
): string | null {
  switch (step.kind) {
    case "create":
      return "Creating and funding contract…";
    case "addMilestone":
      return `Adding milestone ${step.index + 1} of ${progress.milestonesTotal}…`;
    case "finalize":
      return "Sending offer…";
    default:
      return null;
  }
}

/** Short status lines for an incomplete setup (verified chain state only). */
export function createProgressLines(progress: CreateProgress): string[] {
  const lines: string[] = [];
  if (!progress.contractExists) {
    lines.push("Contract not created yet");
    return lines;
  }
  lines.push("Contract created");
  if (progress.milestonesTotal > 0) {
    lines.push(
      `${progress.milestonesDone} of ${progress.milestonesTotal} milestones completed`
    );
  }
  if (progress.status && progress.status !== "Draft" && !isOfferSentStatus(progress.status)) {
    lines.push(`Contract status: ${progress.status}`);
  }
  return lines;
}

export const CREATE_SEND_OFFER_LABEL = "Create & Send Offer";
export const RESUME_SETUP_LABEL = "Resume setup";
export const OPEN_CONTRACT_LABEL = "Open contract";
export const SETUP_INCOMPLETE_LABEL = "Setup incomplete";
