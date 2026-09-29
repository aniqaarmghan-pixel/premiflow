import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import {
  isDefinitelyUnsentError,
  releaseUnsentCreateAttempt,
} from "../create-attempt-recovery";
import { createPageView, nextWizardOwner } from "../create-page-gate";
import {
  decideDiscard,
  ensureCreateIntent,
  loadCreateIntent,
  markCreateAttempted,
  saveCreateIntent,
  touchCreateActivity,
  type CreateIntent,
  type CreateIntentTerms,
  type IntentScope,
  type IntentStorage,
  type StandardCreateIntentRequest,
} from "../milestone-create-plan";
import {
  TransactionConfirmationUnknownError,
  TransactionFailedOnChainError,
} from "../../streampay-v2/confirm";
import { deriveContractPda } from "../../streampay-v2/pda";
import { TransactionExpiredBeforeSubmitError } from "../../streampay-v2/send";
import { MINT, RESOLVER, WALLET_A, WALLET_B, WALLET_C } from "../../streampay-v2/tests/fixtures";

const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const PROGRAM = new PublicKey("EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd");
const SCOPE: IntentScope = { cluster: "devnet", programId: PROGRAM.toBase58() };
const SIG =
  "xu1VLVJ6sQJKFpPhJHS6M6d91M1AgEHXqpAFPXFbC6fAPM3SPQZFNBKruZZtk3kELVW1pppPMyf1eAcM8hDZ6DT";
const HASH = WALLET_C.toBase58();

const derive = (employer: string, freelancer: string, id: bigint) =>
  deriveContractPda(new PublicKey(employer), new PublicKey(freelancer), id, PROGRAM).address.toBase58();

function terms(overrides: Partial<StandardCreateIntentRequest> = {}): CreateIntentTerms {
  const request: StandardCreateIntentRequest = {
    kind: "standard",
    paymentMode: "Milestone",
    startMode: "OnActivation",
    totalAmount: "100000000",
    acceptanceDeadline: 2_000_000_000,
    scheduledStartTime: 0,
    durationSeconds: 86_400,
    checkpointInterval: 0,
    reviewDuration: 3_600,
    activationReviewDuration: 3_600,
    maxRevisions: 2,
    trialAmount: "0",
    resolver: RESOLVER.toBase58(),
    metadataUri: "local:abcd",
    metadataHashHex: "ab".repeat(32),
    ...overrides,
  };
  return {
    employer: EMPLOYER,
    freelancer: FREELANCER,
    tokenMint: MINT.toBase58(),
    paymentMode: "Milestone",
    totalAmount: request.totalAmount,
    trialAmount: request.trialAmount,
    milestones: [
      { amount: "30000000", dueOffsetSeconds: 1_800 },
      { amount: "30000000", dueOffsetSeconds: 3_600 },
      { amount: "40000000", dueOffsetSeconds: 7_200 },
    ],
    request,
  };
}

function freshIntent(): CreateIntent {
  const result = ensureCreateIntent({
    terms: terms(),
    saved: null,
    scope: SCOPE,
    newContractId: () => 42n,
    deriveAddress: derive,
    now: 1,
  });
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") throw new Error("unreachable");
  return result.intent;
}

function memoryStorage(): IntentStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const expiredBeforeSubmit = () =>
  new TransactionExpiredBeforeSubmitError(HASH, HASH, 0, {
    signWaitMs: 75_000,
    lastValidBlockHeight: 1_150,
    fetchedBlockHeight: null,
    postSignBlockHeight: 1_150,
    remainingValidBlocks: 0,
    isBlockhashValid: false,
  });
const walletRejected = () =>
  Object.assign(new Error("User rejected the request."), { name: "WalletSignTransactionError" });
const code4001 = () => Object.assign(new Error("Request rejected"), { code: 4001 });

const UNSENT: Array<[string, () => unknown]> = [
  ["expired before submit", expiredBeforeSubmit],
  ["wallet rejection", walletRejected],
  ["wallet code 4001", code4001],
];

const AMBIGUOUS: Array<[string, () => unknown]> = [
  ["confirmation unknown (timeout)", () => new TransactionConfirmationUnknownError(SIG, "timeout")],
  ["confirmation unknown (rpc error)", () => new TransactionConfirmationUnknownError(SIG, "rpc_error", "503")],
  ["failed on-chain", () => new TransactionFailedOnChainError(SIG, { InstructionError: [0, { Custom: 6000 }] })],
  [
    "confirmation timeout",
    () =>
      Object.assign(new Error(`Transaction was not confirmed in 30.00 seconds. Check signature ${SIG}`), {
        name: "TransactionExpiredTimeoutError",
      }),
  ],
  ["generic error", () => new Error("boom")],
  ["network error after send", () => new TypeError("Failed to fetch")],
  ["4001 carrying a signature", () => Object.assign(new Error("odd"), { code: 4001, signature: SIG })],
  ["null", () => null],
  ["string", () => "User rejected the request"],
];

function settledAttempt(before: CreateIntent): CreateIntent {
  return touchCreateActivity(markCreateAttempted(before, 5_000), 80_000);
}

test("wallet refusal and expired-before-submit are definitely unsent", () => {
  for (const [label, make] of UNSENT) {
    assert.equal(isDefinitelyUnsentError(make()), true, label);
  }
});

test("ambiguous or possibly-sent errors are not unsent", () => {
  for (const [label, make] of AMBIGUOUS) {
    assert.equal(isDefinitelyUnsentError(make()), false, label);
  }
});

