import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildContractsListHref,
  filterContractsByListQuery,
  parseContractsListQuery,
  DEFAULT_CONTRACTS_LIST_QUERY,
} from "../contracts-list-query";
import { freelancerPipeline, hiringPipeline } from "../dashboard-insights";
import { roleAwareStatusLabel } from "../dashboard-offers";
import { dashboardSummary, dashboardSummaryForWallets, groupContractsByRole } from "../view-model";
import { makeContract, MINT, WALLET_A, WALLET_B } from "../../streampay-v2/tests/fixtures";

const START = 1_000;
const END = 2_000;
const BEFORE = 1_500;
const AFTER = 9_000;
const stream = makeContract({
  paymentMode: "Streaming",
  status: "Active",
  startTime: START,
  endTime: END,
  durationSeconds: 1_000,
  mainAmount: 1_000n,
  totalAmount: 1_000n,
});
const fixed = makeContract({ address: MINT, paymentMode: "Fixed", status: "Active", startTime: START, endTime: END });
const read = (p: string) => readFileSync(p, "utf8");

test("assistant status label: Active before end, Streaming ended at and after end", () => {
  assert.equal(roleAwareStatusLabel(WALLET_A, stream, BEFORE), "Active");
  assert.equal(roleAwareStatusLabel(WALLET_A, stream, END), "Streaming ended");
  assert.equal(roleAwareStatusLabel(WALLET_B, stream, AFTER), "Streaming ended");
  const src = read("components/copilot/FloatingAssistant.tsx");
  assert.match(src, /useNow\(30_000\)/);
  assert.match(src, /roleAwareStatusLabel\(publicKey, contract, now\)/);
  assert.match(src, /\[contractAddress, grouped\.all, publicKey, now\]/);
});

test("dashboard counts: ended streams are counted separately, not as active or live", () => {
  const grouped = groupContractsByRole(WALLET_A, [stream, fixed]);
  const before = dashboardSummary(WALLET_A, grouped, BEFORE);
  assert.deepEqual([before.active, before.streamingActive, before.streamingEnded], [2, 1, 0]);
  for (const now of [END, AFTER]) {
    const s = dashboardSummaryForWallets([WALLET_A], grouped, now);
    assert.deepEqual([s.active, s.streamingActive, s.streamingEnded], [1, 0, 1]);
  }
  // Without a clock the on-chain counts are unchanged.
  const raw = dashboardSummary(WALLET_A, grouped);
  assert.deepEqual([raw.active, raw.streamingActive, raw.streamingEnded], [2, 1, 0]);

  const pipe = (now?: number) =>
    hiringPipeline({ hiring: grouped.hiring, offersWaiting: 0, workspace: null, now }).map((s) => [s.label, s.value]);
  assert.deepEqual(pipe(BEFORE), [["Offers sent", 0], ["Active", 2], ["Completed", 0]]);
  assert.deepEqual(pipe(END), [["Offers sent", 0], ["Active", 1], ["Streaming ended", 1], ["Completed", 0]]);
  assert.deepEqual(pipe(AFTER), pipe(END));
  const working = groupContractsByRole(WALLET_B, [stream]);
  const fp = freelancerPipeline({ working: working.working, offersToAnswer: 0, workspace: null, now: AFTER });
  assert.deepEqual(fp.find((s) => s.label === "Streaming ended")?.href, "/contracts?role=working&status=ended");
  const overview = read("components/overview/OverviewPage.tsx");
  assert.match(overview, /dashboardSummaryForWallets\(accountWallets, grouped, now\)/);
  assert.match(overview, /OVERVIEW_DASHBOARD_HREFS\.endedStreams/);
});

test("contracts filter: Active excludes ended streams; ended filter keeps access to them", () => {
  const grouped = groupContractsByRole(WALLET_A, [stream, fixed]);
  const active = { ...DEFAULT_CONTRACTS_LIST_QUERY, status: "Active" as const };
  const ended = { ...DEFAULT_CONTRACTS_LIST_QUERY, status: "ended" as const };
  assert.equal(filterContractsByListQuery(grouped, active, BEFORE).length, 2);
  assert.equal(filterContractsByListQuery(grouped, ended, BEFORE).length, 0);
  for (const now of [END, AFTER]) {
    assert.deepEqual(filterContractsByListQuery(grouped, active, now), [fixed]);
    assert.deepEqual(filterContractsByListQuery(grouped, ended, now), [stream]);
  }
  assert.equal(parseContractsListQuery(new URLSearchParams("status=ended")).status, "ended");
  assert.equal(buildContractsListHref({ status: "ended" }), "/contracts?status=ended");
  const page = read("components/contracts/ContractsPage.tsx");
  assert.match(page, /filterContractsByListQuery\(groupedWithResolving, query, now\)/);
  assert.match(page, /<option value="ended">\{ENDED_STREAMS_FILTER_LABEL\}<\/option>/);
});

test("desktop density: no zoom, scale or root font-size hacks; mobile targets kept", () => {
  const css = read("app/globals.css");
  assert.doesNotMatch(css, /(^|[;{\s])zoom\s*:/m);
  assert.doesNotMatch(css, /(html|:root)\s*\{[^}]*font-size/);
  const changed = [
    "components/shell/AppShell.tsx",
    "components/ui/Button.tsx",
    "components/ui/Field.tsx",
    "components/ui/Modal.tsx",
    "components/overview/OverviewPage.tsx",
    "components/site/PublicShell.tsx",
    "components/contracts/ContractsPage.tsx",
    "components/marketplace/MarketplaceHome.tsx",
    "components/marketplace/MarketplaceParts.tsx",
  ];
  for (const p of changed) {
    const src = read(p);
    assert.doesNotMatch(src, /(?<![\w-])zoom\b(?!-)|lg:scale-|xl:scale-|transform:\s*scale/, p);
  }
  const button = read("components/ui/Button.tsx");
  assert.match(button, /min-h-11 [^"`]*lg:min-h-10/);
  const field = read("components/ui/Field.tsx");
  assert.match(field, /min-h-11 [^"]*lg:min-h-10/);
  const shell = read("components/shell/AppShell.tsx");
  assert.match(shell, /lg:grid-cols-\[224px_minmax\(0,1fr\)\]/);
  assert.match(shell, /lg:h-\[100dvh\]/);
});

test("logo sizes preserved: public 44px / 1.64rem from sm up, 34 / 1.3rem mobile, app shell 44", () => {
  const pub = read("components/site/PublicShell.tsx");
  assert.match(pub, /<BrandMark light size=\{44\} wordmarkFontSize="1\.64rem" \/>/);
  assert.match(pub, /<BrandMark light size=\{34\} wordmarkFontSize="1\.3rem" \/>/);
  assert.match(pub, /h-16 w-full max-w-7xl/);
  const shell = read("components/shell/AppShell.tsx");
  assert.match(shell, /<BrandMark light size=\{44\}/);
});
