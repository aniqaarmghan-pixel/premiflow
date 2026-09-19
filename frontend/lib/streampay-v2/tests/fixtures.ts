import { PublicKey } from "@solana/web3.js";

import { HOURLY_NO_ACTIVE_SESSION } from "../constants";
import type { ContractView, HourlySessionView, HourlyStateView, WorkUnitView } from "../types";

export const WALLET_A = new PublicKey("11111111111111111111111111111111");
export const WALLET_B = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const WALLET_C = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const RESOLVER = new PublicKey("SysvarRent111111111111111111111111111111111");

const ZERO32 = new Uint8Array(32);

export function makeContract(
  overrides: Partial<ContractView> = {}
): ContractView {
  return {
    address: WALLET_C,
    version: 1,
    employer: WALLET_A,
    freelancer: WALLET_B,
    tokenMint: MINT,
    contractId: 1n,
    paymentMode: "Fixed",
    status: "Active",
    startMode: "OnActivation",
    totalAmount: 100n,
    trialAmount: 0n,
    mainAmount: 100n,
    allocatedAmount: 100n,
    releasedAmount: 0n,
    withdrawnAmount: 0n,
    refundedAmount: 0n,
    streamReleasedAmount: 0n,
    freelancerSettlementAmount: 0n,
    employerRefundableAmount: 0n,
    resolver: RESOLVER,
    contestedAmount: 0n,
    disputedAt: 0,
    disputeInitiator: "None",
    acceptanceDeadline: 2_000_000_000,
    scheduledStartTime: 0,
    durationSeconds: 3_600,
    checkpointInterval: 0,
    reviewDuration: 600,
    activationReviewDuration: 3_600,
    maxRevisions: 2,
    startTime: 1_700_000_000,
    endTime: 1_700_003_600,
    lastPeriodEnd: 0,
    createdAt: 1_699_000_000,
    acceptedAt: 1_699_500_000,
    completedAt: 0,
    terminatedAt: 0,
    workUnitCount: 1,
    releasedUnitCount: 0,
    voidedUnitCount: 0,
    openReviewCount: 0,
    lastMilestoneDueOffset: 0,
    metadataHash: ZERO32,
    bump: 255,
    escrowBump: 254,
    metadataUri: "memory:1",
    ...overrides,
  };
}

export function makeWorkUnit(
  overrides: Partial<WorkUnitView> = {}
): WorkUnitView {
  return {
    address: WALLET_C,
    version: 1,
    contract: WALLET_C,
    index: 0,
    kind: "Fixed",
    status: "Defined",
    amount: 100n,
    periodStart: 0,
    periodEnd: 0,
    dueOffsetSeconds: 3_600,
    submittedAt: 0,
    actionDeadline: 0,
    approvedAt: 0,
    releasedAt: 0,
    revisionCount: 0,
    releaseTrigger: "NotReleased",
    submissionHash: ZERO32,
    bump: 253,
    submissionUri: "",
    ...overrides,
  };
}

export function makeHourlyState(
  overrides: Partial<HourlyStateView> = {}
): HourlyStateView {
  return {
    address: WALLET_C,
    version: 1,
    contract: WALLET_C,
    hourlyRate: 10_000_000n,
    authorizedSeconds: 28_800n,
    approvedSeconds: 0n,
    sessionCount: 0,
    activeSessionIndex: HOURLY_NO_ACTIVE_SESSION,
    maxSessionSeconds: 28_800n,
    minSessionSeconds: 60n,
    bump: 250,
    ...overrides,
  };
}

export function makeHourlySession(
  overrides: Partial<HourlySessionView> = {}
): HourlySessionView {
  return {
    address: WALLET_C,
    version: 1,
    contract: WALLET_C,
    index: 0,
    startedAt: 1_700_000_100,
    stoppedAt: 0,
    durationSeconds: 0n,
    status: "Open",
    workLogHash: ZERO32,
    bump: 249,
    workLogUri: "",
    ...overrides,
  };
}
