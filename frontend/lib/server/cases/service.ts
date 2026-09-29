import { PublicKey } from "@solana/web3.js";

import {
  DISPUTE_CATEGORIES,
  type DisputeCategoryId,
} from "@/lib/app/resolution-center";
import type { ContractStatus } from "@/lib/streampay-v2";

import { randomId } from "../crypto";
import { RATE_LIMITS, consumeRateLimit } from "../rate-limit";
import type {
  CaseStore,
  DisputeOpener,
  OffchainWorkflowStatus,
  PartyStatementRecord,
  PartyStatementRole,
  RateLimitStore,
  ResolutionCaseRecord,
} from "../stores";
import { casePartyRoleFromChain, isAuthorizedCasePartyWallet } from "./authorize";
import {
  chainSupportsResolutionCase,
  displayedResolutionStatus,
  payoutStateFromChain,
  workflowFromStatements,
  type ChainPayoutState,
  type DisplayedResolutionStatus,
} from "./workflow";
import type {
  ContractCaseFacts,
  ContractFactsReader,
} from "../solana/read-contract-case-facts";

export const CASE_DESCRIPTION_MAX = 4_000;
export const PARTY_STATEMENT_MAX = 4_000;
export const CASE_SIGNATURE_MAX = 128;

export const CASE_EVENT_TYPES = {
  caseCreated: "case_created",
  caseRecovered: "case_recovered",
  categorySaved: "category_saved",
  statementCreated: "statement_created",
  statementUpdated: "statement_updated",
  chainReconciled: "chain_reconciled",
  evidenceAdded: "evidence_added",
  resolverViewed: "resolver_viewed",
  settlementSubmitted: "settlement_submitted",
  settlementConfirmed: "settlement_confirmed",
  settlementFailed: "settlement_failed",
} as const;

const CATEGORY_IDS = new Set(DISPUTE_CATEGORIES.map((item) => item.id));

export class CaseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaseValidationError";
  }
}

export class CaseAccessError extends Error {
  constructor(message = "Not a party on this contract.") {
    super(message);
    this.name = "CaseAccessError";
  }
}

export class CaseStateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CaseStateError";
    this.code = code;
  }
}

export type PublicPartyStatement = {
  id: string;
  partyRole: PartyStatementRole;
  partyWallet: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string;
};

export type PublicResolutionCase = {
  id: string;
  contractAddress: string;
  chainStatus: ContractStatus;
  workflowStatus: OffchainWorkflowStatus;
  display: DisplayedResolutionStatus;
  disputeOpener: DisputeOpener;
  disputeCategory: DisputeCategoryId | null;
  disputeDescription: string | null;
  resolverWallet: string;
  openedAt: string;
  resolvedAt: string | null;
  contestedAmount: string;
  contestedAmountSnapshot: string;
  paymentMode: ContractCaseFacts["paymentMode"];
  terminatedAt: number;
  freelancerSettlementAmount: string;
  employerRefundableAmount: string;
  releasedAmount: string;
  withdrawnAmount: string;
  refundedAmount: string;
  openSignature: string | null;
  resolveSignature: string | null;
  createdAt: string;
  updatedAt: string;
  employerStatement: PublicPartyStatement | null;
  freelancerStatement: PublicPartyStatement | null;
  viewerRole: PartyStatementRole | "resolver";
  payoutState: ChainPayoutState;
};

export function parseContractAddress(raw: string): string {
  try {
    return new PublicKey(raw).toBase58();
  } catch {
    throw new CaseValidationError("Contract address is invalid.");
  }
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new CaseValidationError(`${label} is invalid.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new CaseValidationError(`${label} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

function optionalCategory(value: unknown): DisputeCategoryId | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !CATEGORY_IDS.has(value as DisputeCategoryId)) {
    throw new CaseValidationError("Dispute category is invalid.");
  }
  return value as DisputeCategoryId;
}

