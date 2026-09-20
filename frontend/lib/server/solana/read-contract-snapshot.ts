import { PublicKey } from "@solana/web3.js";

import type {
  ContractStatus,
  ContractView,
  DisputeParty,
  PaymentModeName,
  StartMode,
} from "@/lib/streampay-v2";
import { CANONICAL_PROGRAM_ID, CONTRACT_ACCOUNT } from "@/lib/streampay-v2/constants";

import {
  CONTRACT_CASE_MIN_LEN,
  CONTRACT_CASE_OFFSETS,
  decodeContractCaseFacts,
  writeI64Le,
  writeU64Le,
  type ContractCaseFacts,
} from "./read-contract-case-facts";
import {
  CONTRACT_DISCRIMINATOR,
  connectionAccountReader,
  type AccountReader,
  type AccountSnapshot,
} from "./read-contract-parties";

/**
 * Additional Borsh offsets after the published identity + case-fact fields.
 * Follows Contract field order in contract.rs. Not memcmp filter targets.
 */
export const CONTRACT_SNAPSHOT_OFFSETS = {
  tokenMint: CONTRACT_ACCOUNT.tokenMintOffset,
  contractId: 105,
  startMode: 115,
  totalAmount: 116,
  trialAmount: 124,
  mainAmount: 132,
  allocatedAmount: 140,
  streamReleasedAmount: 172,
  acceptanceDeadline: 245,
  scheduledStartTime: 253,
  durationSeconds: 261,
  checkpointInterval: 269,
  reviewDuration: 277,
  activationReviewDuration: 285,
  maxRevisions: 293,
  startTime: 294,
  endTime: 302,
  lastPeriodEnd: 310,
  createdAt: 318,
  acceptedAt: 326,
  completedAt: 334,
  workUnitCount: 350,
  releasedUnitCount: 354,
  voidedUnitCount: 358,
  openReviewCount: 362,
  lastMilestoneDueOffset: 364,
} as const;

export const CONTRACT_SNAPSHOT_MIN_LEN =
  CONTRACT_SNAPSHOT_OFFSETS.lastMilestoneDueOffset + 8;

const START_MODES: readonly StartMode[] = ["OnActivation", "Scheduled"];
const STATUSES: readonly ContractStatus[] = [
  "Draft",
  "PendingAcceptance",
  "PendingEmployerApproval",
  "Active",
  "Completed",
  "Declined",
  "Expired",
  "Cancelled",
  "ActivationRejected",
  "Disputed",
  "Resolved",
];
const PAYMENT_MODES: readonly PaymentModeName[] = [
  "Streaming",
  "Milestone",
  "Fixed",
  "Hourly",
];
const DISPUTE_PARTIES: readonly DisputeParty[] = ["None", "Employer", "Freelancer"];

export type ContractSnapshot = {
  address: string;
  facts: ContractCaseFacts;
  tokenMint: string;
  contractId: string;
  startMode: StartMode;
  totalAmount: string;
  trialAmount: string;
  mainAmount: string;
  allocatedAmount: string;
  streamReleasedAmount: string;
  acceptanceDeadline: number;
  scheduledStartTime: number;
  durationSeconds: number;
  checkpointInterval: number;
  reviewDuration: number;
  activationReviewDuration: number;
  maxRevisions: number;
  startTime: number;
  endTime: number;
  lastPeriodEnd: number;
  createdAt: number;
  acceptedAt: number;
  completedAt: number;
  workUnitCount: number;
  releasedUnitCount: number;
  voidedUnitCount: number;
  openReviewCount: number;
  lastMilestoneDueOffset: number;
};

export type SnapshotReadError =
  | "invalid_address"
  | "not_found"
  | "wrong_owner"
  | "bad_discriminator"
  | "too_short"
  | "bad_layout"
  | "rpc_failure";

export class ContractSnapshotError extends Error {
  constructor(readonly code: SnapshotReadError) {
    super(code);
    this.name = "ContractSnapshotError";
  }
}

