import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import {
  DEFAULT_ACCEPTANCE_WINDOW_SECONDS,
  NO_WALLET_DRAFT_OWNER,
  acceptanceWindowOptions,
  clearAllCreateDrafts,
  clearCreateDraft,
  createDraftStorageKey,
  isMeaningfulDraft,
  loadCreateDraft,
  parseCreateDraft,
  resolveAcceptanceDeadline,
  saveCreateDraft,
} from "@/lib/app/create-draft-store";
import { toDatetimeLocalValue } from "@/lib/app/datetime";
import {
  createIntentFingerprint,
  createIntentStorageKey,
  ensureCreateIntent,
  loadCreateIntent,
  markCreateAttempted,
  saveCreateIntent,
  type CreateIntentTerms,
  type IntentScope,
  type IntentStorage,
  type StandardCreateIntentRequest,
} from "@/lib/app/milestone-create-plan";
import { defaultCreateDraft, validateCreateDraftBase, type CreateWizardDraft } from "@/lib/app/validation";
import { MAX_ACCEPTANCE_WINDOW } from "@/lib/streampay-v2/constants";
import { deriveContractPda } from "@/lib/streampay-v2/pda";
import { MINT, RESOLVER, WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const EMPLOYER = WALLET_A.toBase58();
const OTHER = WALLET_C.toBase58();
const PROGRAM = new PublicKey("EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd");
const SCOPE: IntentScope = { cluster: "devnet", programId: PROGRAM.toBase58() };
const MAX_STEP = 6;
const derive = (employer: string, freelancer: string, id: bigint) =>
  deriveContractPda(new PublicKey(employer), new PublicKey(freelancer), id, PROGRAM).address.toBase58();

function memoryStorage(): IntentStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function draftWith(overrides: Partial<CreateWizardDraft>): CreateWizardDraft {
  return { ...defaultCreateDraft(), ...overrides };
}

function terms(acceptanceDeadline: number): CreateIntentTerms {
  const request: StandardCreateIntentRequest = {
    kind: "standard",
    paymentMode: "Fixed",
    startMode: "OnActivation",
    totalAmount: "100000000",
    acceptanceDeadline,
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
  };
  return {
    employer: EMPLOYER,
    freelancer: WALLET_B.toBase58(),
    tokenMint: MINT.toBase58(),
    paymentMode: "Fixed",
    totalAmount: request.totalAmount,
    trialAmount: "0",
    milestones: [],
    request,
  };
}

function freshIntent(deadline: number) {
  const r = ensureCreateIntent({
    terms: terms(deadline),
    saved: null,
    scope: SCOPE,
    newContractId: () => 1_700_000_000_000n,
    deriveAddress: derive,
    now: 1,
  });
  assert.equal(r.kind, "ready");
  if (r.kind !== "ready") throw new Error("unreachable");
  return r.intent;
}

test("accept within: default 2 days, validated > 0 and <= MAX_ACCEPTANCE_WINDOW", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(defaultCreateDraft().acceptanceWindowSeconds, 172_800);
  assert.equal(DEFAULT_ACCEPTANCE_WINDOW_SECONDS, 172_800);
  const err = (w: number) =>
    validateCreateDraftBase(draftWith({ acceptanceWindowSeconds: w }), now).acceptanceWindowSeconds;
  assert.ok(err(0));
  assert.ok(err(-5));
  assert.ok(err(1.5));
  assert.equal(err(MAX_ACCEPTANCE_WINDOW), undefined);
  assert.match(err(MAX_ACCEPTANCE_WINDOW + 1) ?? "", /too long/);
  assert.equal(err(172_800), undefined);
});

