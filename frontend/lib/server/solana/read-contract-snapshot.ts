import { PublicKey } from "@solana/web3.js";

import type { ContractStatus, DisputeParty, PaymentModeName, StartMode } from "@/lib/streampay-v2";
import { CANONICAL_PROGRAM_ID, CONTRACT_ACCOUNT } from "@/lib/streampay-v2/constants";

import {
  CONTRACT_CASE_MIN_LEN,
  decodeContractCaseFacts,
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
  durationSeconds: 261,
  reviewDuration: 277,
  activationReviewDuration: 285,
  maxRevisions: 293,
  startTime: 294,
  endTime: 302,
  acceptedAt: 326,
  workUnitCount: 350,
  openReviewCount: 362,
} as const;

export const CONTRACT_SNAPSHOT_MIN_LEN = CONTRACT_SNAPSHOT_OFFSETS.openReviewCount + 2;

const START_MODES: readonly StartMode[] = ["OnActivation", "Scheduled"];

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
  durationSeconds: number;
  reviewDuration: number;
  activationReviewDuration: number;
  maxRevisions: number;
  startTime: number;
  endTime: number;
  acceptedAt: number;
  workUnitCount: number;
  openReviewCount: number;
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
    durationSeconds: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.durationSeconds),
    reviewDuration: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.reviewDuration),
    activationReviewDuration: readI64(
      account.data,
      CONTRACT_SNAPSHOT_OFFSETS.activationReviewDuration
    ),
    maxRevisions: account.data[CONTRACT_SNAPSHOT_OFFSETS.maxRevisions] ?? 0,
    startTime: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.startTime),
    endTime: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.endTime),
    acceptedAt: readI64(account.data, CONTRACT_SNAPSHOT_OFFSETS.acceptedAt),
    workUnitCount: readU32(account.data, CONTRACT_SNAPSHOT_OFFSETS.workUnitCount),
    openReviewCount: readU16(account.data, CONTRACT_SNAPSHOT_OFFSETS.openReviewCount),
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

export type { ContractStatus, DisputeParty, PaymentModeName };
