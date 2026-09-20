import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export type ContractType = "Streaming" | "Milestone" | "Fixed";
/** On-chain payment mode. Hourly is protocol-only in H2; Create UX stays 3 modes. */
export type PaymentModeName = ContractType | "Hourly";
export type StartMode = "OnActivation" | "Scheduled";
export type ContractStatus =
  | "Draft"
  | "PendingAcceptance"
  | "PendingEmployerApproval"
  | "Active"
  | "Completed"
  | "Declined"
  | "Expired"
  | "Cancelled"
  | "ActivationRejected"
  | "Disputed"
  | "Resolved";
export type WorkUnitKind = "Checkpoint" | "Milestone" | "Fixed" | "Trial";
export type WorkUnitStatus =
  | "Defined"
  | "Submitted"
  | "Revising"
  | "Released"
  | "Void";
export type ReleaseTrigger =
  | "NotReleased"
  | "EmployerApproval"
  | "ReviewTimeout";
export type DisputeParty = "None" | "Employer" | "Freelancer";

export type ContractRole = "employer" | "freelancer" | "resolver" | "none";

export type TrialConfig = {
  configured: boolean;
  amount: bigint;
};

export type SettlementView = {
  totalAmount: bigint;
  trialAmount: bigint;
  mainAmount: bigint;
  allocatedAmount: bigint;
  releasedAmount: bigint;
  withdrawnAmount: bigint;
  refundedAmount: bigint;
  streamReleasedAmount: bigint;
  freelancerSettlementAmount: bigint;
  employerRefundableAmount: bigint;
  contestedAmount: bigint;
};

export type ContractView = {
  address: PublicKey;
  version: number;
  employer: PublicKey;
  freelancer: PublicKey;
  tokenMint: PublicKey;
  contractId: bigint;
  paymentMode: PaymentModeName;
  status: ContractStatus;
  startMode: StartMode;
  totalAmount: bigint;
  trialAmount: bigint;
  mainAmount: bigint;
  allocatedAmount: bigint;
  releasedAmount: bigint;
  withdrawnAmount: bigint;
  refundedAmount: bigint;
  streamReleasedAmount: bigint;
  freelancerSettlementAmount: bigint;
  employerRefundableAmount: bigint;
  resolver: PublicKey;
  contestedAmount: bigint;
  disputedAt: number;
  disputeInitiator: DisputeParty;
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
  terminatedAt: number;
  workUnitCount: number;
  releasedUnitCount: number;
  voidedUnitCount: number;
  openReviewCount: number;
  lastMilestoneDueOffset: number;
  metadataHash: Uint8Array;
  bump: number;
  escrowBump: number;
  metadataUri: string;
};

export type HourlySessionStatus = "Open" | "Recorded" | "Void";

export type HourlyStateView = {
  address: PublicKey;
  version: number;
  contract: PublicKey;
  hourlyRate: bigint;
  authorizedSeconds: bigint;
  approvedSeconds: bigint;
  sessionCount: number;
  activeSessionIndex: number;
  maxSessionSeconds: bigint;
  minSessionSeconds: bigint;
  bump: number;
};

export type HourlySessionView = {
  address: PublicKey;
  version: number;
  contract: PublicKey;
  index: number;
  startedAt: number;
  stoppedAt: number;
  durationSeconds: bigint;
  status: HourlySessionStatus;
  workLogHash: Uint8Array;
  bump: number;
  workLogUri: string;
};

export type WorkUnitView = {
  address: PublicKey;
  version: number;
  contract: PublicKey;
  index: number;
  kind: WorkUnitKind;
  status: WorkUnitStatus;
  amount: bigint;
  periodStart: number;
  periodEnd: number;
  dueOffsetSeconds: number;
  submittedAt: number;
  actionDeadline: number;
  approvedAt: number;
  releasedAt: number;
  revisionCount: number;
  releaseTrigger: ReleaseTrigger;
  submissionHash: Uint8Array;
  bump: number;
  submissionUri: string;
};

export type CreateContractRequest = {
  contractId: bigint;
  paymentMode: ContractType;
  startMode: StartMode;
  totalAmount: bigint;
  acceptanceDeadline: number;
  scheduledStartTime: number;
  durationSeconds: number;
  checkpointInterval: number;
  reviewDuration: number;
  activationReviewDuration: number;
  maxRevisions: number;
  trialAmount: bigint;
  resolver: PublicKey;
  metadataUri: string;
  metadataHash: Uint8Array;
};

export type CreateHourlyContractRequest = {
  contractId: bigint;
  hourlyRate: bigint;
  authorizedSeconds: bigint;
  acceptanceDeadline: number;
  durationSeconds: number;
  reviewDuration: number;
  activationReviewDuration: number;
  maxRevisions: number;
  trialAmount: bigint;
  resolver: PublicKey;
  metadataUri: string;
  metadataHash: Uint8Array;
};

const CONTRACT_STATUSES: readonly ContractStatus[] = [
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
] as const;

const PAYMENT_MODES: readonly PaymentModeName[] = [
  "Streaming",
  "Milestone",
  "Fixed",
  "Hourly",
] as const;

const START_MODES: readonly StartMode[] = ["OnActivation", "Scheduled"] as const;

const WORK_UNIT_KINDS: readonly WorkUnitKind[] = [
  "Checkpoint",
  "Milestone",
  "Fixed",
  "Trial",
] as const;

const WORK_UNIT_STATUSES: readonly WorkUnitStatus[] = [
  "Defined",
  "Submitted",
  "Revising",
  "Released",
  "Void",
] as const;

const RELEASE_TRIGGERS: readonly ReleaseTrigger[] = [
  "NotReleased",
  "EmployerApproval",
  "ReviewTimeout",
] as const;

