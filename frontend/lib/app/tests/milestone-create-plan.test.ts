import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import {
  CORRUPT_INTENT_MESSAGE,
  CREATE_LANDING_WINDOW_MS,
  CREATE_SEND_OFFER_LABEL,
  PENDING_RECONCILIATION_MESSAGE,
  bytesToHex,
  canResumeCreateSetup,
  clearCreateIntent,
  createIntentStorageKey,
  createProgressLines,
  createRunLock,
  createStepNote,
  decideDiscard,
  ensureCreateIntent,
  hexToBytes,
  isCreateTxInFlight,
  loadCreateIntent,
  markCreateAttempted,
  needsTxResetBeforeResume,
  planNextCreateStep,
  runCreateSetup,
  saveCreateIntent,
  toCreateContractRequest,
  toCreateHourlyContractRequest,
  type CreateIntent,
  type CreateIntentTerms,
  type CreateSetupDeps,
  type HourlyCreateIntentRequest,
  type IntentScope,
  type IntentStorage,
  type ObservedContract,
  type ObservedCreateState,
  type ObservedHourlyState,
  type ObservedWorkUnit,
  type StandardCreateIntentRequest,
} from "../milestone-create-plan";
import { availableActions } from "../../streampay-v2/actions";
import { deriveContractPda } from "../../streampay-v2/pda";
import type { ContractStatus } from "../../streampay-v2/types";
import {
  MINT,
  RESOLVER,
  WALLET_A,
  WALLET_B,
  WALLET_C,
  makeContract,
  makeWorkUnit,
} from "../../streampay-v2/tests/fixtures";

const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const NOW = 1_800_000_000;
const DEADLINE = 2_000_000_000;
const PROGRAM = new PublicKey("EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd");
const SCOPE: IntentScope = { cluster: "devnet", programId: PROGRAM.toBase58() };

const derive = (employer: string, freelancer: string, id: bigint) =>
  deriveContractPda(new PublicKey(employer), new PublicKey(freelancer), id, PROGRAM).address.toBase58();

const DEFAULT_MILESTONES = [
  { amount: "30000000", dueOffsetSeconds: 1_800 },
  { amount: "30000000", dueOffsetSeconds: 3_600 },
  { amount: "40000000", dueOffsetSeconds: 7_200 },
];

function standardTerms(
  mode: StandardCreateIntentRequest["paymentMode"],
  requestOverrides: Partial<StandardCreateIntentRequest> = {},
  milestones = mode === "Milestone" ? DEFAULT_MILESTONES : [],
  termOverrides: Partial<CreateIntentTerms> = {}
): CreateIntentTerms {
  const request: StandardCreateIntentRequest = {
    kind: "standard",
    paymentMode: mode,
    startMode: "OnActivation",
    totalAmount: "100000000",
    acceptanceDeadline: DEADLINE,
    scheduledStartTime: 0,
    durationSeconds: 86_400,
    checkpointInterval: mode === "Streaming" ? 3_600 : 0,
    reviewDuration: 3_600,
    activationReviewDuration: 3_600,
    maxRevisions: 2,
    trialAmount: "0",
    resolver: RESOLVER.toBase58(),
    metadataUri: "local:abcd",
    metadataHashHex: "ab".repeat(32),
    ...requestOverrides,
  };
  return {
    employer: EMPLOYER,
    freelancer: FREELANCER,
    tokenMint: MINT.toBase58(),
    paymentMode: mode,
    totalAmount: request.totalAmount,
    trialAmount: request.trialAmount,
    milestones,
    request,
    ...termOverrides,
  };
}

const milestoneTerms = (
  requestOverrides: Partial<StandardCreateIntentRequest> = {},
  milestones = DEFAULT_MILESTONES,
  termOverrides: Partial<CreateIntentTerms> = {}
) => standardTerms("Milestone", requestOverrides, milestones, termOverrides);

function hourlyTerms(overrides: Partial<HourlyCreateIntentRequest> = {}): CreateIntentTerms {
  const request: HourlyCreateIntentRequest = {
    kind: "hourly",
    hourlyRate: "25000000",
    authorizedSeconds: "36000",
    acceptanceDeadline: DEADLINE,
    durationSeconds: 604_800,
    reviewDuration: 3_600,
    activationReviewDuration: 3_600,
    maxRevisions: 2,
    trialAmount: "0",
    resolver: RESOLVER.toBase58(),
    metadataUri: "local:beef",
    metadataHashHex: "cd".repeat(32),
    ...overrides,
  };
  return {
    employer: EMPLOYER,
    freelancer: FREELANCER,
    tokenMint: MINT.toBase58(),
    paymentMode: "Hourly",
    totalAmount: null,
    trialAmount: request.trialAmount,
    milestones: [],
    request,
  };
}

function freshIntent(terms = milestoneTerms(), id = 42n): CreateIntent {
  const result = ensureCreateIntent({
    terms,
    saved: null,
    scope: SCOPE,
    newContractId: () => id,
    deriveAddress: derive,
    now: 1,
  });
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") throw new Error("unreachable");
  return result.intent;
}

const attempted = (intent: CreateIntent, atMs = 1_000) => markCreateAttempted(intent, atMs);

/** A contract exactly as the program would store it for this intent. */
function matchingContract(
  intent: CreateIntent,
  overrides: Partial<ObservedContract> = {}
): ObservedContract {
  const r = intent.request;
  const standard = r.kind === "standard";
  const base = makeContract({
    employer: new PublicKey(intent.employer),
    freelancer: new PublicKey(intent.freelancer),
    tokenMint: new PublicKey(intent.tokenMint),
    contractId: BigInt(intent.contractId),
    paymentMode: intent.paymentMode,
    status: intent.paymentMode === "Milestone" ? "Draft" : "PendingAcceptance",
    startMode: standard ? r.startMode : "OnActivation",
    // Hourly total is program-derived (rate × time + trial); any value is fine here.
    totalAmount: standard ? BigInt(r.totalAmount) : 250_000_000n,
    trialAmount: BigInt(intent.trialAmount),
    workUnitCount: intent.paymentMode === "Fixed" ? 1 : 0,
    acceptanceDeadline: r.acceptanceDeadline,
    scheduledStartTime: standard && r.startMode === "Scheduled" ? r.scheduledStartTime : 0,
    durationSeconds: r.durationSeconds,
    checkpointInterval: standard && r.paymentMode === "Streaming" ? r.checkpointInterval : 0,
    reviewDuration: r.reviewDuration,
    activationReviewDuration: r.activationReviewDuration,
    maxRevisions: r.maxRevisions,
    resolver: new PublicKey(r.resolver),
    metadataUri: r.metadataUri,
    metadataHash: hexToBytes(r.metadataHashHex),
  });
  return { ...base, ...overrides };
}

