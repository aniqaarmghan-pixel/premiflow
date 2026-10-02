import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NO_WALLET_DRAFT_OWNER,
  createDraftStorageKey,
  loadCreateDraft,
  saveCreateDraft,
} from "@/lib/app/create-draft-store";
import {
  handoffPromptKind,
  loadPendingHandoff,
  marketplaceHandoffKey,
  resolveHandoffChoice,
  savePendingHandoff,
} from "@/lib/app/marketplace-handoff-store";
import type { IntentScope, IntentStorage } from "@/lib/app/milestone-create-plan";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { applyCreateDraftPatch, defaultCreateDraft } from "@/lib/app/validation";
import type { CreateHandoff } from "@/lib/server/marketplace/service";

const SCOPE: IntentScope = { cluster: "devnet", programId: "Prog1111111111111111111111111111111111111111" };
const EMPLOYER = "Emp11111111111111111111111111111111111111111";
const OTHER_EMPLOYER = "Oth11111111111111111111111111111111111111111";
const FREELANCER = "FrL11111111111111111111111111111111111111111";
const INTENT_KEY = "premiflow:create-intent:v1:devnet:Prog:Emp";

function memoryStorage() {
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
  return { map, storage: storage as IntentStorage };
}

function handoff(overrides: Partial<CreateHandoff> = {}): CreateHandoff {
  return {
    jobId: "00000000-0000-4000-8000-000000000001",
    proposalId: "00000000-0000-4000-8000-000000000002",
    title: "Landing page build",
    description: "Build a responsive landing page.",
    paymentMode: "Fixed",
    amount: "250500000",
    freelancerWallet: FREELANCER,
    ...overrides,
  };
}

function existingDraft() {
  return applyCreateDraftPatch(defaultCreateDraft(), {
    title: "My own unfinished draft",
    freelancer: "Own1111111111111111111111111111111111111111",
  });
}

test("pending handoff: separate record scoped by cluster, program and wallet", () => {
  const { storage, map } = memoryStorage();
  assert.equal(savePendingHandoff(storage, SCOPE, EMPLOYER, handoff(), 5), true);
  assert.deepEqual([...map.keys()], [marketplaceHandoffKey(SCOPE, EMPLOYER)]);
  assert.ok(!map.has(createDraftStorageKey(SCOPE, EMPLOYER)), "never written into the draft");
  assert.equal(loadPendingHandoff(storage, SCOPE, EMPLOYER)?.handoff.title, "Landing page build");
  assert.equal(loadPendingHandoff(storage, SCOPE, OTHER_EMPLOYER), null);
  assert.equal(loadPendingHandoff(storage, { ...SCOPE, cluster: "mainnet" }, EMPLOYER), null);
  // Only known fields are stored.
  const hostile = { ...handoff(), mint: "Evil", resolver: "Evil" } as CreateHandoff;
  savePendingHandoff(storage, SCOPE, EMPLOYER, hostile, 6);
  assert.doesNotMatch(map.get(marketplaceHandoffKey(SCOPE, EMPLOYER)) ?? "", /mint|resolver|decimals/);
  // Corrupt / invalid records are dropped.
  map.set(marketplaceHandoffKey(SCOPE, EMPLOYER), "{not json");
  assert.equal(loadPendingHandoff(storage, SCOPE, EMPLOYER), null);
  assert.equal(map.size, 0);
  assert.equal(savePendingHandoff(storage, SCOPE, EMPLOYER, handoff({ amount: "0" }), 7), false);
});

test("pending handoff: walletless handoff can never be stored or reappear", () => {
  const { storage, map } = memoryStorage();
  for (const owner of [null, "", "  ", NO_WALLET_DRAFT_OWNER]) {
    assert.equal(savePendingHandoff(storage, SCOPE, owner, handoff(), 1), false);
    assert.equal(loadPendingHandoff(storage, SCOPE, owner), null);
  }
  assert.equal(map.size, 0);
  // Even a planted walletless record is ignored.
  map.set(`premiflow:marketplace-handoff:v1:devnet:${SCOPE.programId}:${NO_WALLET_DRAFT_OWNER}`, JSON.stringify({ version: 1, handoff: handoff() }));
  assert.equal(loadPendingHandoff(storage, SCOPE, NO_WALLET_DRAFT_OWNER), null);
  assert.equal(loadCreateDraft(storage, SCOPE, NO_WALLET_DRAFT_OWNER, 10), null);
});