function optionalSignature(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new CaseValidationError("Transaction signature is invalid.");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > CASE_SIGNATURE_MAX) {
    throw new CaseValidationError("Transaction signature is invalid.");
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
    throw new CaseValidationError("Transaction signature is invalid.");
  }
  return trimmed;
}

function requireParty(
  wallet: string,
  facts: ContractCaseFacts
): PartyStatementRole {
  const role = casePartyRoleFromChain(wallet, facts);
  if (role === "employer" || role === "freelancer") return role;
  throw new CaseAccessError();
}

function unixToDate(unix: number, fallback: Date): Date {
  if (!Number.isFinite(unix) || unix <= 0) return fallback;
  return new Date(unix * 1000);
}

function toPublicStatement(row: PartyStatementRecord): PublicPartyStatement {
  return {
    id: row.id,
    partyRole: row.partyRole,
    partyWallet: row.partyWallet,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    submittedAt: row.submittedAt.toISOString(),
  };
}

function statementsByRole(rows: PartyStatementRecord[]): {
  employerStatement: PublicPartyStatement | null;
  freelancerStatement: PublicPartyStatement | null;
} {
  return {
    employerStatement: rows.find((row) => row.partyRole === "employer")
      ? toPublicStatement(rows.find((row) => row.partyRole === "employer")!)
      : null,
    freelancerStatement: rows.find((row) => row.partyRole === "freelancer")
      ? toPublicStatement(rows.find((row) => row.partyRole === "freelancer")!)
      : null,
  };
}

function presentCase(
  row: ResolutionCaseRecord,
  facts: ContractCaseFacts,
  statements: PartyStatementRecord[],
  viewerRole: PartyStatementRole | "resolver"
): PublicResolutionCase {
  const payoutState = payoutStateFromChain(facts);
  const derivedWorkflow = workflowFromStatements(statements);
  const workflowStatus =
    row.workflowStatus === "under_review" || row.workflowStatus === "settlement_submitted"
      ? row.workflowStatus
      : derivedWorkflow;
  return {
    id: row.id,
    contractAddress: row.contractAddress,
    chainStatus: facts.status,
    workflowStatus,
    display: displayedResolutionStatus(facts.status, workflowStatus, payoutState),
    disputeOpener: facts.disputeInitiator === "None" ? row.disputeOpener : facts.disputeInitiator,
    disputeCategory: (row.disputeCategory as DisputeCategoryId | null) ?? null,
    disputeDescription: row.disputeDescription,
    resolverWallet: facts.resolver,
    openedAt: row.openedAt.toISOString(),
    resolvedAt:
      facts.status === "Resolved"
        ? (row.resolvedAt ?? unixToDate(facts.terminatedAt, new Date())).toISOString()
        : null,
    contestedAmount: facts.contestedAmount,
    contestedAmountSnapshot: row.contestedAmountSnapshot,
    paymentMode: facts.paymentMode,
    terminatedAt: facts.terminatedAt,
    freelancerSettlementAmount: facts.freelancerSettlementAmount,
    employerRefundableAmount: facts.employerRefundableAmount,
    releasedAmount: facts.releasedAmount,
    withdrawnAmount: facts.withdrawnAmount,
    refundedAmount: facts.refundedAmount,
    openSignature: row.openSignature,
    resolveSignature: row.resolveSignature,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...statementsByRole(statements),
    viewerRole,
    payoutState,
  };
}

function safeChainPatch(
  existing: ResolutionCaseRecord,
  facts: ContractCaseFacts,
  now: Date
): Partial<ResolutionCaseRecord> {
  const patch: Partial<ResolutionCaseRecord> = { updatedAt: now };
  if (existing.resolverWallet !== facts.resolver) {
    patch.resolverWallet = facts.resolver;
  }
  if (facts.disputeInitiator !== "None" && existing.disputeOpener !== facts.disputeInitiator) {
    patch.disputeOpener = facts.disputeInitiator;
  }
  if (existing.contestedAmountSnapshot !== facts.contestedAmount) {
    patch.contestedAmountSnapshot = facts.contestedAmount;
  }
  const openedAt = unixToDate(facts.disputedAt, existing.openedAt);
  if (openedAt.getTime() !== existing.openedAt.getTime() && facts.disputedAt > 0) {
    patch.openedAt = openedAt;
  }
  if (facts.status === "Resolved") {
    patch.resolvedAt = existing.resolvedAt ?? unixToDate(facts.terminatedAt, now);
  } else {
    patch.resolvedAt = null;
  }
  return patch;
}