function hourlyStateFor(
  intent: CreateIntent,
  overrides: Partial<ObservedHourlyState> = {}
): ObservedHourlyState {
  const r = intent.request;
  assert.equal(r.kind, "hourly");
  if (r.kind !== "hourly") throw new Error("unreachable");
  return {
    contract: new PublicKey(intent.contractAddress),
    hourlyRate: BigInt(r.hourlyRate),
    authorizedSeconds: BigInt(r.authorizedSeconds),
    ...overrides,
  };
}

function unitsFor(intent: CreateIntent, count: number): ObservedWorkUnit[] {
  return intent.milestones.slice(0, count).map((m, index) =>
    makeWorkUnit({
      index,
      kind: "Milestone",
      amount: BigInt(m.amount),
      dueOffsetSeconds: m.dueOffsetSeconds,
    })
  );
}

function observedWith(
  intent: CreateIntent,
  count: number,
  overrides: Partial<ObservedContract> = {}
): ObservedCreateState {
  return {
    contract: matchingContract(intent, { workUnitCount: count, ...overrides }),
    workUnits: unitsFor(intent, count),
  };
}

function memoryStorage() {
  const map = new Map<string, string>();
  const storage: IntentStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { map, storage };
}

const TERMINAL: ContractStatus[] = [
  "Expired",
  "Declined",
  "Cancelled",
  "ActivationRejected",
  "Disputed",
  "Resolved",
];

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

test("planner: no contract on-chain → create", () => {
  const intent = freshIntent();
  const plan = planNextCreateStep(intent, { contract: null, workUnits: [] }, NOW);
  assert.deepEqual(plan.step, { kind: "create" });
  assert.equal(plan.progress.contractExists, false);
  assert.equal(plan.progress.milestonesTotal, 3);
  assert.equal(plan.progress.contractAddress, intent.contractAddress);
});

test("planner: no contract and acceptance deadline passed → conflict, never create", () => {
  const intent = freshIntent();
  const plan = planNextCreateStep(intent, { contract: null, workUnits: [] }, DEADLINE);
  assert.equal(plan.step.kind === "conflict" && plan.step.reason, "acceptance_expired");
});

test("planner: contract exists with zero milestones → resume at milestone 0", () => {
  const intent = freshIntent();
  const plan = planNextCreateStep(intent, observedWith(intent, 0), NOW);
  assert.deepEqual(plan.step, {
    kind: "addMilestone",
    index: 0,
    amount: 30_000_000n,
    dueOffsetSeconds: 1_800,
  });
  assert.equal(plan.progress.status, "Draft");
});

test("planner: k of M matching milestones → next missing index only", () => {
  const intent = freshIntent();
  const plan = planNextCreateStep(intent, observedWith(intent, 2), NOW);
  assert.deepEqual(plan.step, {
    kind: "addMilestone",
    index: 2,
    amount: 40_000_000n,
    dueOffsetSeconds: 7_200,
  });
  assert.deepEqual(createProgressLines(plan.progress), [
    "Contract created",
    "2 of 3 milestones completed",
  ]);
});

test("planner: all milestones exist and contract is Draft → finalize only", () => {
  const intent = freshIntent();
  const plan = planNextCreateStep(intent, observedWith(intent, 3), NOW);
  assert.deepEqual(plan.step, { kind: "finalize" });
  assert.equal(plan.progress.milestonesDone, 3);
});

test("planner: live offer states with all milestones → complete, no finalize", () => {
  const intent = freshIntent();
  for (const status of ["PendingAcceptance", "PendingEmployerApproval", "Active", "Completed"] as const) {
    const plan = planNextCreateStep(intent, observedWith(intent, 3, { status }), NOW);
    assert.deepEqual(plan.step, { kind: "complete" }, status);
  }
});

test("planner: Expired / Declined / Cancelled / other terminal statuses never complete (every mode)", () => {
  const milestone = freshIntent();
  const fixed = freshIntent(standardTerms("Fixed"));
  const streaming = freshIntent(standardTerms("Streaming"));
  const hourly = freshIntent(hourlyTerms());
  for (const status of TERMINAL) {
    const m = planNextCreateStep(milestone, observedWith(milestone, 3, { status }), NOW);
    assert.equal(m.step.kind === "conflict" && m.step.reason, "not_live", `Milestone ${status}`);
    assert.ok(createProgressLines(m.progress).includes(`Contract status: ${status}`));
    for (const intent of [fixed, streaming]) {
      const plan = planNextCreateStep(
        intent,
        { contract: matchingContract(intent, { status }), workUnits: [] },
        NOW
      );
      assert.equal(plan.step.kind === "conflict" && plan.step.reason, "not_live", `${intent.paymentMode} ${status}`);
    }
    const h = planNextCreateStep(
      hourly,
      { contract: matchingContract(hourly, { status }), workUnits: [], hourly: hourlyStateFor(hourly) },
      NOW
    );
    assert.equal(h.step.kind === "conflict" && h.step.reason, "not_live", `Hourly ${status}`);
  }
});

test("planner: existing milestone amount or due offset mismatch → conflict", () => {
  const intent = freshIntent();
  const wrongAmount = observedWith(intent, 2);
  wrongAmount.workUnits[1] = makeWorkUnit({
    index: 1,
    kind: "Milestone",
    amount: 29_000_000n,
    dueOffsetSeconds: 3_600,
  });
  const a = planNextCreateStep(intent, wrongAmount, NOW);
  assert.equal(a.step.kind === "conflict" && a.step.reason, "milestone_mismatch");
  assert.equal(a.progress.milestonesDone, 1);

  const wrongDue = observedWith(intent, 1);
  wrongDue.workUnits[0] = makeWorkUnit({
    index: 0,
    kind: "Milestone",
    amount: 30_000_000n,
    dueOffsetSeconds: 1_801,
  });
  const b = planNextCreateStep(intent, wrongDue, NOW);
  assert.equal(b.step.kind === "conflict" && b.step.reason, "milestone_mismatch");

  const missing = observedWith(intent, 2);
  missing.workUnits[1] = null;
  const c = planNextCreateStep(intent, missing, NOW);
  assert.equal(c.step.kind === "conflict" && c.step.reason, "milestone_unreadable");
});

