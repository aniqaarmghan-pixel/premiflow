import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatFriendlyTokenAmount, formatTokenAmount } from "../money";
import { DEMO_USDT_BADGE, DEVNET_TEST_ASSET_COPY, PREMIFLOW_TEST_TOKEN } from "../premiflow";
import { PUBLIC_NAV } from "../site-routes";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

test("Pricing is in public top nav next to How it works, and in the footer PREMIFLOW section", () => {
  const labels = PUBLIC_NAV.map((n) => n.label);
  assert.ok(labels.includes("Pricing"));
  assert.equal(labels[labels.indexOf("How it works") + 1], "Pricing");
  const pricing = PUBLIC_NAV.find((n) => n.label === "Pricing");
  assert.equal(pricing?.href, "/pricing");
  const footer = read("components/site/SiteFooter.tsx");
  assert.match(footer, /title: "PREMIFLOW"[\s\S]*?href: "\/pricing", label: "Pricing"/);
  const shell = read("components/site/PublicShell.tsx");
  assert.match(shell, /PUBLIC_NAV\.map/);
});

test("Demo USDT amounts display as $X.XX with a Devnet test-asset badge nearby", () => {
  assert.equal(formatFriendlyTokenAmount(7_930_000n, 6), "$7.93");
  assert.equal(formatFriendlyTokenAmount(230_760_000n, 6), "$230.76");
  assert.equal(formatFriendlyTokenAmount(230_760_000n, 6, "Demo USDT"), "$230.76");
  assert.equal(formatFriendlyTokenAmount(3_000_000n, 6, "ACME"), "3.00 ACME");
  // Exact token math / full-precision helper unchanged.
  assert.equal(formatTokenAmount(7_930_000n, 6), "7.93");
  assert.equal(DEMO_USDT_BADGE, "Demo USDT · Devnet test asset");
  assert.equal(DEVNET_TEST_ASSET_COPY.tooltip, "Not official USDT: a Devnet test token with no real value.");
  const note = read("components/ui/DevnetAssetNote.tsx");
  assert.match(note, /DEMO_USDT_BADGE/);
  assert.match(DEVNET_TEST_ASSET_COPY.tooltip, /Not official USDT/);
  for (const file of [
    "components/overview/OverviewPage.tsx",
    "components/contracts/PaymentProgress.tsx",
    "components/contracts/FeeSides.tsx",
    "components/create/CreateWizard.tsx",
  ]) {
    const src = read(file);
    assert.match(src, /formatFriendlyTokenAmount/, file);
    assert.match(src, /DevnetAssetNote/, file);
  }
  assert.equal(PREMIFLOW_TEST_TOKEN.symbol, "Demo USDT");
  assert.equal(PREMIFLOW_TEST_TOKEN.decimals, 6);
});