async function recordEvent(
  store: CaseStore,
  input: {
    caseId: string;
    eventType: string;
    actorWallet: string | null;
    payload?: Record<string, unknown> | null;
    now: Date;
  }
): Promise<void> {
  await store.insertEvent({
    id: randomId(),
    caseId: input.caseId,
    eventType: input.eventType,
    actorWallet: input.actorWallet,
    payload: input.payload ? JSON.stringify(input.payload) : null,
    createdAt: input.now,
  });
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "23505";
}

export async function createOrRecoverResolutionCase(
  stores: { cases: CaseStore; rates?: RateLimitStore },
  reader: ContractFactsReader,
  input: {
    contractAddress: string;
    sessionWallet: string;
    category?: unknown;
    description?: unknown;
    openSignature?: unknown;
    wallet?: unknown;
    partyRole?: unknown;
    resolverWallet?: unknown;
    contestedAmount?: unknown;
    disputeOpener?: unknown;
    freelancerContestedAward?: unknown;
  },
  now = new Date()
): Promise<PublicResolutionCase> {
  const contractAddress = parseContractAddress(input.contractAddress);
  void input.wallet;
  void input.partyRole;
  void input.resolverWallet;
  void input.contestedAmount;
  void input.disputeOpener;
  void input.freelancerContestedAward;
  if (stores.rates) {
    await consumeRateLimit(
      stores.rates,
      `case:${input.sessionWallet}:${contractAddress}`,
      RATE_LIMITS.sendMax,
      RATE_LIMITS.sendWindowMs,
      now
    );
  }
  const facts = await reader.read(contractAddress);
  const viewerRole = requireParty(input.sessionWallet, facts);
  if (!chainSupportsResolutionCase(facts.status)) {
    throw new CaseStateError(
      "not_disputed",
      "A Resolution Case can be created only for a Disputed or Resolved contract."
    );
  }
  if (facts.disputeInitiator !== "Employer" && facts.disputeInitiator !== "Freelancer") {
    throw new CaseStateError(
      "missing_initiator",
      "On-chain dispute initiator is required to recover this case."
    );
  }
  const category = optionalCategory(input.category);
  const description = optionalText(input.description, "Description", CASE_DESCRIPTION_MAX);
  const openSignature = optionalSignature(input.openSignature);

  const existing = await stores.cases.getCaseByContract(contractAddress);
  if (existing) {
    return recoverExisting(stores.cases, existing, facts, viewerRole, input.sessionWallet, now);
  }

  const row: ResolutionCaseRecord = {
    id: randomId(),
    contractAddress,
    disputeOpener: facts.disputeInitiator,
    disputeCategory: category,
    disputeDescription: description,
    resolverWallet: facts.resolver,
    workflowStatus: "awaiting_statements",
    openedAt: unixToDate(facts.disputedAt, now),
    resolvedAt: facts.status === "Resolved" ? unixToDate(facts.terminatedAt, now) : null,
    contestedAmountSnapshot: facts.contestedAmount,
    openSignature,
    resolveSignature: null,
    createdAt: now,
    updatedAt: now,
  };

  let saved: ResolutionCaseRecord;
  try {
    saved = await stores.cases.insertCase(row);
    await recordEvent(stores.cases, {
      caseId: saved.id,
      eventType: CASE_EVENT_TYPES.caseCreated,
      actorWallet: input.sessionWallet,
      payload: { source: "create_or_recover" },
      now,
    });
    if (category || description) {
      await recordEvent(stores.cases, {
        caseId: saved.id,
        eventType: CASE_EVENT_TYPES.categorySaved,
        actorWallet: input.sessionWallet,
        now,
      });
    }
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await stores.cases.getCaseByContract(contractAddress);
    if (!raced) throw err;
    return recoverExisting(stores.cases, raced, facts, viewerRole, input.sessionWallet, now);
  }

  const statements = await stores.cases.listStatements(saved.id);
  return presentCase(saved, facts, statements, viewerRole);
}