test("planner: on-chain milestone count greater than saved setup → conflict, never append", () => {
  const intent = freshIntent();
  const observed = observedWith(intent, 3, { workUnitCount: 4 });
  observed.workUnits.push(
    makeWorkUnit({ index: 3, kind: "Milestone", amount: 1n, dueOffsetSeconds: 9_000 })
  );
  const plan = planNextCreateStep(intent, observed, NOW);
  assert.equal(plan.step.kind === "conflict" && plan.step.reason, "extra_milestones");
});

test("planner: every material on-chain term is verified → mismatch is a conflict", () => {
  const intent = freshIntent(
    standardTerms("Streaming", { startMode: "Scheduled", scheduledStartTime: DEADLINE + 60 })
  );
  assert.deepEqual(
    planNextCreateStep(intent, { contract: matchingContract(intent), workUnits: [] }, NOW).step,
    { kind: "complete" }
  );
  const cases: Array<[string, Partial<ObservedContract>]> = [
    ["employer", { employer: WALLET_C }],
    ["freelancer", { freelancer: WALLET_C }],
    ["token", { tokenMint: WALLET_C }],
    ["contract ID", { contractId: 7n }],
    ["contract type", { paymentMode: "Fixed" }],
    ["trial amount", { trialAmount: 5n }],
    ["total amount", { totalAmount: 99_000_000n }],
    ["acceptance deadline", { acceptanceDeadline: DEADLINE - 1 }],
    ["duration", { durationSeconds: 86_401 }],
    ["start mode", { startMode: "OnActivation" }],
    ["scheduled start", { scheduledStartTime: DEADLINE + 61 }],
    ["checkpoint interval", { checkpointInterval: 1_800 }],
    ["review window", { reviewDuration: 60 }],
    ["activation review window", { activationReviewDuration: 60 }],
    ["revision limit", { maxRevisions: 3 }],
    ["resolver", { resolver: WALLET_C }],
    ["metadata URI", { metadataUri: "local:other" }],
    ["metadata hash", { metadataHash: hexToBytes("ac".repeat(32)) }],
  ];
  for (const [field, overrides] of cases) {
    const plan = planNextCreateStep(
      intent,
      { contract: matchingContract(intent, overrides), workUnits: [] },
      NOW
    );
    assert.equal(plan.step.kind === "conflict" && plan.step.reason, "terms_mismatch", field);
    assert.match(plan.step.kind === "conflict" ? plan.step.message : "", new RegExp(field), field);
  }
});

test("planner: program-normalized fields (OnActivation start, non-Streaming interval) do not cause false conflicts", () => {
  // The request carries values the program ignores for this mode; it stores 0 for both.
  const fixed = freshIntent(standardTerms("Fixed", { scheduledStartTime: 123, checkpointInterval: 600 }));
  const onChain = matchingContract(fixed);
  assert.equal(onChain.scheduledStartTime, 0);
  assert.equal(onChain.checkpointInterval, 0);
  assert.deepEqual(
    planNextCreateStep(fixed, { contract: onChain, workUnits: [] }, NOW).step,
    { kind: "complete" }
  );
  // Real decoded account: BN-decoded bigint/number fields and a Buffer hash.
  const decodedLike = {
    ...onChain,
    metadataHash: Buffer.from(hexToBytes((fixed.request as StandardCreateIntentRequest).metadataHashHex)),
  };
  assert.deepEqual(
    planNextCreateStep(fixed, { contract: decodedLike, workUnits: [] }, NOW).step,
    { kind: "complete" }
  );
});

test("planner: expired Draft or non-Draft live contract with missing milestones → conflict", () => {
  const intent = freshIntent();
  const expired = planNextCreateStep(intent, observedWith(intent, 1), DEADLINE);
  assert.equal(expired.step.kind === "conflict" && expired.step.reason, "acceptance_expired");
  const pending = planNextCreateStep(
    intent,
    observedWith(intent, 1, { status: "PendingAcceptance" }),
    NOW
  );
  assert.equal(pending.step.kind === "conflict" && pending.step.reason, "not_draft");
  const cancelled = planNextCreateStep(
    intent,
    observedWith(intent, 1, { status: "Cancelled" }),
    NOW
  );
  assert.equal(cancelled.step.kind === "conflict" && cancelled.step.reason, "not_live");
});

test("planner: Hourly verifies rate and authorized time from the hourly state", () => {
  const intent = freshIntent(hourlyTerms());
  const contract = matchingContract(intent);
  const ok = planNextCreateStep(
    intent,
    { contract, workUnits: [], hourly: hourlyStateFor(intent) },
    NOW
  );
  assert.deepEqual(ok.step, { kind: "complete" });

  const rate = planNextCreateStep(
    intent,
    { contract, workUnits: [], hourly: hourlyStateFor(intent, { hourlyRate: 20_000_000n }) },
    NOW
  );
  assert.equal(rate.step.kind === "conflict" && rate.step.reason, "terms_mismatch");
  assert.match(rate.step.kind === "conflict" ? rate.step.message : "", /hourly rate/);

  const time = planNextCreateStep(
    intent,
    { contract, workUnits: [], hourly: hourlyStateFor(intent, { authorizedSeconds: 7_200n }) },
    NOW
  );
  assert.match(time.step.kind === "conflict" ? time.step.message : "", /authorized time/);

  const otherAccount = planNextCreateStep(
    intent,
    { contract, workUnits: [], hourly: hourlyStateFor(intent, { contract: WALLET_C }) },
    NOW
  );
  assert.equal(otherAccount.step.kind === "conflict" && otherAccount.step.reason, "terms_mismatch");

  // Hourly state not readable → never "complete".
  for (const hourly of [null, undefined]) {
    const plan = planNextCreateStep(intent, { contract, workUnits: [], hourly }, NOW);
    assert.equal(plan.step.kind === "conflict" && plan.step.reason, "terms_unverified");
  }
  // Hourly contracts are always OnActivation / unscheduled / no checkpoints.
  const scheduled = planNextCreateStep(
    intent,
    { contract: matchingContract(intent, { scheduledStartTime: 5 }), workUnits: [], hourly: hourlyStateFor(intent) },
    NOW
  );
  assert.equal(scheduled.step.kind === "conflict" && scheduled.step.reason, "terms_mismatch");
});

// ---------------------------------------------------------------------------
// Stable, immutable intent
// ---------------------------------------------------------------------------

