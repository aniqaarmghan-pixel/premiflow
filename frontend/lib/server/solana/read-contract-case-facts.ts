import { PublicKey } from "@solana/web3.js";

import type {
  ContractStatus,
  DisputeParty,
  PaymentModeName,
} from "@/lib/streampay-v2";
import { CANONICAL_PROGRAM_ID, CONTRACT_ACCOUNT } from "@/lib/streampay-v2/constants";

import {
  CONTRACT_DISCRIMINATOR,
  connectionAccountReader,
  type AccountReader,
  type AccountSnapshot,
} from "./read-contract-parties";

/**
 * Borsh layout offsets after the 8-byte Anchor discriminator.
 * Identity offsets match CONTRACT_ACCOUNT. Remaining offsets follow the
 * published V2 Contract field order in contract.rs and are used only to
 * read confirmed case facts. They are not memcmp filter targets.
 */
export const CONTRACT_CASE_OFFSETS = {
  paymentMode: 113,
  status: 114,
  releasedAmount: 148,
  withdrawnAmount: 156,
  refundedAmount: 164,
  freelancerSettlementAmount: 180,
  employerRefundableAmount: 188,
  resolver: 196,
  contestedAmount: 228,
  disputedAt: 236,
  disputeInitiator: 244,
  terminatedAt: 342,
} as const;

export const CONTRACT_CASE_MIN_LEN = CONTRACT_CASE_OFFSETS.terminatedAt + 8;

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

export type ContractCaseFacts = {
  employer: string;
  freelancer: string;
  resolver: string;
  status: ContractStatus;
  paymentMode: PaymentModeName;
  disputeInitiator: DisputeParty;
  disputedAt: number;
  terminatedAt: number;
  contestedAmount: string;
  freelancerSettlementAmount: string;
  employerRefundableAmount: string;
  releasedAmount: string;
  withdrawnAmount: string;
  refundedAmount: string;
};

export type CaseFactsReadError =
  | "invalid_address"
  | "not_found"
  | "wrong_owner"
  | "bad_discriminator"
  | "too_short"
  | "bad_layout"
  | "rpc_failure";

export class ContractCaseFactsError extends Error {
  constructor(readonly code: CaseFactsReadError) {
    super(code);
    this.name = "ContractCaseFactsError";
  }
}

export type ContractFactsReader = {
  read(contractAddress: string): Promise<ContractCaseFacts>;
};

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

function readEnum<T extends string>(
  data: Uint8Array,
  offset: number,
  variants: readonly T[]
): T {
  const index = data[offset];
  const value = variants[index];
  if (!value) throw new ContractCaseFactsError("bad_layout");
  return value;
}

export function decodeContractCaseFacts(account: AccountSnapshot): ContractCaseFacts {
  if (account.owner !== CANONICAL_PROGRAM_ID) {
    throw new ContractCaseFactsError("wrong_owner");
  }
  if (account.data.length < CONTRACT_CASE_MIN_LEN) {
    throw new ContractCaseFactsError("too_short");
  }
  const disc = account.data.subarray(0, 8);
  if (!CONTRACT_DISCRIMINATOR.every((byte, i) => disc[i] === byte)) {
    throw new ContractCaseFactsError("bad_discriminator");
  }
  return {
    employer: readPubkey(account.data, CONTRACT_ACCOUNT.employerOffset),
    freelancer: readPubkey(account.data, CONTRACT_ACCOUNT.freelancerOffset),
    resolver: readPubkey(account.data, CONTRACT_CASE_OFFSETS.resolver),
    status: readEnum(account.data, CONTRACT_CASE_OFFSETS.status, STATUSES),
    paymentMode: readEnum(account.data, CONTRACT_CASE_OFFSETS.paymentMode, PAYMENT_MODES),
    disputeInitiator: readEnum(
      account.data,
      CONTRACT_CASE_OFFSETS.disputeInitiator,
      DISPUTE_PARTIES
    ),
    disputedAt: readI64(account.data, CONTRACT_CASE_OFFSETS.disputedAt),
    terminatedAt: readI64(account.data, CONTRACT_CASE_OFFSETS.terminatedAt),
    contestedAmount: readU64(account.data, CONTRACT_CASE_OFFSETS.contestedAmount),
    freelancerSettlementAmount: readU64(
      account.data,
      CONTRACT_CASE_OFFSETS.freelancerSettlementAmount
    ),
    employerRefundableAmount: readU64(
      account.data,
      CONTRACT_CASE_OFFSETS.employerRefundableAmount
    ),
    releasedAmount: readU64(account.data, CONTRACT_CASE_OFFSETS.releasedAmount),
    withdrawnAmount: readU64(account.data, CONTRACT_CASE_OFFSETS.withdrawnAmount),
    refundedAmount: readU64(account.data, CONTRACT_CASE_OFFSETS.refundedAmount),
  };
}

