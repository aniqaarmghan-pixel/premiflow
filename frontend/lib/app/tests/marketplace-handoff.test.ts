import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { loadCreateDraft } from "@/lib/app/create-draft-store";
import {
  MARKETPLACE_NAV,
  baseUnitsToUi,
  marketplaceHandoffDraft,
  marketplaceHandoffPatch,
  writeMarketplaceHandoffDraft,
} from "@/lib/app/marketplace";
import type { IntentScope, IntentStorage } from "@/lib/app/milestone-create-plan";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import type { CreateHandoff } from "@/lib/server/marketplace/service";

const SCOPE: IntentScope = { cluster: "devnet", programId: "Prog1111111111111111111111111111111111111111" };
const EMPLOYER = "Emp11111111111111111111111111111111111111111";
const FREELANCER = "FrL11111111111111111111111111111111111111111";

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

test("handoff: base units become a plain UI amount", () => {
  assert.equal(baseUnitsToUi("250500000", 6), "250.5");
  assert.equal(baseUnitsToUi("1", 6), "0.000001");
  assert.equal(baseUnitsToUi("1000000", 6), "1");
  assert.equal(baseUnitsToUi("42", 0), "42");
  assert.equal(baseUnitsToUi("abc", 6), "");
});

test("handoff: prefills freelancer, title, description, mode, amount; locked fields kept", () => {
  const locked = lockedCreatePayment();
  const draft = marketplaceHandoffDraft(handoff());
  assert.equal(draft.freelancer, FREELANCER);
  assert.equal(draft.title, "Landing page build");
  assert.equal(draft.description, "Build a responsive landing page.");
  assert.equal(draft.paymentMode, "Fixed");
  assert.equal(draft.totalAmountUi, baseUnitsToUi("250500000", locked.decimals));
  assert.equal(draft.mint, locked.mint.toBase58());
  assert.equal(draft.resolver, locked.resolver.address.toBase58());
  assert.equal(draft.decimals, locked.decimals);
  const hourly = marketplaceHandoffPatch(handoff({ paymentMode: "Hourly" }), locked.decimals);
  assert.equal(hourly.hourlyRateUi, baseUnitsToUi("250500000", locked.decimals));
  assert.equal(hourly.totalAmountUi, undefined);
  // Hostile extra fields never cross the boundary.
  const hostile = { ...handoff(), mint: "Evil", resolver: "Evil", decimals: 0 } as CreateHandoff;
  const patch = marketplaceHandoffPatch(hostile, locked.decimals);
  assert.deepEqual(Object.keys(patch).sort(), ["description", "freelancer", "paymentMode", "title", "totalAmountUi"]);
  const safe = marketplaceHandoffDraft(hostile);
  assert.equal(safe.mint, locked.mint.toBase58());
  assert.equal(safe.resolver, locked.resolver.address.toBase58());
});

test("handoff: written as a restorable Create draft for each owner; never with an intent", () => {
  const locked = lockedCreatePayment();
  const { storage, map } = memoryStorage();
  assert.equal(
    writeMarketplaceHandoffDraft(storage, SCOPE, [EMPLOYER], handoff(), { nowMs: 1, intentExists: true }),
    false
  );
  assert.equal(map.size, 0);
  assert.equal(
    writeMarketplaceHandoffDraft(storage, SCOPE, [EMPLOYER, "no-wallet"], handoff(), {
      nowMs: 1_000,
      intentExists: false,
    }),
    true
  );
  for (const owner of [EMPLOYER, "no-wallet"]) {
    const saved = loadCreateDraft(storage, SCOPE, owner, 10);
    assert.ok(saved, owner);
    assert.equal(saved.step, 0);
    assert.equal(saved.draft.freelancer, FREELANCER);
    assert.equal(saved.draft.title, "Landing page build");
    assert.equal(saved.draft.mint, locked.mint.toBase58());
    assert.equal(saved.draft.resolver, locked.resolver.address.toBase58());
  }
  for (const raw of map.values()) {
    assert.doesNotMatch(raw, /"mint"|"resolver"|"decimals"/);
  }
});

test("marketplace UI: no auto-send, no on-chain client, real data only, nav entry", () => {
  const dir = "components/marketplace";
  const sources = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8"));
  for (const source of sources) {
    assert.doesNotMatch(source, /useStreamPayClient|createContract\(|sendTransaction|resolveDispute|signTransaction/);
    assert.doesNotMatch(source, /rating|testimonial|faker|lorem/i);
  }
  const detail = readFileSync(`${dir}/MarketplaceJobDetail.tsx`, "utf8");
  assert.match(detail, /writeMarketplaceHandoffDraft\(/);
  assert.match(detail, /router\.push\("\/create"\)/);
  assert.match(detail, /if \(createIntentExists\(wallet\)\)/);
  // The wizard still requires an explicit Restore draft and Create & Send Offer.
  const wizard = readFileSync("components/create/CreateWizard.tsx", "utf8");
  assert.match(wizard, /onClick=\{\(\) => restoreDraft\(draftOffer\)\}/);
  assert.doesNotMatch(wizard, /marketplace/i);
  const shell = readFileSync("components/shell/AppShell.tsx", "utf8");
  assert.match(shell, /\{ href: "\/marketplace", label: "Marketplace", icon: Store \}/);
  assert.deepEqual(
    MARKETPLACE_NAV.map((n) => n.href),
    ["/marketplace", "/marketplace/post", "/marketplace/my-jobs", "/marketplace/my-proposals"]
  );
});