test("prompt: explicit choice always required; replace-or-keep when a draft exists", () => {
  assert.equal(handoffPromptKind({ pending: false, draftExists: true, intentExists: false }), "none");
  assert.equal(handoffPromptKind({ pending: true, draftExists: false, intentExists: false }), "import_or_dismiss");
  assert.equal(handoffPromptKind({ pending: true, draftExists: true, intentExists: false }), "replace_or_keep");
  assert.equal(handoffPromptKind({ pending: true, draftExists: true, intentExists: true }), "blocked_by_intent");
});

test("keep current draft: existing draft preserved, handoff consumed and gone after reload", () => {
  const { storage } = memoryStorage();
  saveCreateDraft(storage, SCOPE, EMPLOYER, { draft: existingDraft(), step: 1, nowMs: 1, intentExists: false });
  savePendingHandoff(storage, SCOPE, EMPLOYER, handoff(), 2);
  const result = resolveHandoffChoice(storage, SCOPE, EMPLOYER, "keep", { intentExists: false });
  assert.deepEqual(result, { draft: null, consumed: true, blocked: false });
  assert.equal(loadCreateDraft(storage, SCOPE, EMPLOYER, 10)?.draft.title, "My own unfinished draft");
  assert.equal(loadPendingHandoff(storage, SCOPE, EMPLOYER), null);
});

test("use selected proposal: explicit import returns locked prefilled draft, consumed once", () => {
  const locked = lockedCreatePayment();
  const { storage } = memoryStorage();
  saveCreateDraft(storage, SCOPE, EMPLOYER, { draft: existingDraft(), step: 1, nowMs: 1, intentExists: false });
  savePendingHandoff(storage, SCOPE, EMPLOYER, handoff(), 2);
  // Before the explicit choice nothing changes.
  assert.equal(loadCreateDraft(storage, SCOPE, EMPLOYER, 10)?.draft.title, "My own unfinished draft");
  const first = resolveHandoffChoice(storage, SCOPE, EMPLOYER, "import", { intentExists: false });
  assert.equal(first.consumed, true);
  assert.equal(first.draft?.freelancer, FREELANCER);
  assert.equal(first.draft?.title, "Landing page build");
  assert.equal(first.draft?.mint, locked.mint.toBase58());
  assert.equal(first.draft?.resolver, locked.resolver.address.toBase58());
  // Import itself never rewrites the stored draft; the wizard saves after the user's choice.
  assert.equal(loadCreateDraft(storage, SCOPE, EMPLOYER, 10)?.draft.title, "My own unfinished draft");
  const second = resolveHandoffChoice(storage, SCOPE, EMPLOYER, "import", { intentExists: false });
  assert.deepEqual(second, { draft: null, consumed: false, blocked: false });
  assert.equal(loadPendingHandoff(storage, SCOPE, EMPLOYER), null);
});

test("existing create intent: import refused, intent and handoff untouched", () => {
  const { storage, map } = memoryStorage();
  map.set(INTENT_KEY, '{"intent":"saved-attempt"}');
  savePendingHandoff(storage, SCOPE, EMPLOYER, handoff(), 2);
  const before = new Map(map);
  const result = resolveHandoffChoice(storage, SCOPE, EMPLOYER, "import", { intentExists: true });
  assert.deepEqual(result, { draft: null, consumed: false, blocked: true });
  assert.deepEqual(map, before);
  // Dismiss removes only the handoff record, never the intent.
  resolveHandoffChoice(storage, SCOPE, EMPLOYER, "dismiss", { intentExists: true });
  assert.equal(map.get(INTENT_KEY), '{"intent":"saved-attempt"}');
  assert.equal(loadPendingHandoff(storage, SCOPE, EMPLOYER), null);
});

test("wizard wiring: explicit buttons, wallet-scoped, no auto-send, draft prompt yields", () => {
  const wizard = readFileSync("components/create/CreateWizard.tsx", "utf8");
  assert.match(wizard, /onClick=\{\(\) => chooseHandoff\("import"\)\}/);
  assert.match(wizard, /onClick=\{\(\) => chooseHandoff\("keep"\)\}/);
  assert.match(wizard, /\{handoffUseLabel\(pendingHandoff\.handoff\)\}/);
  assert.match(wizard, /Keep current draft/);
  assert.match(wizard, /if \(!hydrated \|\| !employerKey \|\| handoffDecidedFor === employerKey\) return null;/);
  assert.match(wizard, /intentExists: savedLoad\.kind !== "none"/);
  assert.match(wizard, /\{draftOffer && !pendingHandoff \? \(/);
  assert.match(wizard, /onClick=\{\(\) => restoreDraft\(draftOffer\)\}/);
  const chooser = wizard.slice(wizard.indexOf("function chooseHandoff"), wizard.indexOf("const errors = useMemo"));
  assert.doesNotMatch(chooser, /submit|createContract|runCreate|sendTransaction|clearCreateIntent|discard/i);
});