test("scheduled start is checked against now + accept within", () => {
  const now = Math.floor(Date.now() / 1000);
  const early = validateCreateDraftBase(
    draftWith({ startMode: "Scheduled", scheduledStartLocal: toDatetimeLocalValue(3_600) }),
    now
  );
  assert.match(early.scheduledStartLocal ?? "", /precede the acceptance deadline/);
  const late = validateCreateDraftBase(
    draftWith({ startMode: "Scheduled", scheduledStartLocal: toDatetimeLocalValue(4 * 86_400) }),
    now
  );
  assert.equal(late.scheduledStartLocal, undefined);
  const shortWindow = validateCreateDraftBase(
    draftWith({
      startMode: "Scheduled",
      scheduledStartLocal: toDatetimeLocalValue(7_200),
      acceptanceWindowSeconds: 3_600,
    }),
    now
  );
  assert.equal(shortWindow.scheduledStartLocal, undefined);
});

test("deadline = send time + window; attempted intent reuses its stored deadline (same fingerprint)", () => {
  const sendAt = 2_000_000_000;
  assert.equal(resolveAcceptanceDeadline({ windowSeconds: 172_800, nowSeconds: sendAt, saved: null }), sendAt + 172_800);
  const stored = sendAt + 3_600;
  const attempted = markCreateAttempted(freshIntent(stored), 5);
  const later = sendAt + 9_999;
  const deadline = resolveAcceptanceDeadline({ windowSeconds: 172_800, nowSeconds: later, saved: attempted });
  assert.equal(deadline, stored);
  const r = ensureCreateIntent({
    terms: terms(deadline),
    saved: attempted,
    scope: SCOPE,
    newContractId: () => 9n,
    deriveAddress: derive,
    now: 10,
  });
  assert.equal(r.kind, "ready");
  if (r.kind === "ready") {
    assert.equal(r.reused, true);
    assert.equal(r.intent.fingerprint, createIntentFingerprint(attempted));
    assert.equal(r.intent.request.acceptanceDeadline, stored);
    assert.equal(r.intent.contractId, attempted.contractId);
  }
});

test("an unattempted (or released) intent takes a fresh deadline and keeps its contract ID", () => {
  const saved = freshIntent(2_000_000_000);
  assert.equal(saved.createAttempted, false);
  const now2 = 2_000_050_000;
  const deadline = resolveAcceptanceDeadline({ windowSeconds: 86_400, nowSeconds: now2, saved });
  assert.equal(deadline, now2 + 86_400);
  const r = ensureCreateIntent({
    terms: terms(deadline),
    saved,
    scope: SCOPE,
    newContractId: () => 9n,
    deriveAddress: derive,
    now: 20,
  });
  assert.equal(r.kind, "ready");
  if (r.kind === "ready") {
    assert.equal(r.intent.contractId, saved.contractId);
    assert.equal(r.intent.request.acceptanceDeadline, now2 + 86_400);
    assert.equal(r.intent.createAttempted, false);
    assert.notEqual(r.intent.fingerprint, saved.fingerprint);
  }
});

test("draft store: round trip with step, scoped key, locked fields never stored", () => {
  const storage = memoryStorage();
  const draft = draftWith({
    paymentMode: "Milestone",
    title: "Logo",
    freelancer: WALLET_B.toBase58(),
    acceptanceWindowSeconds: 604_800,
  });
  assert.equal(saveCreateDraft(storage, SCOPE, EMPLOYER, { draft, step: 3, nowMs: 1_000, intentExists: false }), true);
  const key = createDraftStorageKey(SCOPE, EMPLOYER);
  assert.equal(key, `premiflow:create-draft:v1:devnet:${PROGRAM.toBase58()}:${EMPLOYER}`);
  const raw = JSON.parse(storage.map.get(key) ?? "{}");
  assert.equal("mint" in raw.draft, false);
  assert.equal("resolver" in raw.draft, false);
  const loaded = loadCreateDraft(storage, SCOPE, EMPLOYER, MAX_STEP);
  assert.ok(loaded);
  assert.equal(loaded?.step, 3);
  assert.equal(loaded?.savedAt, 1_000);
  assert.equal(loaded?.draft.title, "Logo");
  assert.equal(loaded?.draft.paymentMode, "Milestone");
  assert.equal(loaded?.draft.acceptanceWindowSeconds, 604_800);
  assert.equal(loaded?.draft.mint, defaultCreateDraft().mint);
  assert.equal(loadCreateDraft(storage, SCOPE, OTHER, MAX_STEP), null);
  assert.equal(loadCreateDraft(storage, { ...SCOPE, cluster: "mainnet" }, EMPLOYER, MAX_STEP), null);
  assert.equal(loadCreateDraft(storage, { ...SCOPE, programId: "other" }, EMPLOYER, MAX_STEP), null);
});

