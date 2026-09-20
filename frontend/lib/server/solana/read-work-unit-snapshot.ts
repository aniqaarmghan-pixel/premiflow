import { createHash } from "node:crypto";

import { PublicKey } from "@solana/web3.js";

import {
  CANONICAL_PROGRAM_ID,
  HOURLY_NO_ACTIVE_SESSION,
  MAX_MILESTONES,
  WORK_UNIT_ACCOUNT,
} from "@/lib/streampay-v2/constants";
import {
  deriveHourlyStatePda,
  deriveTrialWorkUnitPda,
  deriveWorkUnitPda,
} from "@/lib/streampay-v2/pda";
import type {
  HourlyStateView,
  ReleaseTrigger,
  WorkUnitKind,
  WorkUnitStatus,
  WorkUnitView,
} from "@/lib/streampay-v2/types";

import type { AccountReader, AccountSnapshot } from "./read-contract-parties";
import { writeU32Le } from "./read-contract-snapshot";
import { writeI64Le, writeU64Le } from "./read-contract-case-facts";

export const WORK_UNIT_DISCRIMINATOR = new Uint8Array(
  createHash("sha256").update("account:WorkUnit").digest().subarray(0, 8)
);

export const HOURLY_STATE_DISCRIMINATOR = new Uint8Array(
  createHash("sha256").update("account:HourlyState").digest().subarray(0, 8)
);

export const WORK_UNIT_SNAPSHOT_OFFSETS = {
  version: 8,
  contract: WORK_UNIT_ACCOUNT.contractOffset,
  index: 41,
  kind: 45,
  status: 46,
  amount: 47,
  periodStart: 55,
  periodEnd: 63,
  dueOffsetSeconds: 71,
  submittedAt: 79,
  actionDeadline: 87,
  approvedAt: 95,
  releasedAt: 103,
  revisionCount: 111,
  releaseTrigger: 112,
} as const;

export const WORK_UNIT_SNAPSHOT_MIN_LEN = WORK_UNIT_SNAPSHOT_OFFSETS.releaseTrigger + 1;

export const HOURLY_STATE_SNAPSHOT_OFFSETS = {
  version: 8,
  contract: 9,
  hourlyRate: 41,
  authorizedSeconds: 49,
  approvedSeconds: 57,
  sessionCount: 65,
  activeSessionIndex: 69,
  maxSessionSeconds: 73,
  minSessionSeconds: 81,
  bump: 89,
} as const;

export const HOURLY_STATE_SNAPSHOT_MIN_LEN = HOURLY_STATE_SNAPSHOT_OFFSETS.bump + 1;

const WORK_UNIT_KINDS: readonly WorkUnitKind[] = [
  "Checkpoint",
  "Milestone",
  "Fixed",
  "Trial",
];
const WORK_UNIT_STATUSES: readonly WorkUnitStatus[] = [
  "Defined",
  "Submitted",
  "Revising",
  "Released",
  "Void",
];
const RELEASE_TRIGGERS: readonly ReleaseTrigger[] = [
  "NotReleased",
  "EmployerApproval",
  "ReviewTimeout",
];

export class WorkUnitSnapshotError extends Error {
  constructor(readonly code: "bad_layout" | "too_short" | "wrong_owner" | "bad_discriminator") {
    super(code);
    this.name = "WorkUnitSnapshotError";
  }
}

function u64View(data: Uint8Array, offset: number): DataView {
  const copy = new Uint8Array(data.subarray(offset, offset + 8));
  return new DataView(copy.buffer);
}

function readU64Big(data: Uint8Array, offset: number): bigint {
  return u64View(data, offset).getBigUint64(0, true);
}

function readI64(data: Uint8Array, offset: number): number {
  return Number(u64View(data, offset).getBigInt64(0, true));
}

function readU32(data: Uint8Array, offset: number): number {
  const copy = new Uint8Array(data.subarray(offset, offset + 4));
  return new DataView(copy.buffer).getUint32(0, true);
}

function readEnum<T extends string>(
  data: Uint8Array,
  offset: number,
  variants: readonly T[]
): T {
  const value = variants[data[offset] ?? 255];
  if (!value) throw new WorkUnitSnapshotError("bad_layout");
  return value;
}