function readPubkey(data: Uint8Array, offset: number): string {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function u64View(data: Uint8Array, offset: number): DataView {
  const copy = new Uint8Array(data.subarray(offset, offset + 8));
  return new DataView(copy.buffer);
}

function readU64(data: Uint8Array, offset: number): string {
  return u64View(data, offset).getBigUint64(0, true).toString(10);
}

function readI64(data: Uint8Array, offset: number): number {
  return Number(u64View(data, offset).getBigInt64(0, true));
}

function readU32(data: Uint8Array, offset: number): number {
  const copy = new Uint8Array(data.subarray(offset, offset + 4));
  return new DataView(copy.buffer).getUint32(0, true);
}

function readU16(data: Uint8Array, offset: number): number {
  const copy = new Uint8Array(data.subarray(offset, offset + 2));
  return new DataView(copy.buffer).getUint16(0, true);
}

function readEnum<T extends string>(
  data: Uint8Array,
  offset: number,
  variants: readonly T[]
): T {
  const index = data[offset];
  const value = variants[index];
  if (!value) throw new ContractSnapshotError("bad_layout");
  return value;
}

/**
 * Read-only decode of a confirmed Contract account. Browser-supplied
 * status/amounts are never trusted — callers must pass RPC account bytes.
 */
export function decodeContractSnapshot(
  address: string,
  account: AccountSnapshot
): ContractSnapshot {
  if (account.owner !== CANONICAL_PROGRAM_ID) {
    throw new ContractSnapshotError("wrong_owner");
  }
  if (account.data.length < CONTRACT_SNAPSHOT_MIN_LEN) {
    throw new ContractSnapshotError("too_short");
  }
  if (account.data.length < CONTRACT_CASE_MIN_LEN) {
    throw new ContractSnapshotError("too_short");
  }
  const disc = account.data.subarray(0, 8);
  if (!CONTRACT_DISCRIMINATOR.every((byte, i) => disc[i] === byte)) {
    throw new ContractSnapshotError("bad_discriminator");
  }

  let facts: ContractCaseFacts;
  try {
    facts = decodeContractCaseFacts(account);
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      throw new ContractSnapshotError(
        (err as { code: SnapshotReadError }).code
      );
    }
    throw new ContractSnapshotError("bad_layout");
  }

  return {
    address,
    facts,
    tokenMint: readPubkey(account.data, CONTRACT_SNAPSHOT_OFFSETS.tokenMint),
    contractId: readU64(account.data, CONTRACT_SNAPSHOT_OFFSETS.contractId),
    startMode: readEnum(account.data, CONTRACT_SNAPSHOT_OFFSETS.startMode, START_MODES),
    totalAmount: readU64(account.data, CONTRACT_SNAPSHOT_OFFSETS.totalAmount),
    trialAmount: readU64(account.data, CONTRACT_SNAPSHOT_OFFSETS.trialAmount),
    mainAmount: readU64(account.data, CONTRACT_SNAPSHOT_OFFSETS.mainAmount),
    allocatedAmount: readU64(account.data, CONTRACT_SNAPSHOT_OFFSETS.allocatedAmount),
    streamReleasedAmount: readU64(
      account.data,
      CONTRACT_SNAPSHOT_OFFSETS.streamReleasedAmount
    ),
    acceptanceDeadline: readI64(
      account.data,
      CONTRACT_SNAPSHOT_OFFSETS.acceptanceDeadline
    ),
    scheduledStartTime: readI64(
      account.data,
      CONTRACT_SNAPSHOT_OFFSETS.scheduledStartTime
    ),
    durationSeconds: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.durationSeconds),
    checkpointInterval: readI64(
      account.data,
      CONTRACT_SNAPSHOT_OFFSETS.checkpointInterval
    ),
    reviewDuration: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.reviewDuration),
    activationReviewDuration: readI64(
      account.data,
      CONTRACT_SNAPSHOT_OFFSETS.activationReviewDuration
    ),
    maxRevisions: account.data[CONTRACT_SNAPSHOT_OFFSETS.maxRevisions] ?? 0,
    startTime: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.startTime),
    endTime: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.endTime),
    lastPeriodEnd: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.lastPeriodEnd),
    createdAt: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.createdAt),
    acceptedAt: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.acceptedAt),
    completedAt: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.completedAt),
    workUnitCount: readU32(account.data, CONTRACT_SNAPSHOT_OFFSETS.workUnitCount),
    releasedUnitCount: readU32(account.data, CONTRACT_SNAPSHOT_OFFSETS.releasedUnitCount),
    voidedUnitCount: readU32(account.data, CONTRACT_SNAPSHOT_OFFSETS.voidedUnitCount),
    openReviewCount: readU16(account.data, CONTRACT_SNAPSHOT_OFFSETS.openReviewCount),
    lastMilestoneDueOffset: readI64(
      account.data,
      CONTRACT_SNAPSHOT_OFFSETS.lastMilestoneDueOffset
    ),
  };
}