test("an unsent fresh attempt is released: Discard allowed at once and edits are accepted", () => {
  for (const [label, make] of UNSENT) {
    const before = freshIntent();
    const settled = settledAttempt(before);
    assert.equal(settled.createAttempted, true);

    // Without release the lock blocks Discard and rejects edited terms.
    const lockedDiscard = decideDiscard({ intent: settled, txPhase: "ready", chain: "absent", nowMs: 80_001 });
    assert.equal(lockedDiscard.allowed, false, label);
    const lockedEdit = ensureCreateIntent({
      terms: terms({ acceptanceDeadline: 2_000_000_600 }),
      saved: settled,
      scope: SCOPE,
      newContractId: () => 99n,
      deriveAddress: derive,
      now: 80_001,
    });
    assert.equal(lockedEdit.kind, "conflict", label);

    const released = releaseUnsentCreateAttempt(before, settled, make(), 80_001);
    assert.equal(released.createAttempted, false, label);
    assert.equal(released.createActivityAt, before.createActivityAt, label);
    assert.equal(released.contractId, before.contractId, label);
    assert.equal(released.contractAddress, before.contractAddress, label);
    assert.equal(released.fingerprint, before.fingerprint, label);

    assert.deepEqual(
      decideDiscard({ intent: released, txPhase: "ready", chain: "absent", nowMs: 80_002 }),
      { allowed: true, contractExists: false },
      label
    );
    const edited = ensureCreateIntent({
      terms: terms({ acceptanceDeadline: 2_000_000_600 }),
      saved: released,
      scope: SCOPE,
      newContractId: () => 99n,
      deriveAddress: derive,
      now: 80_002,
    });
    assert.equal(edited.kind, "ready", label);
    const same = ensureCreateIntent({
      terms: terms(),
      saved: released,
      scope: SCOPE,
      newContractId: () => 99n,
      deriveAddress: derive,
      now: 80_002,
    });
    assert.equal(same.kind, "ready", label);
    if (same.kind === "ready") assert.equal(same.intent.contractId, before.contractId, label);
  }
});

test("ambiguous errors keep the attempt locked", () => {
  for (const [label, make] of AMBIGUOUS) {
    const before = freshIntent();
    const settled = settledAttempt(before);
    const result = releaseUnsentCreateAttempt(before, settled, make(), 80_001);
    assert.equal(result, settled, label);
    assert.equal(result.createAttempted, true, label);
  }
});

test("a setup that was already attempted before this click stays locked", () => {
  const locked = markCreateAttempted(freshIntent(), 1_000);
  const settled = touchCreateActivity(markCreateAttempted(locked, 5_000), 80_000);
  for (const [label, make] of UNSENT) {
    const result = releaseUnsentCreateAttempt(locked, settled, make(), 80_001);
    assert.equal(result, settled, label);
    assert.equal(result.createAttempted, true, label);
  }
});

test("a successful send (no error) leaves the intent unchanged", () => {
  const before = freshIntent();
  const settled = settledAttempt(before);
  assert.equal(releaseUnsentCreateAttempt(before, settled, null, 80_001), settled);
});

test("a different contract or terms is never released", () => {
  const before = freshIntent();
  const other = { ...settledAttempt(before), contractId: "43" };
  assert.equal(releaseUnsentCreateAttempt(before, other, expiredBeforeSubmit(), 80_001), other);
});

test("a released intent round-trips through storage as unlocked", () => {
  const storage = memoryStorage();
  const before = freshIntent();
  const released = releaseUnsentCreateAttempt(before, settledAttempt(before), walletRejected(), 80_001);
  saveCreateIntent(storage, released);
  const loaded = loadCreateIntent(storage, SCOPE, EMPLOYER, derive);
  assert.equal(loaded.kind, "ready");
  if (loaded.kind === "ready") {
    assert.equal(loaded.intent.createAttempted, false);
    assert.equal(loaded.intent.contractId, before.contractId);
  }
});

test("create page gate keeps a started wizard mounted but hidden while disconnected", () => {
  assert.deepEqual(createPageView({ connected: false, wizardStarted: false }), {
    mountWizard: false,
    showWizard: false,
    showConnectPrompt: true,
  });
  assert.deepEqual(createPageView({ connected: true, wizardStarted: true }), {
    mountWizard: true,
    showWizard: true,
    showConnectPrompt: false,
  });
  assert.deepEqual(createPageView({ connected: false, wizardStarted: true }), {
    mountWizard: true,
    showWizard: false,
    showConnectPrompt: true,
  });
});

test("wizard owner follows the connected wallet and survives a disconnect", () => {
  const A = WALLET_A.toBase58();
  const B = WALLET_B.toBase58();
  assert.equal(nextWizardOwner(null, false, null), null);
  assert.equal(nextWizardOwner(null, true, A), A);
  assert.equal(nextWizardOwner(A, false, null), A);
  assert.equal(nextWizardOwner(A, true, null), A);
  assert.equal(nextWizardOwner(A, true, A), A);
  assert.equal(nextWizardOwner(A, true, B), B);
});

test("create page and wizard are wired to the gate and the release helper", () => {
  const page = readFileSync(join(process.cwd(), "app/create/page.tsx"), "utf8");
  assert.equal(page.includes("connected ? <CreateWizard /> : <ConnectPrompt />"), false);
  assert.match(page, /createPageView\(/);
  assert.match(page, /nextWizardOwner\(/);
  assert.match(page, /hidden=\{!view\.showWizard\}/);
  assert.match(page, /<CreateWizard key=\{owner\} \/>/);
  const wizard = readFileSync(join(process.cwd(), "components/create/CreateWizard.tsx"), "utf8");
  assert.match(wizard, /const beforeAttempt = intent;\n\s+intent = markCreateAttempted\(intent, Date\.now\(\)\);/);
  assert.match(wizard, /sendError = err;\n\s+throw err;/);
  assert.match(wizard, /releaseUnsentCreateAttempt\(beforeAttempt, settled, sendError, Date\.now\(\)\)/);
});