test("stable contract ID: retry after failure or unknown confirmation reuses the saved ID", () => {
  let generated = 0;
  const newId = () => {
    generated += 1;
    return 1_000n + BigInt(generated);
  };
  const first = ensureCreateIntent({
    terms: milestoneTerms(),
    saved: null,
    scope: SCOPE,
    newContractId: newId,
    deriveAddress: derive,
    now: 1,
  });
  assert.equal(first.kind, "ready");
  if (first.kind !== "ready") return;
  assert.equal(first.reused, false);
  assert.equal(first.intent.contractId, "1001");
  assert.equal(first.intent.contractAddress, derive(EMPLOYER, FREELANCER, 1001n));

  const saved = attempted(first.intent);
  for (let retry = 0; retry < 3; retry += 1) {
    const again = ensureCreateIntent({
      terms: milestoneTerms(),
      saved,
      scope: SCOPE,
      newContractId: newId,
      deriveAddress: derive,
      now: 2,
    });
    assert.equal(again.kind, "ready");
    if (again.kind !== "ready") return;
    assert.equal(again.reused, true);
    assert.equal(again.intent.contractId, "1001");
    assert.equal(again.intent.contractAddress, first.intent.contractAddress);
    assert.equal(again.intent.createAttempted, true);
    assert.equal(again.intent.createActivityAt, saved.createActivityAt);
  }
  assert.equal(generated, 1);
});

test("immutable attempt: edited material terms after a create attempt → conflict, original kept for Resume", async () => {
  const saved = attempted(freshIntent());
  const edits: Array<[string, CreateIntentTerms]> = [
    ["milestones", milestoneTerms({}, [
      { amount: "50000000", dueOffsetSeconds: 1_800 },
      { amount: "50000000", dueOffsetSeconds: 3_600 },
    ])],
    ["deadline", milestoneTerms({ acceptanceDeadline: DEADLINE + 3_600 })],
    ["duration", milestoneTerms({ durationSeconds: 90_000 })],
    ["metadata", milestoneTerms({ metadataUri: "local:edited", metadataHashHex: "ee".repeat(32) })],
    ["review", milestoneTerms({ reviewDuration: 7_200 })],
    ["total", milestoneTerms({ totalAmount: "120000000" }, DEFAULT_MILESTONES, { totalAmount: "120000000" })],
  ];
  for (const [label, edited] of edits) {
    const result = ensureCreateIntent({
      terms: edited,
      saved,
      scope: SCOPE,
      newContractId: () => {
        throw new Error("must not generate a new ID");
      },
      deriveAddress: derive,
      now: 3,
    });
    assert.equal(result.kind, "conflict", label);
    if (result.kind !== "conflict") return;
    assert.equal(result.reason, "draft_edited_after_attempt", label);
    assert.deepEqual(result.saved.request, saved.request, `${label}: original terms untouched`);
    assert.deepEqual(result.saved.milestones, saved.milestones, label);
  }

  // Resume uses the original terms and completes against a chain holding them.
  const fake = fakeChain(saved);
  fake.applyCreate();
  const outcome = await runCreateSetup(saved, deps(fake, saved));
  assert.equal(outcome.kind, "complete");
  assert.deepEqual(fake.calls.add, [0, 1, 2]);
  assert.deepEqual(
    fake.chain.units.map((u) => u.amount),
    [30_000_000n, 30_000_000n, 40_000_000n]
  );
});

test("immutable attempt: Hourly rate or authorized-time drift after an attempt is a conflict", () => {
  const saved = attempted(freshIntent(hourlyTerms()));
  for (const edited of [
    hourlyTerms({ hourlyRate: "20000000" }),
    hourlyTerms({ authorizedSeconds: "72000" }),
  ]) {
    const result = ensureCreateIntent({
      terms: edited,
      saved,
      scope: SCOPE,
      newContractId: () => 9n,
      deriveAddress: derive,
      now: 4,
    });
    assert.equal(result.kind === "conflict" && result.reason, "draft_edited_after_attempt");
  }
  const same = ensureCreateIntent({
    terms: hourlyTerms(),
    saved,
    scope: SCOPE,
    newContractId: () => 9n,
    deriveAddress: derive,
    now: 4,
  });
  assert.equal(same.kind, "ready");
});

test("before any create attempt, edits are adopted with the same ID (nothing was sent)", () => {
  const saved = freshIntent();
  const edited = milestoneTerms({ durationSeconds: 90_000 });
  const result = ensureCreateIntent({
    terms: edited,
    saved,
    scope: SCOPE,
    newContractId: () => 9n,
    deriveAddress: derive,
    now: 5,
  });
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.intent.contractId, saved.contractId);
  assert.equal((result.intent.request as StandardCreateIntentRequest).durationSeconds, 90_000);
});

test("changed freelancer after a create attempt is a conflict; before an attempt the PDA is re-derived", () => {
  const saved = attempted(freshIntent());
  const result = ensureCreateIntent({
    terms: milestoneTerms({}, DEFAULT_MILESTONES, { freelancer: WALLET_C.toBase58() }),
    saved,
    scope: SCOPE,
    newContractId: () => 9n,
    deriveAddress: derive,
    now: 4,
  });
  assert.equal(result.kind === "conflict" && result.reason, "earlier_attempt_differs");

  const unsent = ensureCreateIntent({
    terms: milestoneTerms({}, DEFAULT_MILESTONES, { freelancer: WALLET_C.toBase58() }),
    saved: freshIntent(),
    scope: SCOPE,
    newContractId: () => 9n,
    deriveAddress: derive,
    now: 5,
  });
  assert.equal(unsent.kind, "ready");
  if (unsent.kind !== "ready") return;
  assert.equal(unsent.intent.contractAddress, derive(EMPLOYER, WALLET_C.toBase58(), 42n));
});

test("intent storage is scoped by cluster, program and employer", () => {
  const { storage } = memoryStorage();
  const intent = attempted(freshIntent());
  saveCreateIntent(storage, intent);
  const loaded = loadCreateIntent(storage, SCOPE, EMPLOYER, derive);
  assert.equal(loaded.kind, "ready");
  if (loaded.kind !== "ready") return;
  assert.deepEqual(loaded.intent, intent);
  assert.equal(loadCreateIntent(storage, SCOPE, FREELANCER, derive).kind, "none");
  assert.equal(
    loadCreateIntent(storage, { ...SCOPE, cluster: "mainnet-beta" }, EMPLOYER, derive).kind,
    "none"
  );
  assert.equal(
    loadCreateIntent(storage, { ...SCOPE, programId: WALLET_C.toBase58() }, EMPLOYER, derive).kind,
    "none"
  );
  clearCreateIntent(storage, SCOPE, EMPLOYER);
  assert.equal(loadCreateIntent(storage, SCOPE, EMPLOYER, derive).kind, "none");
  assert.equal(loadCreateIntent(null, SCOPE, EMPLOYER, derive).kind, "none");
  assert.throws(() => saveCreateIntent(null, intent), /storage is unavailable/);
});