export function decodeWorkUnitSnapshot(
  address: PublicKey,
  account: AccountSnapshot
): WorkUnitView {
  if (account.owner !== CANONICAL_PROGRAM_ID) {
    throw new WorkUnitSnapshotError("wrong_owner");
  }
  if (account.data.length < WORK_UNIT_SNAPSHOT_MIN_LEN) {
    throw new WorkUnitSnapshotError("too_short");
  }
  const disc = account.data.subarray(0, 8);
  if (!WORK_UNIT_DISCRIMINATOR.every((byte, i) => disc[i] === byte)) {
    throw new WorkUnitSnapshotError("bad_discriminator");
  }
  return {
    address,
    version: account.data[WORK_UNIT_SNAPSHOT_OFFSETS.version] ?? 1,
    contract: new PublicKey(
      account.data.subarray(
        WORK_UNIT_SNAPSHOT_OFFSETS.contract,
        WORK_UNIT_SNAPSHOT_OFFSETS.contract + 32
      )
    ),
    index: readU32(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.index),
    kind: readEnum(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.kind, WORK_UNIT_KINDS),
    status: readEnum(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.status, WORK_UNIT_STATUSES),
    amount: readU64Big(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.amount),
    periodStart: readI64(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.periodStart),
    periodEnd: readI64(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.periodEnd),
    dueOffsetSeconds: readI64(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.dueOffsetSeconds),
    submittedAt: readI64(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.submittedAt),
    actionDeadline: readI64(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.actionDeadline),
    approvedAt: readI64(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.approvedAt),
    releasedAt: readI64(account.data, WORK_UNIT_SNAPSHOT_OFFSETS.releasedAt),
    revisionCount: account.data[WORK_UNIT_SNAPSHOT_OFFSETS.revisionCount] ?? 0,
    releaseTrigger: readEnum(
      account.data,
      WORK_UNIT_SNAPSHOT_OFFSETS.releaseTrigger,
      RELEASE_TRIGGERS
    ),
    submissionHash: new Uint8Array(32),
    bump: 255,
    submissionUri: "",
  };
}

export function decodeHourlyStateSnapshot(
  address: PublicKey,
  account: AccountSnapshot
): HourlyStateView {
  if (account.owner !== CANONICAL_PROGRAM_ID) {
    throw new WorkUnitSnapshotError("wrong_owner");
  }
  if (account.data.length < HOURLY_STATE_SNAPSHOT_MIN_LEN) {
    throw new WorkUnitSnapshotError("too_short");
  }
  const disc = account.data.subarray(0, 8);
  if (!HOURLY_STATE_DISCRIMINATOR.every((byte, i) => disc[i] === byte)) {
    throw new WorkUnitSnapshotError("bad_discriminator");
  }
  return {
    address,
    version: account.data[HOURLY_STATE_SNAPSHOT_OFFSETS.version] ?? 1,
    contract: new PublicKey(
      account.data.subarray(
        HOURLY_STATE_SNAPSHOT_OFFSETS.contract,
        HOURLY_STATE_SNAPSHOT_OFFSETS.contract + 32
      )
    ),
    hourlyRate: readU64Big(account.data, HOURLY_STATE_SNAPSHOT_OFFSETS.hourlyRate),
    authorizedSeconds: readU64Big(
      account.data,
      HOURLY_STATE_SNAPSHOT_OFFSETS.authorizedSeconds
    ),
    approvedSeconds: readU64Big(
      account.data,
      HOURLY_STATE_SNAPSHOT_OFFSETS.approvedSeconds
    ),
    sessionCount: readU32(account.data, HOURLY_STATE_SNAPSHOT_OFFSETS.sessionCount),
    activeSessionIndex: readU32(
      account.data,
      HOURLY_STATE_SNAPSHOT_OFFSETS.activeSessionIndex
    ),
    maxSessionSeconds: readU64Big(
      account.data,
      HOURLY_STATE_SNAPSHOT_OFFSETS.maxSessionSeconds
    ),
    minSessionSeconds: readU64Big(
      account.data,
      HOURLY_STATE_SNAPSHOT_OFFSETS.minSessionSeconds
    ),
    bump: account.data[HOURLY_STATE_SNAPSHOT_OFFSETS.bump] ?? 255,
  };
}

export function encodeWorkUnitSnapshotAccount(input: {
  contract: PublicKey;
  index?: number;
  kind: WorkUnitKind;
  status: WorkUnitStatus;
  amount?: bigint;
  actionDeadline?: number;
  revisionCount?: number;
  submittedAt?: number;
  owner?: string;
}): AccountSnapshot {
  const data = new Uint8Array(WORK_UNIT_SNAPSHOT_MIN_LEN);
  data.set(WORK_UNIT_DISCRIMINATOR, 0);
  data[WORK_UNIT_SNAPSHOT_OFFSETS.version] = 1;
  data.set(input.contract.toBytes(), WORK_UNIT_SNAPSHOT_OFFSETS.contract);
  writeU32Le(data, WORK_UNIT_SNAPSHOT_OFFSETS.index, input.index ?? 0);
  data[WORK_UNIT_SNAPSHOT_OFFSETS.kind] = WORK_UNIT_KINDS.indexOf(input.kind);
  data[WORK_UNIT_SNAPSHOT_OFFSETS.status] = WORK_UNIT_STATUSES.indexOf(input.status);
  writeU64Le(data, WORK_UNIT_SNAPSHOT_OFFSETS.amount, input.amount ?? 0n);
  writeI64Le(data, WORK_UNIT_SNAPSHOT_OFFSETS.submittedAt, input.submittedAt ?? 0);
  writeI64Le(data, WORK_UNIT_SNAPSHOT_OFFSETS.actionDeadline, input.actionDeadline ?? 0);
  data[WORK_UNIT_SNAPSHOT_OFFSETS.revisionCount] = input.revisionCount ?? 0;
  data[WORK_UNIT_SNAPSHOT_OFFSETS.releaseTrigger] = 0;
  return {
    owner: input.owner ?? CANONICAL_PROGRAM_ID,
    data,
  };
}

