import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatDuration, formatReviewPeriod } from "../datetime";
import { formatFriendlyTokenAmount, formatTokenAmount } from "../money";
import { MARKETPLACE_COPY } from "../marketplace";

const read = (path: string) => readFileSync(path, "utf8");

test("summary money: friendly ~2 decimals + token symbol; full precision helper unchanged", () => {
  // 230.696642 base-ui at 6 decimals = 230696642n
  const base = 230_696_642n;
  assert.equal(formatTokenAmount(base, 6), "230.696642");
  assert.equal(formatFriendlyTokenAmount(base, 6, "PFT"), "230.70 PFT");
  assert.equal(formatFriendlyTokenAmount(100_000_000n, 6, "PFT"), "100.00 PFT");
  assert.equal(formatFriendlyTokenAmount(base, 6), "$230.70");
  assert.equal(formatFriendlyTokenAmount(7_930_000n, 6), "$7.93");
});

test("humanize durations: 86400s -> 1 day, not raw seconds", () => {
  assert.equal(formatDuration(86_400), "1 day");
  assert.equal(formatDuration(7_200), "2 hours");
  assert.equal(formatReviewPeriod(86_400), "1 day");
  const wizard = read("components/create/CreateWizard.tsx");
  assert.doesNotMatch(wizard, /\$\{draft\.(durationSeconds|reviewDuration)\}s/);
  assert.match(wizard, /formatDuration\(draft\.durationSeconds\)/);
  assert.match(wizard, /formatReviewPeriod\(draft\.reviewDuration\)/);
});

test("account vs wallet: signed-in empty states do not say Connect wallet to continue", () => {
  assert.equal(MARKETPLACE_COPY.walletNotConnected, "Wallet not connected.");
  assert.match(MARKETPLACE_COPY.connectWallet, /sign this action/i);
  const dw = read("components/overview/DashboardWorkspace.tsx");
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  assert.match(dw, /walletNotConnected/);
  assert.doesNotMatch(dw, /MARKETPLACE_COPY\.connectWallet\}/);
  assert.match(parts, /walletNotConnected/);
});

test("jargon and activity wording are plain language", () => {
  const activity = read("components/activity/ActivityPage.tsx");
  const overview = read("components/overview/OverviewPage.tsx");
  assert.match(activity, /Contract timeline/);
  assert.doesNotMatch(activity, /Deterministic timeline|WorkUnitStaleRevisionVoided|terminated`/);
  assert.match(activity, /Contract completed|Contract cancelled|Offer declined/);
  assert.match(overview, /Contract history/);
  assert.doesNotMatch(overview, /Lifecycle stamps/);
  assert.match(overview, /formatFriendlyTokenAmount/);
});

test("nav groups Hire / Work / Contracts / Account; routes preserved", () => {
  const shell = read("components/shell/AppShell.tsx");
  for (const title of ['title: "Hire"', 'title: "Work"', 'title: "Contracts"', 'title: "Account"']) {
    assert.match(shell, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const href of [
    "/marketplace/post",
    "/marketplace/gigs/new",
    "/marketplace/my-jobs",
    "/marketplace/my-proposals",
    "/marketplace/my-gigs",
    "/marketplace/invitations",
    "/marketplace/saved",
    "/contracts",
    "/create",
    "/activity",
    "/dashboard/reviews",
    "/marketplace/profile",
    "/support",
    "/",
    "/about",
  ]) {
    assert.match(shell, new RegExp(`href: "${href.replace(/\//g, "\\/")}"`));
  }
});

test("assistant stays collapsed by default; public header strengthens after scroll", () => {
  const asst = read("components/copilot/FloatingAssistant.tsx");
  assert.match(asst, /useState\(false\)[\s\S]*useState\(false\)/);
  assert.match(asst, /must not cover dashboard cards/);
  const shell = read("components/site/PublicShell.tsx");
  assert.match(shell, /backdrop-blur-xl/);
  assert.match(shell, /bg-\[var\(--midnight\)\]\/92/);
  // Logo sizes are a separate pass ? this polish must not resize them.
  assert.match(shell, /trim size=\{58\}/);
});

test("homepage hero names Solana-protected contracts and four payment models", () => {
  const home = read("components/marketplace/MarketplaceHome.tsx");
  assert.match(home, /Solana-protected freelance contracts/);
  assert.match(home, /Fixed, Milestone, Streaming, or Hourly/);
  assert.doesNotMatch(home, /Hire talent and get hired, with escrow built in/);
});