async function recoverExisting(
  store: CaseStore,
  existing: ResolutionCaseRecord,
  facts: ContractCaseFacts,
  viewerRole: PartyStatementRole,
  actorWallet: string,
  now: Date
): Promise<PublicResolutionCase> {
  const patch = safeChainPatch(existing, facts, now);
  const keys = Object.keys(patch).filter((key) => key !== "updatedAt");
  let saved = existing;
  if (keys.length > 0) {
    saved = (await store.updateCase(existing.id, patch)) ?? existing;
    await recordEvent(store, {
      caseId: existing.id,
      eventType: CASE_EVENT_TYPES.chainReconciled,
      actorWallet,
      payload: { fields: keys },
      now,
    });
  }
  await recordEvent(store, {
    caseId: existing.id,
    eventType: CASE_EVENT_TYPES.caseRecovered,
    actorWallet,
    now,
  });
  const statements = await store.listStatements(saved.id);
  return presentCase(saved, facts, statements, viewerRole);
}

export async function getResolutionCase(
  store: CaseStore,
  reader: ContractFactsReader,
  input: { contractAddress: string; sessionWallet: string },
  now = new Date(),
  options: { allowResolver?: boolean } = {}
): Promise<PublicResolutionCase> {
  const contractAddress = parseContractAddress(input.contractAddress);
  const facts = await reader.read(contractAddress);
  // Read-only access for the on-chain resolver when the route allows it.
  const viewerRole: PartyStatementRole | "resolver" =
    options.allowResolver && casePartyRoleFromChain(input.sessionWallet, facts) === "resolver"
      ? "resolver"
      : requireParty(input.sessionWallet, facts);
  const existing = await store.getCaseByContract(contractAddress);
  if (!existing) {
    throw new CaseStateError("case_not_found", "Resolution Case was not found.");
  }
  const patch = safeChainPatch(existing, facts, now);
  const keys = Object.keys(patch).filter((key) => key !== "updatedAt");
  let saved = existing;
  // A resolver read never writes; chain facts are presented directly.
  if (keys.length > 0 && viewerRole !== "resolver") {
    saved = (await store.updateCase(existing.id, patch)) ?? existing;
    await recordEvent(store, {
      caseId: existing.id,
      eventType: CASE_EVENT_TYPES.chainReconciled,
      actorWallet: input.sessionWallet,
      payload: { fields: keys },
      now,
    });
  }
  const statements = await store.listStatements(saved.id);
  return presentCase(saved, facts, statements, viewerRole);
}

export async function updateCaseNotes(
  stores: { cases: CaseStore; rates?: RateLimitStore },
  reader: ContractFactsReader,
  input: {
    contractAddress: string;
    sessionWallet: string;
    category?: unknown;
    description?: unknown;
    wallet?: unknown;
    partyRole?: unknown;
  },
  now = new Date()
): Promise<PublicResolutionCase> {
  const contractAddress = parseContractAddress(input.contractAddress);
  void input.wallet;
  void input.partyRole;
  if (stores.rates) {
    await consumeRateLimit(
      stores.rates,
      `case-notes:${input.sessionWallet}:${contractAddress}`,
      RATE_LIMITS.sendMax,
      RATE_LIMITS.sendWindowMs,
      now
    );
  }
  const facts = await reader.read(contractAddress);
  const viewerRole = requireParty(input.sessionWallet, facts);
  const existing = await stores.cases.getCaseByContract(contractAddress);
  if (!existing) {
    throw new CaseStateError("case_not_found", "Resolution Case was not found.");
  }
  const categoryProvided = Object.prototype.hasOwnProperty.call(input, "category");
  const descriptionProvided = Object.prototype.hasOwnProperty.call(input, "description");
  const patch: Parameters<CaseStore["updateCase"]>[1] = { updatedAt: now };
  if (categoryProvided) patch.disputeCategory = optionalCategory(input.category);
  if (descriptionProvided) {
    patch.disputeDescription = optionalText(
      input.description,
      "Description",
      CASE_DESCRIPTION_MAX
    );
  }
  const saved = (await stores.cases.updateCase(existing.id, patch)) ?? existing;
  await recordEvent(stores.cases, {
    caseId: existing.id,
    eventType: CASE_EVENT_TYPES.categorySaved,
    actorWallet: input.sessionWallet,
    now,
  });
  const statements = await stores.cases.listStatements(saved.id);
  return presentCase(saved, facts, statements, viewerRole);
}