test("corrupt or tampered saved intent → controlled 'corrupt' result, never an exception", () => {
  type Json = Record<string, unknown>;
  const good = JSON.parse(JSON.stringify(attempted(freshIntent()))) as Json;
  const hourlyGood = JSON.parse(JSON.stringify(attempted(freshIntent(hourlyTerms())))) as Json;
  const req = (v: Json) => v.request as Json;
  const mutations: Array<[string, (v: Json) => unknown]> = [
    ["not json", () => "{not json"],
    ["array", () => []],
    ["wrong version", (v) => ({ ...v, version: 1 })],
    ["bad freelancer key", (v) => ({ ...v, freelancer: "not-a-key" })],
    ["contract id beyond u64", (v) => ({ ...v, contractId: "18446744073709551616" })],
    ["contract id not decimal", (v) => ({ ...v, contractId: "0x10" })],
    ["address not derived from id", (v) => ({ ...v, contractAddress: WALLET_C.toBase58() })],
    ["createAttempted missing", (v) => ({ ...v, createAttempted: undefined })],
    ["milestone entry malformed", (v) => ({ ...v, milestones: [{ amount: 5 }] })],
    ["milestone zero amount", (v) => ({ ...v, milestones: [{ amount: "0", dueOffsetSeconds: 1 }] })],
    ["no milestones for Milestone", (v) => ({ ...v, milestones: [] })],
    ["request kind mismatch", (v) => ({ ...v, request: { ...req(v), kind: "hourly" } })],
    ["unknown start mode", (v) => ({ ...v, request: { ...req(v), startMode: "Later" } })],
    ["negative deadline", (v) => ({ ...v, request: { ...req(v), acceptanceDeadline: -5 } })],
    ["fractional duration", (v) => ({ ...v, request: { ...req(v), durationSeconds: 1.5 } })],
    ["bad hash", (v) => ({ ...v, request: { ...req(v), metadataHashHex: "zz" } })],
    ["bad resolver", (v) => ({ ...v, request: { ...req(v), resolver: "x" } })],
    ["total disagrees with request", (v) => ({ ...v, totalAmount: "1" })],
    ["unknown payment mode", (v) => ({ ...v, paymentMode: "Barter" })],
  ];
  for (const [label, mutate] of mutations) {
    const { map, storage } = memoryStorage();
    const value = mutate(structuredClone(good));
    map.set(createIntentStorageKey(SCOPE, EMPLOYER), typeof value === "string" ? value : JSON.stringify(value));
    let result: unknown;
    assert.doesNotThrow(() => {
      result = loadCreateIntent(storage, SCOPE, EMPLOYER, derive);
    }, label);
    assert.deepEqual(result, { kind: "corrupt", message: CORRUPT_INTENT_MESSAGE }, label);
  }
  const { map, storage } = memoryStorage();
  map.set(
    createIntentStorageKey(SCOPE, EMPLOYER),
    JSON.stringify({ ...hourlyGood, request: { ...req(hourlyGood), hourlyRate: "-1" } })
  );
  assert.equal(loadCreateIntent(storage, SCOPE, EMPLOYER, derive).kind, "corrupt");
  // Stored fingerprint is never trusted.
  map.set(createIntentStorageKey(SCOPE, EMPLOYER), JSON.stringify({ ...hourlyGood, fingerprint: "x" }));
  const loaded = loadCreateIntent(storage, SCOPE, EMPLOYER, derive);
  assert.equal(loaded.kind, "ready");
  assert.notEqual(loaded.kind === "ready" && loaded.intent.fingerprint, "x");
  // Storage that throws is treated as "nothing saved".
  const throwing: IntentStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.equal(loadCreateIntent(throwing, SCOPE, EMPLOYER, derive).kind, "none");
});

test("request codec keeps the stable contract ID and exact terms", () => {
  const intent = freshIntent();
  const request = toCreateContractRequest(intent);
  assert.equal(request.contractId, 42n);
  assert.equal(request.totalAmount, 100_000_000n);
  assert.equal(request.paymentMode, "Milestone");
  assert.ok(request.resolver.equals(RESOLVER));
  assert.equal(bytesToHex(request.metadataHash), "ab".repeat(32));
  assert.deepEqual([...hexToBytes("00ff10")], [0, 255, 16]);
  assert.throws(() => toCreateHourlyContractRequest(intent));
  const hourly = toCreateHourlyContractRequest(freshIntent(hourlyTerms()));
  assert.equal(hourly.hourlyRate, 25_000_000n);
  assert.equal(hourly.authorizedSeconds, 36_000n);
});

// ---------------------------------------------------------------------------
// Orchestrator with a fake chain that behaves like the program
// ---------------------------------------------------------------------------

type FakeChain = ReturnType<typeof fakeChain>;

/**
 * Models the program's address rules: the contract PDA can be initialized only
 * once, and add_milestone derives the work-unit PDA from the *current* count,
 * so a stale index collides instead of appending.
 */
