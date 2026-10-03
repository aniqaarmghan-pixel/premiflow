import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import { GIG_VIDEO_HELP, normalizeGigVideoUrl, parseGigVideo } from "../video-embed";
import { playableVideoUrl } from "../marketplace-media";
import {
  attentionQueue,
  contractProgressItems,
  dashboardRoleContext,
  freelancerPipeline,
  hiringPipeline,
  portfolioTotals,
  statusDistribution,
} from "../dashboard-insights";
import { financialProgress } from "../view-model";
import type { ContractView } from "../../streampay-v2/types";
import type { ActionRequiredItem, OfferListItem } from "../dashboard-offers";
import type { MarketplaceWorkspaceData } from "../dashboard-command";

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");
const KEYS = [
  "SysvarC1ock11111111111111111111111111111111",
  "Stake11111111111111111111111111111111111111",
  "Vote111111111111111111111111111111111111111",
  "SysvarRent111111111111111111111111111111111",
].map((k) => new PublicKey(k));

function contract(over: Partial<ContractView> & { i: number }): ContractView {
  const { i, ...rest } = over;
  return {
    address: KEYS[i],
    paymentMode: "Milestone",
    status: "Active",
    totalAmount: 1000n,
    releasedAmount: 0n,
    withdrawnAmount: 0n,
    refundedAmount: 0n,
    createdAt: 100 + i,
    startTime: 0,
    endTime: 0,
    workUnitCount: 0,
    releasedUnitCount: 0,
    voidedUnitCount: 0,
    openReviewCount: 0,
    ...rest,
  } as unknown as ContractView;
}

/* ---------- Video rules (shared client + server) ---------- */