export async function upsertOwnStatement(
  stores: { cases: CaseStore; rates?: RateLimitStore },
  reader: ContractFactsReader,
  input: {
    contractAddress: string;
    sessionWallet: string;
    body: unknown;
    wallet?: unknown;
    partyWallet?: unknown;
    partyRole?: unknown;
    targetWallet?: unknown;
  },
  now = new Date()
): Promise<PublicResolutionCase> {
  const contractAddress = parseContractAddress(input.contractAddress);
  void input.wallet;
  void input.partyWallet;
  void input.partyRole;
  void input.targetWallet;
  if (stores.rates) {
    await consumeRateLimit(
      stores.rates,
      `case-statement:${input.sessionWallet}:${contractAddress}`,
      RATE_LIMITS.sendMax,
      RATE_LIMITS.sendWindowMs,
      now
    );
  }
  const facts = await reader.read(contractAddress);
  const role = casePartyRoleFromChain(input.sessionWallet, facts);
  if (role === "resolver") {
    throw new CaseAccessError("The resolver cannot write a party statement.");
  }
  if (role !== "employer" && role !== "freelancer") {
    throw new CaseAccessError();
  }
  const existing = await stores.cases.getCaseByContract(contractAddress);
  if (!existing) {
    throw new CaseStateError("case_not_found", "Resolution Case was not found.");
  }
  if (typeof input.body !== "string") {
    throw new CaseValidationError("Statement cannot be empty.");
  }
  const body = input.body.trim();
  if (!body) throw new CaseValidationError("Statement cannot be empty.");
  if (body.length > PARTY_STATEMENT_MAX) {
    throw new CaseValidationError(
      `Statement must be ${PARTY_STATEMENT_MAX} characters or fewer.`
    );
  }
  const previous = await stores.cases.getStatement(existing.id, input.sessionWallet);
  await stores.cases.upsertStatement({
    id: previous?.id ?? randomId(),
    caseId: existing.id,
    partyWallet: input.sessionWallet,
    partyRole: role,
    body,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    submittedAt: now,
  });
  await recordEvent(stores.cases, {
    caseId: existing.id,
    eventType: previous ? CASE_EVENT_TYPES.statementUpdated : CASE_EVENT_TYPES.statementCreated,
    actorWallet: input.sessionWallet,
    now,
  });
  const statements = await stores.cases.listStatements(existing.id);
  const workflowStatus = workflowFromStatements(statements);
  if (existing.workflowStatus !== workflowStatus) {
    await stores.cases.updateCase(existing.id, { workflowStatus, updatedAt: now });
  }
  const saved = (await stores.cases.getCaseById(existing.id)) ?? existing;
  return presentCase(saved, facts, statements, role);
}

export function categoryDeterminesAward(): boolean {
  return false;
}

export function caseExistsWithoutStatements(
  caseRow: ResolutionCaseRecord | null,
  statements: PartyStatementRecord[]
): boolean {
  return caseRow != null && statements.length === 0;
}

export { isAuthorizedCasePartyWallet };