function fakeChain(
  intent: CreateIntent,
  opts: { lagReads?: number; failReadsAfterSend?: number; hourlyLagReads?: number } = {}
) {
  const chain: {
    contract: ObservedContract | null;
    units: ObservedWorkUnit[];
    hourly: ObservedHourlyState | null;
  } = { contract: null, units: [], hourly: null };
  const calls = {
    observe: 0,
    create: 0,
    createIds: [] as bigint[],
    add: [] as number[],
    finalize: 0,
    rejected: [] as string[],
  };
  let lag = 0;
  let failReads = 0;
  let hourlyLag = 0;
  let snapshot: ObservedCreateState = { contract: null, workUnits: [], hourly: null };
  const read = (): ObservedCreateState => ({
    contract: chain.contract
      ? {
          ...chain.contract,
          workUnitCount:
            chain.contract.paymentMode === "Milestone" ? chain.units.length : chain.contract.workUnitCount,
        }
      : null,
    workUnits: [...chain.units],
    hourly: chain.hourly,
  });
  const beforeSend = () => {
    snapshot = read();
    lag = opts.lagReads ?? 0;
    failReads = opts.failReadsAfterSend ?? 0;
  };
  return {
    chain,
    calls,
    observe: async (): Promise<ObservedCreateState> => {
      calls.observe += 1;
      if (failReads > 0) {
        failReads -= 1;
        throw new Error("429 Too Many Requests");
      }
      if (lag > 0) {
        lag -= 1;
        return snapshot;
      }
      const state = read();
      if (hourlyLag > 0) {
        hourlyLag -= 1;
        return { ...state, hourly: null };
      }
      return state;
    },
    applyCreate: () => {
      if (chain.contract) {
        calls.rejected.push("create");
        throw new Error("Allocate: account already in use");
      }
      chain.contract = matchingContract(intent);
      if (intent.paymentMode === "Hourly") {
        chain.hourly = hourlyStateFor(intent);
        hourlyLag = opts.hourlyLagReads ?? 0;
      }
    },
    applyMilestone: (index: number, amount: bigint, due: number) => {
      if (!chain.contract) throw new Error("AccountNotInitialized");
      if (index !== chain.units.length) {
        calls.rejected.push(`add-${index}`);
        throw new Error("ConstraintSeeds: work unit address does not match the current count");
      }
      chain.units.push(makeWorkUnit({ index, kind: "Milestone", amount, dueOffsetSeconds: due }));
    },
    beforeSend,
  };
}

function deps(
  fake: FakeChain,
  intent: CreateIntent,
  overrides: Partial<CreateSetupDeps> = {}
): CreateSetupDeps {
  return {
    observe: fake.observe,
    now: () => NOW,
    sleep: async () => {},
    create: async () => {
      fake.beforeSend();
      fake.calls.create += 1;
      fake.calls.createIds.push(BigInt(intent.contractId));
      fake.applyCreate();
      return { signature: `create-${fake.calls.create}` };
    },
    addMilestone: async (step) => {
      fake.beforeSend();
      fake.calls.add.push(step.index);
      fake.applyMilestone(step.index, step.amount, step.dueOffsetSeconds);
      return { signature: `add-${step.index}` };
    },
    finalize: async () => {
      fake.beforeSend();
      fake.calls.finalize += 1;
      assert.ok(fake.chain.contract);
      if (fake.chain.contract.status !== "Draft") throw new Error("InvalidState");
      fake.chain.contract = { ...fake.chain.contract, status: "PendingAcceptance" };
      return { signature: "finalize" };
    },
    ...overrides,
  };
}

test("orchestrator: happy path creates, adds every milestone, then sends the offer", async () => {
  const intent = freshIntent();
  const fake = fakeChain(intent);
  const notes: string[] = [];
  const outcome = await runCreateSetup(intent, {
    ...deps(fake, intent),
    onStep: (step, progress) => notes.push(createStepNote(step, progress) ?? ""),
  });
  assert.equal(outcome.kind, "complete");
  assert.equal(outcome.kind === "complete" && outcome.lastSignature, "finalize");
  assert.equal(fake.calls.create, 1);
  assert.deepEqual(fake.calls.add, [0, 1, 2]);
  assert.equal(fake.calls.finalize, 1);
  assert.deepEqual(notes, [
    "Creating and funding contract…",
    "Adding milestone 1 of 3…",
    "Adding milestone 2 of 3…",
    "Adding milestone 3 of 3…",
    "Sending offer…",
  ]);
});

test("orchestrator: Fixed, Streaming and Hourly create once and complete only after verification", async () => {
  for (const terms of [
    standardTerms("Fixed"),
    standardTerms("Streaming", { startMode: "Scheduled", scheduledStartTime: DEADLINE + 60 }),
    hourlyTerms(),
  ]) {
    const intent = freshIntent(terms);
    const fake = fakeChain(intent, { hourlyLagReads: 2 });
    const outcome = await runCreateSetup(intent, deps(fake, intent));
    assert.equal(outcome.kind, "complete", terms.paymentMode);
    assert.equal(outcome.kind === "complete" && outcome.lastSignature, "create-1");
    assert.equal(fake.calls.create, 1, terms.paymentMode);
    assert.deepEqual(fake.calls.add, []);
    assert.equal(fake.calls.finalize, 0);
  }
});

test("orchestrator: partial milestone failure never causes another createContract; resume adds only missing", async () => {
  const intent = freshIntent();
  const fake = fakeChain(intent);
  const base = deps(fake, intent);
  let failOnce = true;
  await assert.rejects(
    runCreateSetup(intent, {
      ...base,
      addMilestone: async (step) => {
        if (step.index === 1 && failOnce) {
          failOnce = false;
          throw new Error("wallet rejected");
        }
        return base.addMilestone(step);
      },
    }),
    /wallet rejected/
  );
  assert.equal(fake.calls.create, 1);
  assert.deepEqual(fake.calls.add, [0]);

  const outcome = await runCreateSetup(intent, base);
  assert.equal(outcome.kind, "complete");
  assert.equal(fake.calls.create, 1, "resume must not create again");
  assert.deepEqual(fake.calls.add, [0, 1, 2]);
  assert.equal(fake.calls.finalize, 1);
  assert.deepEqual(fake.calls.createIds, [42n]);
});

test("orchestrator: unknown confirmation that actually landed is detected, not duplicated", async () => {
  const intent = freshIntent();
  const fake = fakeChain(intent);
  const base = deps(fake, intent);
  await assert.rejects(
    runCreateSetup(intent, {
      ...base,
      addMilestone: async (step) => {
        await base.addMilestone(step);
        if (step.index === 0) throw new Error("confirmation unknown");
        return { signature: `add-${step.index}` };
      },
    }),
    /confirmation unknown/
  );
  const outcome = await runCreateSetup(intent, base);
  assert.equal(outcome.kind, "complete");
  assert.deepEqual(fake.calls.add, [0, 1, 2], "milestone 0 is sent exactly once");
  assert.equal(fake.chain.units.length, 3);
  assert.deepEqual(fake.calls.rejected, []);
});

test("orchestrator: unknown create confirmation retried with the same contract ID", async () => {
  const intent = freshIntent();
  const fake = fakeChain(intent);
  const base = deps(fake, intent);
  await assert.rejects(
    runCreateSetup(intent, {
      ...base,
      create: async () => {
        fake.calls.create += 1;
        fake.calls.createIds.push(BigInt(intent.contractId));
        throw new Error("confirmation unknown");
      },
    })
  );
  const outcome = await runCreateSetup(intent, base);
  assert.equal(outcome.kind, "complete");
  assert.deepEqual(fake.calls.createIds, [42n, 42n]);
});