test("draft store: corrupt or foreign data is dropped; tampered locked fields are re-applied", () => {
  const storage = memoryStorage();
  const key = createDraftStorageKey(SCOPE, EMPLOYER);
  storage.setItem(key, "{not json");
  assert.equal(loadCreateDraft(storage, SCOPE, EMPLOYER, MAX_STEP), null);
  assert.equal(storage.map.has(key), false);
  assert.equal(parseCreateDraft(JSON.stringify({ version: 2, step: 1, draft: {} }), MAX_STEP), null);
  assert.equal(parseCreateDraft(JSON.stringify([1, 2]), MAX_STEP), null);
  assert.equal(parseCreateDraft(null, MAX_STEP), null);
  const tampered = parseCreateDraft(
    JSON.stringify({
      version: 1,
      step: 99,
      savedAt: 5,
      draft: {
        title: "T",
        mint: "Evil",
        resolver: "Evil",
        decimals: 0,
        paymentMode: "Bogus",
        maxRevisions: "2",
        milestones: [{ label: 1 }],
        acceptanceWindowSeconds: MAX_ACCEPTANCE_WINDOW + 1,
      },
    }),
    MAX_STEP
  );
  const base = defaultCreateDraft();
  assert.ok(tampered);
  assert.equal(tampered?.step, 0);
  assert.equal(tampered?.draft.title, "T");
  assert.equal(tampered?.draft.mint, base.mint);
  assert.equal(tampered?.draft.resolver, base.resolver);
  assert.equal(tampered?.draft.decimals, base.decimals);
  assert.equal(tampered?.draft.paymentMode, base.paymentMode);
  assert.equal(tampered?.draft.maxRevisions, base.maxRevisions);
  assert.deepEqual(tampered?.draft.milestones, base.milestones);
  assert.equal(tampered?.draft.acceptanceWindowSeconds, DEFAULT_ACCEPTANCE_WINDOW_SECONDS);
});

test("draft store: no save while a create intent exists; pristine drafts are not kept", () => {
  const storage = memoryStorage();
  const draft = draftWith({ title: "Busy" });
  assert.equal(saveCreateDraft(storage, SCOPE, EMPLOYER, { draft, step: 2, nowMs: 1, intentExists: true }), false);
  assert.equal(storage.map.size, 0);
  assert.equal(isMeaningfulDraft(defaultCreateDraft(), 0), false);
  assert.equal(isMeaningfulDraft(defaultCreateDraft(), 1), true);
  saveCreateDraft(storage, SCOPE, EMPLOYER, { draft, step: 2, nowMs: 1, intentExists: false });
  assert.equal(storage.map.size, 1);
  saveCreateDraft(storage, SCOPE, EMPLOYER, { draft: defaultCreateDraft(), step: 0, nowMs: 2, intentExists: false });
  assert.equal(storage.map.size, 0);
});