export async function readContractCaseFacts(
  reader: AccountReader,
  contractAddress: string
): Promise<ContractCaseFacts> {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(contractAddress);
  } catch {
    throw new ContractCaseFactsError("invalid_address");
  }
  let account: AccountSnapshot | null;
  try {
    account = await reader.getAccountInfo(pubkey);
  } catch {
    throw new ContractCaseFactsError("rpc_failure");
  }
  if (!account) throw new ContractCaseFactsError("not_found");
  return decodeContractCaseFacts(account);
}

export function connectionCaseFactsReader(rpcUrl: string): ContractFactsReader {
  const reader = connectionAccountReader(rpcUrl);
  return {
    read(contractAddress) {
      return readContractCaseFacts(reader, contractAddress);
    },
  };
}

export function writeU64Le(data: Uint8Array, offset: number, value: bigint): void {
  const copy = new Uint8Array(8);
  new DataView(copy.buffer).setBigUint64(0, value, true);
  data.set(copy, offset);
}

export function writeI64Le(data: Uint8Array, offset: number, value: number): void {
  const copy = new Uint8Array(8);
  new DataView(copy.buffer).setBigInt64(0, BigInt(value), true);
  data.set(copy, offset);
}

export function encodeContractCaseAccount(input: {
  employer: PublicKey;
  freelancer: PublicKey;
  resolver: PublicKey;
  status: ContractStatus;
  paymentMode?: PaymentModeName;
  disputeInitiator?: DisputeParty;
  disputedAt?: number;
  terminatedAt?: number;
  contestedAmount?: bigint;
  freelancerSettlementAmount?: bigint;
  employerRefundableAmount?: bigint;
  releasedAmount?: bigint;
  withdrawnAmount?: bigint;
  refundedAmount?: bigint;
  owner?: string;
}): AccountSnapshot {
  const data = new Uint8Array(CONTRACT_CASE_MIN_LEN);
  data.set(CONTRACT_DISCRIMINATOR, 0);
  data.set(input.employer.toBytes(), CONTRACT_ACCOUNT.employerOffset);
  data.set(input.freelancer.toBytes(), CONTRACT_ACCOUNT.freelancerOffset);
  data[CONTRACT_CASE_OFFSETS.paymentMode] = PAYMENT_MODES.indexOf(
    input.paymentMode ?? "Fixed"
  );
  data[CONTRACT_CASE_OFFSETS.status] = STATUSES.indexOf(input.status);
  data.set(input.resolver.toBytes(), CONTRACT_CASE_OFFSETS.resolver);
  writeU64Le(data, CONTRACT_CASE_OFFSETS.releasedAmount, input.releasedAmount ?? 0n);
  writeU64Le(data, CONTRACT_CASE_OFFSETS.withdrawnAmount, input.withdrawnAmount ?? 0n);
  writeU64Le(data, CONTRACT_CASE_OFFSETS.refundedAmount, input.refundedAmount ?? 0n);
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
  writeU64Le(data, CONTRACT_CASE_OFFSETS.contestedAmount, input.contestedAmount ?? 0n);
  writeI64Le(data, CONTRACT_CASE_OFFSETS.disputedAt, input.disputedAt ?? 0);
  data[CONTRACT_CASE_OFFSETS.disputeInitiator] = DISPUTE_PARTIES.indexOf(
    input.disputeInitiator ?? "None"
  );
  writeI64Le(data, CONTRACT_CASE_OFFSETS.terminatedAt, input.terminatedAt ?? 0);
  return {
    owner: input.owner ?? CANONICAL_PROGRAM_ID,
    data,
  };
}