test("orchestrator: duplicate create or stale milestone index is rejected by the chain, never duplicated", async () => {
  const intent = freshIntent();
  const fake = fakeChain(intent);
  // Two concurrent runs (e.g. two tabs) both see "absent" and both send create.
  const results = await Promise.allSettled([
    runCreateSetup(intent, deps(fake, intent)),
    runCreateSetup(intent, deps(fake, intent)),
  ]);
  assert.equal(fake.calls.create, 2);
  assert.ok(fake.calls.rejected.includes("create"), "second create collides on the contract PDA");
  assert.ok(results.some((r) => r.status === "rejected"));
  assert.equal(fake.chain.units.length <= 3, true);
  // Resume converges to exactly one contract with three milestones.
  const outcome = await runCreateSetup(intent, deps(fake, intent));
  assert.equal(outcome.kind, "complete");
  assert.equal(fake.chain.units.length, 3);
  assert.deepEqual(
    fake.chain.units.map((u) => u.index),
    [0, 1, 2]
  );
  assert.equal(fake.chain.contract?.status, "PendingAcceptance");
});

test("orchestrator: already finalized contract completes without any transaction", async () => {
  const intent = freshIntent();
  const fake = fakeChain(intent);
  fake.applyCreate();
  for (const [i, m] of intent.milestones.entries()) {
    fake.applyMilestone(i, BigInt(m.amount), m.dueOffsetSeconds);
  }
  fake.chain.contract = { ...fake.chain.contract!, status: "PendingAcceptance" };
  const outcome = await runCreateSetup(intent, deps(fake, intent));
  assert.equal(outcome.kind, "complete");
  assert.equal(outcome.kind === "complete" && outcome.lastSignature, null);
  assert.equal(fake.calls.create, 0);
  assert.deepEqual(fake.calls.add, []);
  assert.equal(fake.calls.finalize, 0);
});

test("orchestrator: expired contract with every milestone is a conflict, not success", async () => {
  const intent = freshIntent();
  const fake = fakeChain(intent);
  fake.applyCreate();
  for (const [i, m] of intent.milestones.entries()) {
    fake.applyMilestone(i, BigInt(m.amount), m.dueOffsetSeconds);
  }
  fake.chain.contract = { ...fake.chain.contract!, status: "Expired" };
  const outcome = await runCreateSetup(intent, deps(fake, intent));
  assert.equal(outcome.kind === "conflict" && outcome.reason, "not_live");
  assert.equal(fake.calls.finalize, 0);
});

test("orchestrator: conflict stops before sending anything", async () => {
  const intent = freshIntent();
  const fake = fakeChain(intent);
  fake.applyCreate();
  fake.applyMilestone(0, 1n, 1_800);
  const outcome = await runCreateSetup(intent, deps(fake, intent));
  assert.equal(outcome.kind === "conflict" && outcome.reason, "milestone_mismatch");
  assert.equal(fake.calls.create, 0);
  assert.deepEqual(fake.calls.add, []);
});

test("orchestrator: RPC read errors before any send surface and are never treated as absent", async () => {
  const intent = freshIntent();
  const fake = fakeChain(intent);
  await assert.rejects(
    runCreateSetup(intent, {
      ...deps(fake, intent),
      observe: async () => {
        throw new Error("429 Too Many Requests");
      },
    }),
    /429/
  );
  assert.equal(fake.calls.create, 0);
});

test("orchestrator: lagging reads are re-checked; persistent lag → pending reconciliation, not failure or re-send", async () => {
  const intent = freshIntent();
  const lagging = fakeChain(intent, { lagReads: 2 });
  const outcome = await runCreateSetup(intent, deps(lagging, intent));
  assert.equal(outcome.kind, "complete");
  assert.equal(lagging.calls.create, 1);
  assert.deepEqual(lagging.calls.add, [0, 1, 2]);

  const stuck = fakeChain(intent, { lagReads: 99 });
  const pending = await runCreateSetup(intent, deps(stuck, intent));
  assert.equal(pending.kind, "unverified");
  if (pending.kind !== "unverified") return;
  assert.equal(pending.reason, "stale_read");
  assert.equal(pending.lastSignature, "create-1");
  assert.equal(pending.message, PENDING_RECONCILIATION_MESSAGE);
  assert.equal(pending.progress?.contractExists, false, "last verified state, not a guess");
  assert.equal(stuck.calls.create, 1, "never a second create while the chain lags");
});

test("orchestrator: confirmed send + failing reconciliation read (429) → pending reconciliation; resume completes once", async () => {
  const intent = freshIntent();
  const fake = fakeChain(intent, { failReadsAfterSend: 1 });
  const first = await runCreateSetup(intent, deps(fake, intent));
  assert.equal(first.kind, "unverified");
  assert.equal(first.kind === "unverified" && first.reason, "read_failed");
  assert.equal(first.kind === "unverified" && first.lastSignature, "create-1");

  const healthy = { ...deps(fake, intent) };
  const outcome = await runCreateSetup(intent, healthy);
  // The fake keeps failing one read after every send; each run makes progress.
  let final = outcome;
  for (let i = 0; i < 6 && final.kind === "unverified"; i += 1) {
    final = await runCreateSetup(intent, healthy);
  }
  assert.equal(final.kind, "complete");
  assert.equal(fake.calls.create, 1);
  assert.deepEqual(fake.calls.add, [0, 1, 2]);
  assert.equal(fake.calls.finalize, 1);
});

test("orchestrator: Fixed create followed by a stale read is pending reconciliation, never a failure", async () => {
  const intent = freshIntent(standardTerms("Fixed"));
  const fake = fakeChain(intent, { lagReads: 99 });
  const outcome = await runCreateSetup(intent, deps(fake, intent));
  assert.equal(outcome.kind, "unverified");
  const resumed = await runCreateSetup(intent, deps(fakeChainFrom(fake, intent), intent));
  assert.equal(resumed.kind, "complete");
});

/** Same chain contents, healthy reads. */
function fakeChainFrom(source: FakeChain, intent: CreateIntent): FakeChain {
  const fresh = fakeChain(intent);
  fresh.chain.contract = source.chain.contract;
  fresh.chain.units = [...source.chain.units];
  fresh.chain.hourly = source.chain.hourly;
  return fresh;
}

// ---------------------------------------------------------------------------
// Concurrency lock + Discard guard
// ---------------------------------------------------------------------------