test("clearing drafts (intent saved, success, Start fresh) never touches the create intent", () => {
  const storage = memoryStorage();
  const intent = freshIntent(2_000_000_000);
  saveCreateIntent(storage, intent);
  const intentKey = createIntentStorageKey(SCOPE, EMPLOYER);
  const draft = draftWith({ title: "x" });
  saveCreateDraft(storage, SCOPE, EMPLOYER, { draft, step: 1, nowMs: 1, intentExists: false });
  saveCreateDraft(storage, SCOPE, NO_WALLET_DRAFT_OWNER, { draft, step: 1, nowMs: 1, intentExists: false });
  clearAllCreateDrafts(storage, SCOPE, EMPLOYER);
  assert.equal(storage.map.has(createDraftStorageKey(SCOPE, EMPLOYER)), false);
  assert.equal(storage.map.has(createDraftStorageKey(SCOPE, NO_WALLET_DRAFT_OWNER)), false);
  assert.equal(storage.map.has(intentKey), true);
  saveCreateDraft(storage, SCOPE, EMPLOYER, { draft, step: 1, nowMs: 1, intentExists: false });
  clearCreateDraft(storage, SCOPE, EMPLOYER);
  assert.equal(storage.map.has(intentKey), true);
  const loaded = loadCreateIntent(storage, SCOPE, EMPLOYER, derive);
  assert.equal(loaded.kind, "ready");
  if (loaded.kind === "ready") {
    assert.equal(loaded.intent.request.acceptanceDeadline, 2_000_000_000);
    assert.equal(loaded.intent.fingerprint, intent.fingerprint);
  }
});

test("backward compat: old drafts with an absolute acceptanceDeadlineLocal", () => {
  const savedAt = Date.now();
  const legacy = parseCreateDraft(
    JSON.stringify({
      version: 1,
      step: 2,
      savedAt,
      draft: { title: "Old", acceptanceDeadlineLocal: toDatetimeLocalValue(259_200) },
    }),
    MAX_STEP
  );
  const w = legacy?.draft.acceptanceWindowSeconds ?? 0;
  assert.ok(w > 259_200 - 120 && w <= 259_200, String(w));
  const past = parseCreateDraft(
    JSON.stringify({ version: 1, step: 2, savedAt, draft: { title: "Old", acceptanceDeadlineLocal: "2001-01-01T00:00" } }),
    MAX_STEP
  );
  assert.equal(past?.draft.acceptanceWindowSeconds, DEFAULT_ACCEPTANCE_WINDOW_SECONDS);
  const options = acceptanceWindowOptions(5_400);
  assert.ok(options.some((o) => o.seconds === 5_400));
  assert.ok(options.every((o) => o.seconds > 0 && o.seconds <= MAX_ACCEPTANCE_WINDOW));
  assert.ok(acceptanceWindowOptions(172_800).some((o) => o.seconds === 172_800 && o.label === "2 days"));
});

test("wizard wiring: restore never sends; deadline fixed after loading the saved setup", () => {
  const wizard = readFileSync(new URL("../../../components/create/CreateWizard.tsx", import.meta.url), "utf8");
  const slice = (from: string, to: string) =>
    wizard.slice(wizard.indexOf(from), wizard.indexOf(to, wizard.indexOf(from) + from.length));
  const restore = slice("function restoreDraft", "function startFresh");
  for (const banned of ["submit(", "startCreate(", "runSetup(", "createContract", "resumeSetup("]) {
    assert.equal(restore.includes(banned), false, banned);
  }
  const fresh = slice("function startFresh", "\n  }\n");
  assert.ok(fresh.includes("clearCreateDraft("));
  assert.equal(fresh.includes("clearCreateIntent"), false);
  assert.match(wizard, /Restore draft/);
  assert.match(wizard, /Start fresh/);
  assert.match(wizard, /savedLoad\.kind !== "none"\) return;/);
  const submit = slice("async function submit()", "async function runSetup");
  assert.ok(submit.indexOf("loadSavedIntent(") < submit.indexOf("resolveAcceptanceDeadline("));
  assert.ok(submit.indexOf("saveCreateIntent(") < submit.indexOf("clearAllCreateDrafts("));
  assert.equal(submit.includes("acceptanceDeadlineLocal"), false);
  const finish = slice("function finishSetup", "\n  }\n");
  assert.ok(finish.includes("clearAllCreateDrafts("));
  const copilot = readFileSync(new URL("../copilot.ts", import.meta.url), "utf8");
  assert.match(copilot, /acceptanceWindowSeconds: proposal\.acceptanceDeadlineOffsetSeconds/);
});