export function snapshotToContractView(snapshot: ContractSnapshot): ContractView {
  return {
    address: new PublicKey(snapshot.address),
    version: 1,
    employer: new PublicKey(snapshot.facts.employer),
    freelancer: new PublicKey(snapshot.facts.freelancer),
    tokenMint: new PublicKey(snapshot.tokenMint),
    contractId: BigInt(snapshot.contractId),
    paymentMode: snapshot.facts.paymentMode,
    status: snapshot.facts.status,
    startMode: snapshot.startMode,
    totalAmount: BigInt(snapshot.totalAmount),
    trialAmount: BigInt(snapshot.trialAmount),
    mainAmount: BigInt(snapshot.mainAmount),
    allocatedAmount: BigInt(snapshot.allocatedAmount),
    releasedAmount: BigInt(snapshot.facts.releasedAmount),
    withdrawnAmount: BigInt(snapshot.facts.withdrawnAmount),
    refundedAmount: BigInt(snapshot.facts.refundedAmount),
    streamReleasedAmount: BigInt(snapshot.streamReleasedAmount),
    freelancerSettlementAmount: BigInt(snapshot.facts.freelancerSettlementAmount),
    employerRefundableAmount: BigInt(snapshot.facts.employerRefundableAmount),
    resolver: new PublicKey(snapshot.facts.resolver),
    contestedAmount: BigInt(snapshot.facts.contestedAmount),
    disputedAt: snapshot.facts.disputedAt,
    disputeInitiator: snapshot.facts.disputeInitiator,
    acceptanceDeadline: snapshot.acceptanceDeadline,
    scheduledStartTime: snapshot.scheduledStartTime,
    durationSeconds: snapshot.durationSeconds,
    checkpointInterval: snapshot.checkpointInterval,
    reviewDuration: snapshot.reviewDuration,
    activationReviewDuration: snapshot.activationReviewDuration,
    maxRevisions: snapshot.maxRevisions,
    startTime: snapshot.startTime,
    endTime: snapshot.endTime,
    lastPeriodEnd: snapshot.lastPeriodEnd,
    createdAt: snapshot.createdAt,
    acceptedAt: snapshot.acceptedAt,
    completedAt: snapshot.completedAt,
    terminatedAt: snapshot.facts.terminatedAt,
    workUnitCount: snapshot.workUnitCount,
    releasedUnitCount: snapshot.releasedUnitCount,
    voidedUnitCount: snapshot.voidedUnitCount,
    openReviewCount: snapshot.openReviewCount,
    lastMilestoneDueOffset: snapshot.lastMilestoneDueOffset,
    metadataHash: new Uint8Array(32),
    bump: 255,
    escrowBump: 254,
    metadataUri: "",
  };
}

export async function readContractSnapshot(
  reader: AccountReader,
  contractAddress: string
): Promise<ContractSnapshot> {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(contractAddress);
  } catch {
    throw new ContractSnapshotError("invalid_address");
  }
  let account: AccountSnapshot | null;
  try {
    account = await reader.getAccountInfo(pubkey);
  } catch {
    throw new ContractSnapshotError("rpc_failure");
  }
  if (!account) throw new ContractSnapshotError("not_found");
  return decodeContractSnapshot(pubkey.toBase58(), account);
}