test("run lock: acquired synchronously, second rapid invocation is skipped, released in finally", async () => {
  const lock = createRunLock();
  assert.equal(lock.tryAcquire(), true);
  assert.equal(lock.tryAcquire(), false);
  lock.release();
  assert.equal(lock.held, false);

  const intent = freshIntent();
  const fake = fakeChain(intent);
  const handler = async (): Promise<string> => {
    if (!lock.tryAcquire()) return "skipped";
    try {
      const outcome = await runCreateSetup(intent, deps(fake, intent));
      return outcome.kind;
    } finally {
      lock.release();
    }
  };
  // Double click: both handlers start in the same tick.
  const [a, b] = await Promise.all([handler(), handler()]);
  assert.deepEqual([a, b].sort(), ["complete", "skipped"]);
  assert.equal(fake.calls.create, 1);
  assert.equal(lock.held, false);

  // Released even when the run throws.
  const failing = async () => {
    if (!lock.tryAcquire()) return "skipped";
    try {
      throw new Error("boom");
    } finally {
      lock.release();
    }
  };
  await assert.rejects(failing(), /boom/);
  assert.equal(lock.tryAcquire(), true);
  lock.release();
});

test("discard guard: a create that may still land is never blindly discarded", () => {
  const unsent = freshIntent();
  const sent = attempted(freshIntent(), 1_000_000);
  const later = 1_000_000 + CREATE_LANDING_WINDOW_MS;

  assert.equal(
    decideDiscard({ intent: sent, txPhase: "confirming", chain: "absent", nowMs: later }).allowed,
    false,
    "in flight"
  );
  assert.deepEqual(
    decideDiscard({ intent: unsent, txPhase: "ready", chain: "not_checked", nowMs: 0 }),
    { allowed: true, contractExists: false },
    "nothing was ever sent"
  );
  assert.equal(
    decideDiscard({ intent: sent, txPhase: "pending_confirmation", chain: "unknown", nowMs: later }).allowed,
    false,
    "chain read failed"
  );
  assert.equal(
    decideDiscard({ intent: sent, txPhase: "ready", chain: "not_checked", nowMs: later }).allowed,
    false,
    "chain not checked"
  );
  const pending = decideDiscard({
    intent: sent,
    txPhase: "pending_confirmation",
    chain: "absent",
    nowMs: 1_000_000 + 10_000,
  });
  assert.equal(pending.allowed, false, "absent now, but the pending create may still land");
  assert.match(pending.allowed ? "" : pending.message, /may still land/);
  assert.deepEqual(
    decideDiscard({ intent: sent, txPhase: "pending_confirmation", chain: "absent", nowMs: later }),
    { allowed: true, contractExists: false },
    "absent after the landing window"
  );
  assert.deepEqual(
    decideDiscard({ intent: sent, txPhase: "failed", chain: "exists", nowMs: 1_000_001 }),
    { allowed: true, contractExists: true },
    "existence established: the contract stays manageable on-chain"
  );
});

test("pending confirmation is resumable after reset; in-flight phases are not", () => {
  assert.equal(canResumeCreateSetup("pending_confirmation"), true);
  assert.equal(needsTxResetBeforeResume("pending_confirmation"), true);
  assert.equal(canResumeCreateSetup("failed"), true);
  assert.equal(needsTxResetBeforeResume("failed"), true);
  assert.equal(canResumeCreateSetup("ready"), true);
  assert.equal(needsTxResetBeforeResume("ready"), false);
  for (const phase of ["preparing", "awaiting_wallet", "submitting", "confirming"] as const) {
    assert.equal(canResumeCreateSetup(phase), false, phase);
    assert.equal(isCreateTxInFlight(phase), true, phase);
  }
  assert.equal(isCreateTxInFlight("pending_confirmation"), false);
});

// ---------------------------------------------------------------------------
// Wizard wiring (supplementary source checks; behaviour is covered above)
// ---------------------------------------------------------------------------

test("Create wizard wiring: locks before awaiting, reconciles before sending, guarded discard", () => {
  const wizard = readFileSync(
    new URL("../../../components/create/CreateWizard.tsx", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(wizard, /const contractId = BigInt\(Date\.now\(\)\)/);
  for (const needle of [
    "ensureCreateIntent(",
    "saveCreateIntent(",
    "deriveContractPda(",
    "fetchContractIfExists(",
    "fetchIndexedWorkUnits(",
    "fetchHourlyStateIfExists(",
    "runCreateSetup(",
    "expectedIndex: step.index",
    "createRunLock",
    "decideDiscard(",
    "markCreateAttempted(",
  ]) {
    assert.ok(wizard.includes(needle), needle);
  }
  const slice = (from: string, to: string) =>
    wizard.slice(wizard.indexOf(from), wizard.indexOf(to, wizard.indexOf(from) + from.length));
  for (const [from, to] of [
    ["async function startCreate", "async function resumeSetup"],
    ["async function resumeSetup", "async function discardSetup"],
    ["async function discardSetup", "const setupInFlight"],
  ] as const) {
    const body = slice(from, to);
    assert.ok(body.includes("runLock.tryAcquire()"), `${from} acquires the lock`);
    assert.ok(body.indexOf("runLock.tryAcquire()") < body.indexOf("await "), `${from} locks before awaiting`);
    assert.ok(body.includes("runLock.release()"), `${from} releases the lock`);
  }
  const runSetup = slice("async function runSetup", "function finishSetup");
  assert.ok(runSetup.indexOf("planNextCreateStep(") < runSetup.indexOf(".run("));
  // createAttempted is persisted before the wallet prompt.
  assert.ok(runSetup.indexOf("saveCreateIntent(") < runSetup.indexOf("client.createContract("));
  assert.doesNotMatch(wizard, /disabled=\{tx\.busy/);
  assert.equal(CREATE_SEND_OFFER_LABEL, "Create & Send Offer");
  assert.match(wizard, /\{CREATE_SEND_OFFER_LABEL\}/);
  assert.doesNotMatch(wizard, /Locking terms/);
});

test("manual Draft actions stay available on the contract page as a fallback", () => {
  const actions = availableActions({
    wallet: WALLET_A,
    contract: makeContract({
      paymentMode: "Milestone",
      status: "Draft",
      workUnitCount: 1,
      acceptanceDeadline: DEADLINE,
    }),
    now: NOW,
  });
  assert.ok(actions.includes("addMilestone"));
  assert.ok(actions.includes("finalizeTerms"));
});
