import assert from "node:assert/strict";
import test from "node:test";

import {
  TransactionConfirmationUnknownError,
  TransactionFailedOnChainError,
} from "../confirm";
import { parseClientError } from "../errors";
import { TransactionExpiredBeforeSubmitError } from "../send";
import { toCreateContractArgs } from "../instructions";
import type { CreateContractRequest } from "../types";
import { RESOLVER, makeContract } from "./fixtures";
import { decodeContract } from "../accounts";
import { BN } from "@coral-xyz/anchor";

const SIG =
  "xu1VLVJ6sQJKFpPhJHS6M6d91M1AgEHXqpAFPXFbC6fAPM3SPQZFNBKruZZtk3kELVW1pppPMyf1eAcM8hDZ6DT";

test("create-contract request maps to current CreateContractArgs fields only", () => {
  const request: CreateContractRequest = {
    contractId: 9n,
    paymentMode: "Milestone",
    startMode: "Scheduled",
    totalAmount: 1_000n,
    acceptanceDeadline: 1_800_000_000,
    scheduledStartTime: 1_800_003_600,
    durationSeconds: 86_400,
    checkpointInterval: 0,
    reviewDuration: 600,
    activationReviewDuration: 3_600,
    maxRevisions: 2,
    trialAmount: 50n,
    resolver: RESOLVER,
    metadataUri: "memory:job/1",
    metadataHash: new Uint8Array(32),
  };
  const args = toCreateContractArgs(request);
  assert.deepEqual(Object.keys(args).sort(), [
    "acceptanceDeadline",
    "activationReviewDuration",
    "checkpointInterval",
    "contractId",
    "durationSeconds",
    "maxRevisions",
    "metadataHash",
    "metadataUri",
    "paymentMode",
    "resolver",
    "reviewDuration",
    "scheduledStartTime",
    "startMode",
    "totalAmount",
    "trialAmount",
  ]);
  assert.equal(args.metadataUri, "memory:job/1");
  assert.deepEqual(args.paymentMode, { milestone: {} });
});

test("error parser maps StreamPayV2Error codes and wallet rejection", () => {
  const mapped = parseClientError({
    message: "AnchorError thrown. Error Code: InvalidState. Error Number: 6111.",
  });
  assert.equal(mapped.kind, "streampay_v2");
  assert.equal(mapped.code, 6111);
  assert.equal(
    mapped.uiMessage,
    "The contract is not in the required state for this operation."
  );

  const rejected = parseClientError({ message: "User rejected the request", code: 4001 });
  assert.equal(rejected.kind, "wallet_rejected");

  const missing = parseClientError({
    message: "failed to simulate: AccountNotInitialized",
  });
  assert.equal(missing.kind, "missing_ata");

  const blockhash = parseClientError({
    message: "Simulation failed. \nMessage: Transaction simulation failed: Blockhash not found. \nLogs: [].",
    transactionMessage: "Transaction simulation failed: Blockhash not found",
  });
  assert.equal(blockhash.kind, "simulation");
  assert.equal(
    blockhash.uiMessage,
    "Transaction simulation failed: Blockhash not found"
  );

  const pending = parseClientError(
    new TransactionConfirmationUnknownError(SIG, "timeout")
  );
  assert.equal(pending.kind, "pending_confirmation");
  assert.equal(pending.signature, SIG);
  assert.match(pending.uiMessage, /do not retry yet/i);
  assert.match(pending.uiMessage, /may still complete on-chain/i);

  const onChain = parseClientError(
    new TransactionFailedOnChainError(SIG, {
      InstructionError: [0, { Custom: 6111 }],
    })
  );
  assert.equal(onChain.kind, "streampay_v2");
  assert.equal(onChain.code, 6111);
  assert.equal(onChain.signature, SIG);

  const expired = parseClientError(
    new TransactionExpiredBeforeSubmitError("fetchedHash", "signedHash", 0, {
      signWaitMs: 0,
      lastValidBlockHeight: 0,
      fetchedBlockHeight: null,
      postSignBlockHeight: null,
      remainingValidBlocks: 0,
      isBlockhashValid: false,
    })
  );
  assert.equal(expired.kind, "expired_before_submit");
  assert.match(expired.uiMessage, /nothing was submitted/i);
  assert.doesNotMatch(expired.uiMessage, /may still have landed/i);
});

test("contract decode converts Anchor BN/enum representation", () => {
  const fixture = makeContract();
  const decoded = decodeContract(fixture.address, {
    version: 1,
    employer: fixture.employer,
    freelancer: fixture.freelancer,
    tokenMint: fixture.tokenMint,
    contractId: new BN("1"),
    paymentMode: { fixed: {} },
    status: { active: {} },
    startMode: { onActivation: {} },
    totalAmount: new BN(100),
    trialAmount: new BN(0),
    mainAmount: new BN(100),
    allocatedAmount: new BN(100),
    releasedAmount: new BN(0),
    withdrawnAmount: new BN(0),
    refundedAmount: new BN(0),
    streamReleasedAmount: new BN(0),
    freelancerSettlementAmount: new BN(0),
    employerRefundableAmount: new BN(0),
    resolver: fixture.resolver,
    contestedAmount: new BN(0),
    disputedAt: new BN(0),
    disputeInitiator: { none: {} },
    acceptanceDeadline: new BN(2_000_000_000),
    scheduledStartTime: new BN(0),
    durationSeconds: new BN(3_600),
    checkpointInterval: new BN(0),
    reviewDuration: new BN(600),
    activationReviewDuration: new BN(3_600),
    maxRevisions: 2,
    startTime: new BN(1_700_000_000),
    endTime: new BN(1_700_003_600),
    lastPeriodEnd: new BN(0),
    createdAt: new BN(1_699_000_000),
    acceptedAt: new BN(1_699_500_000),
    completedAt: new BN(0),
    terminatedAt: new BN(0),
    workUnitCount: 1,
    releasedUnitCount: 0,
    voidedUnitCount: 0,
    openReviewCount: 0,
    lastMilestoneDueOffset: new BN(0),
    metadataHash: Array.from({ length: 32 }, () => 0),
    bump: 255,
    escrowBump: 254,
    metadataUri: "memory:1",
  });
  assert.equal(decoded.status, "Active");
  assert.equal(decoded.paymentMode, "Fixed");
  assert.equal(decoded.totalAmount, 100n);
  assert.equal(decoded.contractId, 1n);
});