export function connectionSnapshotReader(rpcUrl: string): AccountReader {
  return connectionAccountReader(rpcUrl);
}

export function writeU32Le(data: Uint8Array, offset: number, value: number): void {
  const copy = new Uint8Array(4);
  new DataView(copy.buffer).setUint32(0, value, true);
  data.set(copy, offset);
}

export function writeU16Le(data: Uint8Array, offset: number, value: number): void {
  const copy = new Uint8Array(2);
  new DataView(copy.buffer).setUint16(0, value, true);
  data.set(copy, offset);
}

export function encodeContractSnapshotAccount(input: {
  address?: string;
  employer: PublicKey;
  freelancer: PublicKey;
  resolver: PublicKey;
  tokenMint?: PublicKey;
  status: ContractStatus;
  paymentMode?: PaymentModeName;
  startMode?: StartMode;
  disputeInitiator?: DisputeParty;
  disputedAt?: number;
  terminatedAt?: number;
  contestedAmount?: bigint;
  freelancerSettlementAmount?: bigint;
  employerRefundableAmount?: bigint;
  releasedAmount?: bigint;
  withdrawnAmount?: bigint;
  refundedAmount?: bigint;
  totalAmount?: bigint;
  trialAmount?: bigint;
  mainAmount?: bigint;
  allocatedAmount?: bigint;
  streamReleasedAmount?: bigint;
  contractId?: bigint;
  acceptanceDeadline?: number;
  scheduledStartTime?: number;
  durationSeconds?: number;
  checkpointInterval?: number;
  reviewDuration?: number;
  activationReviewDuration?: number;
  maxRevisions?: number;
  startTime?: number;
  endTime?: number;
  lastPeriodEnd?: number;
  createdAt?: number;
  acceptedAt?: number;
  completedAt?: number;
  workUnitCount?: number;
  releasedUnitCount?: number;
  voidedUnitCount?: number;
  openReviewCount?: number;
  lastMilestoneDueOffset?: number;
  owner?: string;
}): AccountSnapshot {
  const data = new Uint8Array(CONTRACT_SNAPSHOT_MIN_LEN);
  data.set(CONTRACT_DISCRIMINATOR, 0);
  data[CONTRACT_ACCOUNT.versionOffset] = 1;
  data.set(input.employer.toBytes(), CONTRACT_ACCOUNT.employerOffset);
  data.set(input.freelancer.toBytes(), CONTRACT_ACCOUNT.freelancerOffset);
  data.set(
    (input.tokenMint ?? input.employer).toBytes(),
    CONTRACT_SNAPSHOT_OFFSETS.tokenMint
  );
  writeU64Le(data, CONTRACT_SNAPSHOT_OFFSETS.contractId, input.contractId ?? 1n);
  data[CONTRACT_CASE_OFFSETS.paymentMode] = PAYMENT_MODES.indexOf(
    input.paymentMode ?? "Fixed"
  );
  data[CONTRACT_CASE_OFFSETS.status] = STATUSES.indexOf(input.status);
  data[CONTRACT_SNAPSHOT_OFFSETS.startMode] = START_MODES.indexOf(
    input.startMode ?? "OnActivation"
  );
  writeU64Le(data, CONTRACT_SNAPSHOT_OFFSETS.totalAmount, input.totalAmount ?? 0n);
  writeU64Le(data, CONTRACT_SNAPSHOT_OFFSETS.trialAmount, input.trialAmount ?? 0n);
  writeU64Le(data, CONTRACT_SNAPSHOT_OFFSETS.mainAmount, input.mainAmount ?? 0n);
  writeU64Le(data, CONTRACT_SNAPSHOT_OFFSETS.allocatedAmount, input.allocatedAmount ?? 0n);
  writeU64Le(data, CONTRACT_CASE_OFFSETS.releasedAmount, input.releasedAmount ?? 0n);
  writeU64Le(data, CONTRACT_CASE_OFFSETS.withdrawnAmount, input.withdrawnAmount ?? 0n);
  writeU64Le(data, CONTRACT_CASE_OFFSETS.refundedAmount, input.refundedAmount ?? 0n);
  writeU64Le(
    data,
    CONTRACT_SNAPSHOT_OFFSETS.streamReleasedAmount,
    input.streamReleasedAmount ?? 0n
  );
  writeU64Le(
    data,
    CONTRACT_CASE_OFFSETS.freelancerSettlementAmount,
    input.freelancerSettlementAmount ?? 0n
  );
  writeU64Le(
    data,
    CONTRACT_CASE_OFFSETS.employerRefundableAmount,
    input.employerRefundableAmount ?? 0n
  );
  data.set(input.resolver.toBytes(), CONTRACT_CASE_OFFSETS.resolver);
  writeU64Le(data, CONTRACT_CASE_OFFSETS.contestedAmount, input.contestedAmount ?? 0n);
  writeI64Le(data, CONTRACT_CASE_OFFSETS.disputedAt, input.disputedAt ?? 0);
  data[CONTRACT_CASE_OFFSETS.disputeInitiator] = DISPUTE_PARTIES.indexOf(
    input.disputeInitiator ?? "None"
  );
  writeI64Le(
    data,
    CONTRACT_SNAPSHOT_OFFSETS.acceptanceDeadline,
    input.acceptanceDeadline ?? 0
  );
  writeI64Le(
    data,
    CONTRACT_SNAPSHOT_OFFSETS.scheduledStartTime,
    input.scheduledStartTime ?? 0
  );
  writeI64Le(data, CONTRACT_SNAPSHOT_OFFSETS.durationSeconds, input.durationSeconds ?? 0);
  writeI64Le(
    data,
    CONTRACT_SNAPSHOT_OFFSETS.checkpointInterval,
    input.checkpointInterval ?? 0
  );
  writeI64Le(data, CONTRACT_SNAPSHOT_OFFSETS.reviewDuration, input.reviewDuration ?? 0);
  writeI64Le(
    data,
    CONTRACT_SNAPSHOT_OFFSETS.activationReviewDuration,
    input.activationReviewDuration ?? 0
  );
  data[CONTRACT_SNAPSHOT_OFFSETS.maxRevisions] = input.maxRevisions ?? 0;
  writeI64Le(data, CONTRACT_SNAPSHOT_OFFSETS.startTime, input.startTime ?? 0);
  writeI64Le(data, CONTRACT_SNAPSHOT_OFFSETS.endTime, input.endTime ?? 0);
  writeI64Le(data, CONTRACT_SNAPSHOT_OFFSETS.lastPeriodEnd, input.lastPeriodEnd ?? 0);
  writeI64Le(data, CONTRACT_SNAPSHOT_OFFSETS.createdAt, input.createdAt ?? 0);
  writeI64Le(data, CONTRACT_SNAPSHOT_OFFSETS.acceptedAt, input.acceptedAt ?? 0);
  writeI64Le(data, CONTRACT_SNAPSHOT_OFFSETS.completedAt, input.completedAt ?? 0);
  writeI64Le(data, CONTRACT_CASE_OFFSETS.terminatedAt, input.terminatedAt ?? 0);
  writeU32Le(data, CONTRACT_SNAPSHOT_OFFSETS.workUnitCount, input.workUnitCount ?? 0);
  writeU32Le(
    data,
    CONTRACT_SNAPSHOT_OFFSETS.releasedUnitCount,
    input.releasedUnitCount ?? 0
  );
  writeU32Le(data, CONTRACT_SNAPSHOT_OFFSETS.voidedUnitCount, input.voidedUnitCount ?? 0);
  writeU16Le(data, CONTRACT_SNAPSHOT_OFFSETS.openReviewCount, input.openReviewCount ?? 0);
  writeI64Le(
    data,
    CONTRACT_SNAPSHOT_OFFSETS.lastMilestoneDueOffset,
    input.lastMilestoneDueOffset ?? 0
  );
  return {
    owner: input.owner ?? CANONICAL_PROGRAM_ID,
    data,
  };
}

export type { ContractStatus, DisputeParty, PaymentModeName };