const DISPUTE_PARTIES: readonly DisputeParty[] = [
  "None",
  "Employer",
  "Freelancer",
] as const;

function camelToPascal(key: string): string {
  if (key.length === 0) return key;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function decodeAnchorEnum<T extends string>(
  value: unknown,
  variants: readonly T[],
  label: string
): T {
  if (typeof value === "string") {
    const pascal = camelToPascal(value);
    if ((variants as readonly string[]).includes(pascal)) {
      return pascal as T;
    }
    if ((variants as readonly string[]).includes(value)) {
      return value as T;
    }
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const pascal = camelToPascal(keys[0]);
      if ((variants as readonly string[]).includes(pascal)) {
        return pascal as T;
      }
    }
  }
  throw new Error(`Unrecognized ${label} enum value: ${JSON.stringify(value)}`);
}

export function decodeContractStatus(value: unknown): ContractStatus {
  return decodeAnchorEnum(value, CONTRACT_STATUSES, "ContractStatus");
}

export function decodePaymentMode(value: unknown): PaymentModeName {
  return decodeAnchorEnum(value, PAYMENT_MODES, "PaymentMode");
}

export function decodeStartMode(value: unknown): StartMode {
  return decodeAnchorEnum(value, START_MODES, "StartMode");
}

export function decodeWorkUnitKind(value: unknown): WorkUnitKind {
  return decodeAnchorEnum(value, WORK_UNIT_KINDS, "WorkUnitKind");
}

export function decodeWorkUnitStatus(value: unknown): WorkUnitStatus {
  return decodeAnchorEnum(value, WORK_UNIT_STATUSES, "WorkUnitStatus");
}

export function decodeReleaseTrigger(value: unknown): ReleaseTrigger {
  return decodeAnchorEnum(value, RELEASE_TRIGGERS, "ReleaseTrigger");
}

export function decodeDisputeParty(value: unknown): DisputeParty {
  return decodeAnchorEnum(value, DISPUTE_PARTIES, "DisputeParty");
}

export function encodePaymentMode(
  mode: ContractType
):
  | { streaming: Record<string, never> }
  | { milestone: Record<string, never> }
  | { fixed: Record<string, never> }
  | { hourly: Record<string, never> } {
  switch (mode) {
    case "Streaming":
      return { streaming: {} };
    case "Milestone":
      return { milestone: {} };
    case "Fixed":
      return { fixed: {} };
  }
}

export function encodeStartMode(
  mode: StartMode
): { onActivation: Record<string, never> } | { scheduled: Record<string, never> } {
  switch (mode) {
    case "OnActivation":
      return { onActivation: {} };
    case "Scheduled":
      return { scheduled: {} };
  }
}

export function bnToBigInt(value: BN | bigint | number | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      throw new Error(`unsafe numeric conversion: ${value}`);
    }
    if (value < 0) {
      throw new Error(`negative amount: ${value}`);
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    if (!/^-?\d+$/.test(value)) {
      throw new Error(`invalid integer string: ${value}`);
    }
    return BigInt(value);
  }
  return BigInt(value.toString(10));
}

export function i64ToNumber(value: BN | bigint | number | string): number {
  const asBig = typeof value === "bigint" ? value : BigInt(value.toString());
  if (asBig > BigInt(Number.MAX_SAFE_INTEGER) || asBig < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`timestamp/i64 exceeds JS safe integer: ${asBig.toString()}`);
  }
  return Number(asBig);
}

export function toBn(value: bigint | number | BN): BN {
  if (BN.isBN(value)) return value;
  if (typeof value === "bigint") {
    if (value < 0n) {
      return new BN(value.toString());
    }
    return new BN(value.toString(10));
  }
  if (!Number.isInteger(value)) {
    throw new Error(`non-integer BN conversion: ${value}`);
  }
  return new BN(value);
}

export function toPublicKey(value: PublicKey | string): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

export function toBytes32(value: Uint8Array | number[] | Buffer): Uint8Array {
  const arr =
    value instanceof Uint8Array
      ? value
      : Uint8Array.from(value as ArrayLike<number>);
  if (arr.length !== 32) {
    throw new Error(`expected 32 bytes, got ${arr.length}`);
  }
  return arr;
}

export function isTerminalStatus(status: ContractStatus): boolean {
  return (
    status === "Completed" ||
    status === "Declined" ||
    status === "Expired" ||
    status === "Cancelled" ||
    status === "ActivationRejected" ||
    status === "Disputed" ||
    status === "Resolved"
  );
}

export function allowsSettlementClaims(status: ContractStatus): boolean {
  return (
    status === "Cancelled" ||
    status === "Resolved" ||
    status === "Completed" ||
    status === "ActivationRejected"
  );
}

export function allowsTermChanges(status: ContractStatus): boolean {
  return status === "Draft";
}

export function trialConfig(contract: Pick<ContractView, "trialAmount">): TrialConfig {
  return {
    configured: contract.trialAmount > 0n,
    amount: contract.trialAmount,
  };
}

export function settlementView(contract: ContractView): SettlementView {
  return {
    totalAmount: contract.totalAmount,
    trialAmount: contract.trialAmount,
    mainAmount: contract.mainAmount,
    allocatedAmount: contract.allocatedAmount,
    releasedAmount: contract.releasedAmount,
    withdrawnAmount: contract.withdrawnAmount,
    refundedAmount: contract.refundedAmount,
    streamReleasedAmount: contract.streamReleasedAmount,
    freelancerSettlementAmount: contract.freelancerSettlementAmount,
    employerRefundableAmount: contract.employerRefundableAmount,
    contestedAmount: contract.contestedAmount,
  };
}
