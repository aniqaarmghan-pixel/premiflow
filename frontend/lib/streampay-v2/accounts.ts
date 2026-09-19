import { PublicKey } from "@solana/web3.js";

import { CONTRACT_ACCOUNT, WORK_UNIT_ACCOUNT } from "./constants";
import type { StreamPayV2Program } from "./program";
import {
  bnToBigInt,
  decodeContractStatus,
  decodeDisputeParty,
  decodePaymentMode,
  decodeReleaseTrigger,
  decodeStartMode,
  decodeAnchorEnum,
  decodeWorkUnitKind,
  decodeWorkUnitStatus,
  i64ToNumber,
  toBytes32,
  toPublicKey,
  type ContractView,
  type HourlySessionStatus,
  type HourlySessionView,
  type HourlyStateView,
  type WorkUnitView,
} from "./types";

function field(raw: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (name in raw && raw[name] !== undefined) return raw[name];
  }
  throw new Error(`missing account field: ${names.join(" | ")}`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

export function decodeContract(
  address: PublicKey,
  rawAccount: unknown
): ContractView {
  const raw = asRecord(rawAccount, "Contract");
  return {
    address,
    version: Number(field(raw, "version")),
    employer: toPublicKey(field(raw, "employer") as PublicKey | string),
    freelancer: toPublicKey(field(raw, "freelancer") as PublicKey | string),
    tokenMint: toPublicKey(field(raw, "tokenMint", "token_mint") as PublicKey | string),
    contractId: bnToBigInt(field(raw, "contractId", "contract_id") as never),
    paymentMode: decodePaymentMode(field(raw, "paymentMode", "payment_mode")),
    status: decodeContractStatus(field(raw, "status")),
    startMode: decodeStartMode(field(raw, "startMode", "start_mode")),
    totalAmount: bnToBigInt(field(raw, "totalAmount", "total_amount") as never),
    trialAmount: bnToBigInt(field(raw, "trialAmount", "trial_amount") as never),
    mainAmount: bnToBigInt(field(raw, "mainAmount", "main_amount") as never),
    allocatedAmount: bnToBigInt(field(raw, "allocatedAmount", "allocated_amount") as never),
    releasedAmount: bnToBigInt(field(raw, "releasedAmount", "released_amount") as never),
    withdrawnAmount: bnToBigInt(field(raw, "withdrawnAmount", "withdrawn_amount") as never),
    refundedAmount: bnToBigInt(field(raw, "refundedAmount", "refunded_amount") as never),
    streamReleasedAmount: bnToBigInt(
      field(raw, "streamReleasedAmount", "stream_released_amount") as never
    ),
    freelancerSettlementAmount: bnToBigInt(
      field(raw, "freelancerSettlementAmount", "freelancer_settlement_amount") as never
    ),
    employerRefundableAmount: bnToBigInt(
      field(raw, "employerRefundableAmount", "employer_refundable_amount") as never
    ),
    resolver: toPublicKey(field(raw, "resolver") as PublicKey | string),
    contestedAmount: bnToBigInt(field(raw, "contestedAmount", "contested_amount") as never),
    disputedAt: i64ToNumber(field(raw, "disputedAt", "disputed_at") as never),
    disputeInitiator: decodeDisputeParty(
      field(raw, "disputeInitiator", "dispute_initiator")
    ),
    acceptanceDeadline: i64ToNumber(
      field(raw, "acceptanceDeadline", "acceptance_deadline") as never
    ),
    scheduledStartTime: i64ToNumber(
      field(raw, "scheduledStartTime", "scheduled_start_time") as never
    ),
    durationSeconds: i64ToNumber(
      field(raw, "durationSeconds", "duration_seconds") as never
    ),
    checkpointInterval: i64ToNumber(
      field(raw, "checkpointInterval", "checkpoint_interval") as never
    ),
    reviewDuration: i64ToNumber(
      field(raw, "reviewDuration", "review_duration") as never
    ),
    activationReviewDuration: i64ToNumber(
      field(raw, "activationReviewDuration", "activation_review_duration") as never
    ),
    maxRevisions: Number(field(raw, "maxRevisions", "max_revisions")),
    startTime: i64ToNumber(field(raw, "startTime", "start_time") as never),
    endTime: i64ToNumber(field(raw, "endTime", "end_time") as never),
    lastPeriodEnd: i64ToNumber(field(raw, "lastPeriodEnd", "last_period_end") as never),
    createdAt: i64ToNumber(field(raw, "createdAt", "created_at") as never),
    acceptedAt: i64ToNumber(field(raw, "acceptedAt", "accepted_at") as never),
    completedAt: i64ToNumber(field(raw, "completedAt", "completed_at") as never),
    terminatedAt: i64ToNumber(field(raw, "terminatedAt", "terminated_at") as never),
    workUnitCount: Number(field(raw, "workUnitCount", "work_unit_count")),
    releasedUnitCount: Number(field(raw, "releasedUnitCount", "released_unit_count")),
    voidedUnitCount: Number(field(raw, "voidedUnitCount", "voided_unit_count")),
    openReviewCount: Number(field(raw, "openReviewCount", "open_review_count")),
    lastMilestoneDueOffset: i64ToNumber(
      field(raw, "lastMilestoneDueOffset", "last_milestone_due_offset") as never
    ),
    metadataHash: toBytes32(field(raw, "metadataHash", "metadata_hash") as never),
    bump: Number(field(raw, "bump")),
    escrowBump: Number(field(raw, "escrowBump", "escrow_bump")),
    metadataUri: String(field(raw, "metadataUri", "metadata_uri")),
  };
}

export function decodeWorkUnit(
  address: PublicKey,
  rawAccount: unknown
): WorkUnitView {
  const raw = asRecord(rawAccount, "WorkUnit");
  return {
    address,
    version: Number(field(raw, "version")),
    contract: toPublicKey(field(raw, "contract") as PublicKey | string),
    index: Number(field(raw, "index")),
    kind: decodeWorkUnitKind(field(raw, "kind")),
    status: decodeWorkUnitStatus(field(raw, "status")),
    amount: bnToBigInt(field(raw, "amount") as never),
    periodStart: i64ToNumber(field(raw, "periodStart", "period_start") as never),
    periodEnd: i64ToNumber(field(raw, "periodEnd", "period_end") as never),
    dueOffsetSeconds: i64ToNumber(
      field(raw, "dueOffsetSeconds", "due_offset_seconds") as never
    ),
    submittedAt: i64ToNumber(field(raw, "submittedAt", "submitted_at") as never),
    actionDeadline: i64ToNumber(
      field(raw, "actionDeadline", "action_deadline") as never
    ),
    approvedAt: i64ToNumber(field(raw, "approvedAt", "approved_at") as never),
    releasedAt: i64ToNumber(field(raw, "releasedAt", "released_at") as never),
    revisionCount: Number(field(raw, "revisionCount", "revision_count")),
    releaseTrigger: decodeReleaseTrigger(
      field(raw, "releaseTrigger", "release_trigger")
    ),
    submissionHash: toBytes32(
      field(raw, "submissionHash", "submission_hash") as never
    ),
    bump: Number(field(raw, "bump")),
    submissionUri: String(field(raw, "submissionUri", "submission_uri")),
  };
}

export async function fetchContract(
  program: StreamPayV2Program,
  address: PublicKey
): Promise<ContractView> {
  const account = await program.account.contract.fetch(address);
  return decodeContract(address, account);
}

export async function fetchWorkUnit(
  program: StreamPayV2Program,
  address: PublicKey
): Promise<WorkUnitView> {
  const account = await program.account.workUnit.fetch(address);
  return decodeWorkUnit(address, account);
}

const HOURLY_SESSION_STATUSES: readonly HourlySessionStatus[] = [
  "Open",
  "Recorded",
  "Void",
];

export function decodeHourlyState(
  address: PublicKey,
  rawAccount: unknown
): HourlyStateView {
  const raw = asRecord(rawAccount, "HourlyState");
  return {
    address,
    version: Number(field(raw, "version")),
    contract: toPublicKey(field(raw, "contract") as PublicKey | string),
    hourlyRate: bnToBigInt(field(raw, "hourlyRate", "hourly_rate") as never),
    authorizedSeconds: bnToBigInt(
      field(raw, "authorizedSeconds", "authorized_seconds") as never
    ),
    approvedSeconds: bnToBigInt(
      field(raw, "approvedSeconds", "approved_seconds") as never
    ),
    sessionCount: Number(field(raw, "sessionCount", "session_count")),
    activeSessionIndex: Number(
      field(raw, "activeSessionIndex", "active_session_index")
    ),
    maxSessionSeconds: bnToBigInt(
      field(raw, "maxSessionSeconds", "max_session_seconds") as never
    ),
    minSessionSeconds: bnToBigInt(
      field(raw, "minSessionSeconds", "min_session_seconds") as never
    ),
    bump: Number(field(raw, "bump")),
  };
}

export function decodeHourlySession(
  address: PublicKey,
  rawAccount: unknown
): HourlySessionView {
  const raw = asRecord(rawAccount, "HourlySession");
  return {
    address,
    version: Number(field(raw, "version")),
    contract: toPublicKey(field(raw, "contract") as PublicKey | string),
    index: Number(field(raw, "index")),
    startedAt: i64ToNumber(field(raw, "startedAt", "started_at") as never),
    stoppedAt: i64ToNumber(field(raw, "stoppedAt", "stopped_at") as never),
    durationSeconds: bnToBigInt(
      field(raw, "durationSeconds", "duration_seconds") as never
    ),
    status: decodeAnchorEnum(
      field(raw, "status"),
      HOURLY_SESSION_STATUSES,
      "HourlySessionStatus"
    ),
    workLogHash: toBytes32(field(raw, "workLogHash", "work_log_hash") as never),
    bump: Number(field(raw, "bump")),
    workLogUri: String(field(raw, "workLogUri", "work_log_uri")),
  };
}

export async function fetchHourlyState(
  program: StreamPayV2Program,
  address: PublicKey
): Promise<HourlyStateView> {
  const account = await program.account.hourlyState.fetch(address);
  return decodeHourlyState(address, account);
}

export async function fetchHourlySession(
  program: StreamPayV2Program,
  address: PublicKey
): Promise<HourlySessionView> {
  const account = await program.account.hourlySession.fetch(address);
  return decodeHourlySession(address, account);
}

/**
 * Employer contracts via memcmp at documented offset 9.
 * Anchor's account client also filters the 8-byte discriminator at offset 0.
 * Do not filter by dataSize: metadata_uri is variable-length.
 */
export async function fetchContractsForEmployer(
  program: StreamPayV2Program,
  employer: PublicKey
): Promise<ContractView[]> {
  const accounts = await program.account.contract.all([
    {
      memcmp: {
        offset: CONTRACT_ACCOUNT.employerOffset,
        bytes: employer.toBase58(),
      },
    },
  ]);
  return accounts.map((item) => decodeContract(item.publicKey, item.account));
}

export async function fetchContractsForFreelancer(
  program: StreamPayV2Program,
  freelancer: PublicKey
): Promise<ContractView[]> {
  const accounts = await program.account.contract.all([
    {
      memcmp: {
        offset: CONTRACT_ACCOUNT.freelancerOffset,
        bytes: freelancer.toBase58(),
      },
    },
  ]);
  return accounts.map((item) => decodeContract(item.publicKey, item.account));
}

/**
 * Work units whose parent contract pubkey sits at offset 9.
 * Includes trial units: they share the WorkUnit account type.
 */
export async function fetchWorkUnitsForContract(
  program: StreamPayV2Program,
  contract: PublicKey
): Promise<WorkUnitView[]> {
  const accounts = await program.account.workUnit.all([
    {
      memcmp: {
        offset: WORK_UNIT_ACCOUNT.contractOffset,
        bytes: contract.toBase58(),
      },
    },
  ]);
  return accounts.map((item) => decodeWorkUnit(item.publicKey, item.account));
}

export async function fetchWalletContractSets(
  program: StreamPayV2Program,
  wallet: PublicKey
): Promise<{ asEmployer: ContractView[]; asFreelancer: ContractView[] }> {
  const [asEmployer, asFreelancer] = await Promise.all([
    fetchContractsForEmployer(program, wallet),
    fetchContractsForFreelancer(program, wallet),
  ]);
  return { asEmployer, asFreelancer };
}
