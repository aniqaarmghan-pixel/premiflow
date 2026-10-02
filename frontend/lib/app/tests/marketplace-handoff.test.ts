import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  MARKETPLACE_NAV,
  baseUnitsToUi,
  marketplaceHandoffDraft,
  marketplaceHandoffPatch,
} from "@/lib/app/marketplace";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import type { CreateHandoff } from "@/lib/server/marketplace/service";

const FREELANCER = "FrL11111111111111111111111111111111111111111";

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
  const hostile = { ...handoff(), mint: "Evil", resolver: "Evil", decimals: 0 } as CreateHandoff;
  const patch = marketplaceHandoffPatch(hostile, locked.decimals);
  assert.deepEqual(Object.keys(patch).sort(), ["description", "freelancer", "paymentMode", "title", "totalAmountUi"]);
  const safe = marketplaceHandoffDraft(hostile);
  assert.equal(safe.mint, locked.mint.toBase58());
  assert.equal(safe.resolver, locked.resolver.address.toBase58());
});

test("marketplace UI: no auto-send, no on-chain client, real data only, nav entry", () => {
  const dir = "components/marketplace";
  const sources = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8"));
  for (const source of sources) {
    assert.doesNotMatch(source, /useStreamPayClient|createContract\(|sendTransaction|resolveDispute|signTransaction/);
    assert.doesNotMatch(source, /rating|testimonial|faker|lorem/i);
    // The marketplace never writes Create drafts directly.
    assert.doesNotMatch(source, /saveCreateDraft|NO_WALLET_DRAFT_OWNER|writeMarketplaceHandoffDraft/);
  }
  const detail = readFileSync(`${dir}/MarketplaceJobDetail.tsx`, "utf8");
  assert.match(detail, /savePendingHandoff\(browserStorage\(\), CREATE_SCOPE, wallet, handoff, Date\.now\(\)\)/);
  assert.match(detail, /router\.push\("\/create"\)/);
  assert.match(detail, /if \(createIntentExists\(wallet\)\)/);
  const shell = readFileSync("components/shell/AppShell.tsx", "utf8");
  assert.match(shell, /\{ href: "\/marketplace", label: "Marketplace", icon: Store \}/);
  assert.deepEqual(
    MARKETPLACE_NAV.map((n) => n.href),
    [
      "/marketplace",
      "/marketplace/jobs",
      "/marketplace/gigs",
      "/marketplace/freelancers",
      "/marketplace/post",
      "/marketplace/gigs/new",
      "/marketplace/my-jobs",
      "/marketplace/my-proposals",
      "/marketplace/my-gigs",
      "/marketplace/profile",
      "/marketplace/saved",
    ]
  );
});