export function encodeHourlyStateSnapshotAccount(input: {
  contract: PublicKey;
  hourlyRate?: bigint;
  authorizedSeconds?: bigint;
  approvedSeconds?: bigint;
  sessionCount?: number;
  activeSessionIndex?: number;
  owner?: string;
}): AccountSnapshot {
  const data = new Uint8Array(HOURLY_STATE_SNAPSHOT_MIN_LEN);
  data.set(HOURLY_STATE_DISCRIMINATOR, 0);
  data[HOURLY_STATE_SNAPSHOT_OFFSETS.version] = 1;
  data.set(input.contract.toBytes(), HOURLY_STATE_SNAPSHOT_OFFSETS.contract);
  writeU64Le(data, HOURLY_STATE_SNAPSHOT_OFFSETS.hourlyRate, input.hourlyRate ?? 0n);
  writeU64Le(
    data,
    HOURLY_STATE_SNAPSHOT_OFFSETS.authorizedSeconds,
    input.authorizedSeconds ?? 0n
  );
  writeU64Le(
    data,
    HOURLY_STATE_SNAPSHOT_OFFSETS.approvedSeconds,
    input.approvedSeconds ?? 0n
  );
  writeU32Le(data, HOURLY_STATE_SNAPSHOT_OFFSETS.sessionCount, input.sessionCount ?? 0);
  writeU32Le(
    data,
    HOURLY_STATE_SNAPSHOT_OFFSETS.activeSessionIndex,
    input.activeSessionIndex ?? HOURLY_NO_ACTIVE_SESSION
  );
  writeU64Le(data, HOURLY_STATE_SNAPSHOT_OFFSETS.maxSessionSeconds, 28_800n);
  writeU64Le(data, HOURLY_STATE_SNAPSHOT_OFFSETS.minSessionSeconds, 60n);
  data[HOURLY_STATE_SNAPSHOT_OFFSETS.bump] = 255;
  return {
    owner: input.owner ?? CANONICAL_PROGRAM_ID,
    data,
  };
}

export async function readRelatedLiveAccounts(
  reader: AccountReader,
  contractAddress: PublicKey,
  workUnitCount: number,
  paymentMode: string,
  trialConfigured: boolean
): Promise<{
  trial: WorkUnitView | null;
  workUnits: WorkUnitView[];
  hourlyState: HourlyStateView | null;
}> {
  const keys: PublicKey[] = [];
  const trialPda = deriveTrialWorkUnitPda(contractAddress);
  if (trialConfigured) keys.push(trialPda.address);
  const count = Math.min(MAX_MILESTONES, Math.max(0, workUnitCount));
  const unitPdas = Array.from({ length: count }, (_, index) =>
    deriveWorkUnitPda(contractAddress, index)
  );
  for (const pda of unitPdas) keys.push(pda.address);
  const hourlyPda =
    paymentMode === "Hourly" ? deriveHourlyStatePda(contractAddress) : null;
  if (hourlyPda) keys.push(hourlyPda.address);

  const accounts: Array<AccountSnapshot | null> = [];
  for (const key of keys) {
    try {
      accounts.push(await reader.getAccountInfo(key));
    } catch {
      accounts.push(null);
    }
  }

  let cursor = 0;
  let trial: WorkUnitView | null = null;
  if (trialConfigured) {
    const account = accounts[cursor++];
    if (account) {
      try {
        trial = decodeWorkUnitSnapshot(trialPda.address, account);
      } catch {
        trial = null;
      }
    }
  }

  const workUnits: WorkUnitView[] = [];
  for (const pda of unitPdas) {
    const account = accounts[cursor++];
    if (!account) continue;
    try {
      workUnits.push(decodeWorkUnitSnapshot(pda.address, account));
    } catch {
      // skip malformed child
    }
  }

  let hourlyState: HourlyStateView | null = null;
  if (hourlyPda) {
    const account = accounts[cursor++];
    if (account) {
      try {
        hourlyState = decodeHourlyStateSnapshot(hourlyPda.address, account);
      } catch {
        hourlyState = null;
      }
    }
  }

  return { trial, workUnits, hourlyState };
}