test("YouTube and Vimeo links normalize to canonical URLs and privacy embeds", () => {
  const yt = parseGigVideo("https://youtu.be/dQw4w9WgXcQ");
  assert.ok(yt && yt.kind === "youtube");
  assert.equal(yt.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(yt.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1");
  for (const u of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ]) {
    assert.equal(normalizeGigVideoUrl(u), "https://www.youtube.com/watch?v=dQw4w9WgXcQ", u);
  }
  const vm = parseGigVideo("https://vimeo.com/76979871");
  assert.ok(vm && vm.kind === "vimeo");
  assert.equal(vm.embedUrl, "https://player.vimeo.com/video/76979871?dnt=1");
  assert.equal(normalizeGigVideoUrl("https://player.vimeo.com/video/76979871"), "https://vimeo.com/76979871");
  assert.equal(parseGigVideo("https://vimeo.com/76979871/abc123def0")?.kind, "vimeo");
  for (const v of [yt, vm]) assert.doesNotMatch(v.embedUrl, /autoplay/i);
  const file = parseGigVideo("https://cdn.example.com/intro.mp4");
  assert.deepEqual(file && file.kind, "file");
  assert.equal(playableVideoUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.match(GIG_VIDEO_HELP, /YouTube/);
});

test("video allowlist rejects lookalike hosts, unsupported shapes and unsafe URLs", () => {
  for (const bad of [
    "https://www.youtube.com/watch?v=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/playlist?list=PL123",
    "https://youtu.be/dQw4w9WgXcQ/extra",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ",
    "https://vimeo.com/channels/staffpicks",
    "https://vimeo.com/abc",
    "https://player.vimeo.com/video/abc",
    "https://vimeo.com/123.mp4",
    "javascript:alert(1)",
    "https://cdn.example.com/page.html",
    "",
    null,
  ]) {
    assert.equal(parseGigVideo(bad), null, String(bad));
  }
});

test("video player: sandboxed privacy iframe, no autoplay, preview + form help", () => {
  const modal = read("components/marketplace/MarketplaceVideoModal.tsx");
  assert.match(modal, /sandbox="allow-scripts allow-same-origin allow-presentation"/);
  assert.match(modal, /src=\{video\.embedUrl\}/);
  assert.match(modal, /referrerPolicy="strict-origin-when-cross-origin"/);
  assert.doesNotMatch(modal, /autoPlay|autoplay/i);
  assert.match(modal, /export function GigVideoPreview/);
  const media = read("components/marketplace/MarketplaceGigMedia.tsx");
  assert.match(media, /<GigVideoPreview /);
  assert.match(media, /Includes a video from the seller/);
  const form = read("components/marketplace/MarketplaceGigForm.tsx");
  assert.match(form, /Video \(YouTube, Vimeo or direct \.mp4 \/ \.webm\)/);
  assert.match(form, /<VideoFieldHelp /);
  assert.match(form, /GIG_VIDEO_HELP/);
  const server = read("lib/server/marketplace/catalog-validation.ts");
  assert.match(server, /normalizeGigVideoUrl\(url\)/);
  assert.match(server, /from "\.\.\/\.\.\/app\/video-embed"/);
});

/* ---------- Dashboard insights (real data only) ---------- */

test("role context comes from real hiring/working contract counts", () => {
  assert.equal(dashboardRoleContext({ hiring: 2, working: 1 }).mode, "both");
  assert.equal(dashboardRoleContext({ hiring: 2, working: 0 }).mode, "hiring");
  assert.equal(dashboardRoleContext({ hiring: 0, working: 3 }).label, "Working");
  assert.equal(dashboardRoleContext({ hiring: 0, working: 0 }).mode, "new");
});

test("portfolio totals only sum existing financialProgress outputs", () => {
  const live = contract({ i: 0, totalAmount: 1000n, releasedAmount: 400n, withdrawnAmount: 100n });
  const done = contract({ i: 1, status: "Completed", totalAmount: 500n, releasedAmount: 500n, withdrawnAmount: 500n });
  const draft = contract({ i: 2, status: "Draft", totalAmount: 900n });
  const t = portfolioTotals([live, done, draft]);
  assert.equal(t.liveCount, 1);
  assert.equal(t.liveValue, financialProgress(live).total);
  assert.equal(t.inEscrow, financialProgress(live).remainingInEscrow);
  assert.equal(t.released, 900n);
  assert.deepEqual(portfolioTotals([]), { liveValue: 0n, inEscrow: 0n, released: 0n, liveCount: 0 });
  const src = read("lib/app/dashboard-insights.ts");
  assert.doesNotMatch(src, /remainingFreelancerClaim|remainingEmployerRefund|\* 10000n|Math\.random/);
});

test("contract progress uses real work units and stream timestamps", () => {
  const milestone = contract({ i: 0, workUnitCount: 5, releasedUnitCount: 2, voidedUnitCount: 1, releasedAmount: 250n });
  const stream = contract({ i: 1, paymentMode: "Streaming", startTime: 1000, endTime: 2000, createdAt: 50 });
  const [a, b] = contractProgressItems([milestone, stream, contract({ i: 2, status: "Completed" })], 1500);
  assert.equal(a.stepLabel, "2 of 4 work units released");
  assert.equal(a.stepPct, 50);
  assert.equal(a.releasedPct, 25);
  assert.equal(b.stepLabel, "50% of stream time elapsed");
  assert.equal(contractProgressItems([], 0).length, 0);
});

test("status distribution and pipelines count real records", () => {
  const list = [
    contract({ i: 0 }),
    contract({ i: 1, status: "PendingAcceptance" }),
    contract({ i: 2, status: "Completed" }),
    contract({ i: 3, status: "Cancelled" }),
  ];
  assert.deepEqual(
    statusDistribution(list).map((b) => [b.key, b.count]),
    [["setup", 1], ["active", 1], ["disputed", 0], ["done", 1], ["closed", 1]]
  );
  const workspace = {
    jobs: [{ status: "open" }, { status: "filled" }],
    proposals: [{ proposal: { status: "submitted" } }, { proposal: { status: "selected" } }],
    gigs: [],
    invitations: [],
  } as unknown as MarketplaceWorkspaceData;
  const hiring = hiringPipeline({ hiring: list, offersWaiting: 1, workspace });
  assert.deepEqual(hiring.map((s) => [s.label, s.value]), [["Open jobs", 1], ["Offers sent", 1], ["Active", 1], ["Completed", 1]]);
  const working = freelancerPipeline({ working: [], offersToAnswer: 0, workspace: null });
  assert.deepEqual(working.map((s) => s.label), ["Offers to answer", "Active", "Completed"]);
});

test("attention queue: overdue first, then real deadlines, then other real items", () => {
  const offer = (address: string, acceptanceDeadline: number, deadlinePassed: boolean) =>
    ({ address, href: `/contracts/${address}`, mode: "Fixed", acceptanceDeadline, deadlinePassed }) as OfferListItem;
  const action = { address: "X", href: "/contracts/X", mode: "Milestone", kind: "finishSetup", freelancerAddress: "F", note: "Finish setup", actionLabel: "Finish setup" } as ActionRequiredItem;
  const items = attentionQueue({
    actionItems: [action],
    offersToAnswer: [offer("A", 500, false), offer("B", 300, true)],
    reviewContracts: [contract({ i: 0, openReviewCount: 2 })],
    unreadMessages: 3,
    pendingInvitations: 1,
  });
  assert.deepEqual(items.map((i) => i.id), ["offer-B", "offer-A", "action-X", `review-${KEYS[0].toBase58()}`, "invitations", "messages"]);
  assert.equal(items[0].overdue, true);
  assert.deepEqual(
    attentionQueue({ actionItems: [], offersToAnswer: [], reviewContracts: [], unreadMessages: null, pendingInvitations: 0 }),
    []
  );
});

test("dashboard renders the command center from real hooks only", () => {
  const overview = read("components/overview/OverviewPage.tsx");
  for (const marker of [
    "<CommandHeader context={roleContext} />",
    "<AttentionPanel items={attention} />",
    "<ContractProgressPanel items={progressItems} />",
    "<StatusChartPanel buckets={distribution} />",
    'title="Hiring pipeline"',
    'title="Freelancer pipeline"',
    "portfolioTotals(grouped.all)",
    "grouped.all.length > 0 && !mixedMints",
    "<CountUp value={value} />",
  ]) {
    assert.ok(overview.includes(marker), marker);
  }
  const ws = read("components/overview/DashboardWorkspace.tsx");
  const quick = ws.slice(ws.indexOf("export const QUICK_ACTIONS"));
  assert.match(quick, /\{ href: "\/", label: "Explore Marketplace"/);
  assert.ok(quick.indexOf("Explore Marketplace") < quick.indexOf("Post Job"));
  assert.ok(quick.indexOf("Offer Gig") < quick.indexOf("Create Protected Contract"));
  const visuals = read("components/overview/DashboardVisuals.tsx");
  assert.match(visuals, /useReducedMotion/);
  assert.match(visuals, /role="progressbar"/);
  const css = read("app/globals.css");
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.pf-progress \{\s*animation: none;/);
});

/* ---------- Shell: Explore CTA, sidebar, bottom nav ---------- */

test("Explore Marketplace is the first prominent sidebar and drawer action", () => {
  const shell = read("components/shell/AppShell.tsx");
  assert.match(shell, /function ExploreMarketplaceLink/);
  assert.equal((shell.match(/<ExploreMarketplaceLink/g) ?? []).length, 2);
  const sidebarCta = shell.indexOf("<ExploreMarketplaceLink />");
  const sidebarNav = shell.indexOf('aria-label="Dashboard sections"');
  assert.ok(sidebarCta > 0 && sidebarCta < sidebarNav);
  const drawerCta = shell.indexOf("<ExploreMarketplaceLink onNavigate");
  const drawerNav = shell.indexOf('<nav aria-label="Dashboard" ');
  assert.ok(drawerCta > 0 && drawerCta < drawerNav);
  const css = read("app/globals.css");
  assert.match(css, /\.pf-rail\s*\{\s*-ms-overflow-style: none;/);
  assert.match(css, /\.pf-rail::-webkit-scrollbar \{\s*display: none;/);
});

test("mobile bottom nav: Home / Explore / Contracts / Messages / More with safe-area padding", () => {
  const nav = read("components/shell/DashboardBottomNav.tsx");
  const hrefs = [...nav.matchAll(/\{ href: "([^"]+)", label: "([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(hrefs, [["/dashboard", "Home"], ["/", "Explore"], ["/contracts", "Contracts"], ["/activity", "Messages"]]);
  assert.match(nav, />More</);
  assert.match(nav, /onClick=\{onMore\}/);
  assert.match(nav, /pb-\[env\(safe-area-inset-bottom\)\]/);
  assert.match(nav, /lg:hidden/);
  assert.match(nav, /min-h-14/);
  const shell = read("components/shell/AppShell.tsx");
  assert.match(shell, /<DashboardBottomNav pathname=\{pathname\} moreOpen=\{open\} onMore=\{\(\) => setOpen\(true\)\} \/>/);
  assert.match(shell, /pb-\[calc\(7\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
});
