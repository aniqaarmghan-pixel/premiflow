import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SESSION_RETRY_CAP_MS,
  SESSION_RETRY_LIMIT,
  classifySessionCheck,
  classifySessionError,
  createSessionMemory,
  sessionRetryDelayMs,
  shouldRetrySessionCheck,
} from "../../account-auth/session-state";
import { accountAuthRetryDelayMs } from "../../account-auth/session-flow";
import { nextTrapIndex } from "../../hooks/useDialogFocus";
import { playableVideoUrl } from "../marketplace-media";
import {
  greetingName,
  isMarketplaceWorkspaceEmpty,
  marketplaceWorkspaceCards,
  reputationLine,
  upcomingDeadlines,
  type MarketplaceWorkspaceData,
} from "../dashboard-command";
import type { OfferListItem } from "../dashboard-offers";

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

/* ---------------- 1. Auth / session ---------------- */

test("only a genuine 401 counts as expired; 5xx, fetch failures and timeouts are transient", () => {
  assert.equal(classifySessionError({ status: 401 }), "expired");
  for (const error of [
    { status: 500 },
    { status: 502 },
    { status: 503 },
    { status: 504 },
    { status: 0, message: "fetch failed" },
    { name: "TimeoutError", message: "The operation timed out" },
    { name: "TypeError", message: "Failed to fetch" },
  ]) {
    assert.equal(classifySessionError(error), "transient", JSON.stringify(error));
  }
  assert.equal(classifySessionError(null), null);
});

test("session check: transient failure is 'unavailable', never 'unauthenticated'", () => {
  assert.equal(classifySessionCheck({ hasUser: true, isPending: false, error: { status: 503 } }), "authenticated");
  assert.equal(classifySessionCheck({ hasUser: false, isPending: true, error: null }), "pending");
  assert.equal(classifySessionCheck({ hasUser: false, isPending: false, error: { status: 503 } }), "unavailable");
  assert.equal(classifySessionCheck({ hasUser: false, isPending: false, error: { message: "fetch failed" } }), "unavailable");
  assert.equal(classifySessionCheck({ hasUser: false, isPending: false, error: { status: 401 } }), "unauthenticated");
  assert.equal(classifySessionCheck({ hasUser: false, isPending: false, error: null }), "unauthenticated");
});

test("bounded, capped exponential backoff for session retries", () => {
  assert.equal(SESSION_RETRY_LIMIT, 3);
  assert.deepEqual([0, 1, 2, 3, 4, 10].map((n) => sessionRetryDelayMs(n)), [1000, 2000, 4000, 8000, 8000, 8000]);
  assert.ok(sessionRetryDelayMs(50) <= SESSION_RETRY_CAP_MS);
  assert.equal(shouldRetrySessionCheck("unavailable", 0), true);
  assert.equal(shouldRetrySessionCheck("unavailable", 2), true);
  assert.equal(shouldRetrySessionCheck("unavailable", 3), false);
  assert.equal(shouldRetrySessionCheck("unauthenticated", 0), false);
  assert.equal(shouldRetrySessionCheck("authenticated", 0), false);
  assert.deepEqual([0, 1, 2, 3, 9].map((n) => accountAuthRetryDelayMs(n)), [800, 1600, 3200, 4000, 4000]);
});

test("session memory keeps the confirmed user through transient retries and clears only on clear()", () => {
  const memory = createSessionMemory<{ id: string }>();
  let notified = 0;
  const off = memory.subscribe(() => notified++);
  const user = { id: "u1" };
  memory.confirm(user);
  memory.recordAttempt();
  memory.recordAttempt();
  assert.equal(memory.getSnapshot().user, user);
  assert.equal(memory.getSnapshot().attempts, 2);
  memory.resetAttempts();
  assert.equal(memory.getSnapshot().attempts, 0);
  assert.equal(memory.getSnapshot().user, user);
  memory.clear();
  assert.equal(memory.getSnapshot().user, null);
  assert.ok(notified >= 4);
  off();
});

test("AppShell redirects to sign-in only when unauthenticated and shows reconnect states", () => {
  const shell = read("components/shell/AppShell.tsx");
  assert.match(shell, /useAccountSession\(\)/);
  assert.match(shell, /sessionStatus !== "unauthenticated"/);
  assert.match(shell, /Reconnecting/);
  assert.match(shell, /Try again/);
  assert.doesNotMatch(shell, /wrong (email|password|credentials)/i);
  const hook = read("lib/account-auth/useAccountSession.ts");
  assert.match(hook, /shouldRetrySessionCheck/);
  assert.match(hook, /sessionRetryDelayMs/);
  assert.match(hook, /refetch/);
});

test("sign-in retries transient failures and never maps them to wrong credentials", () => {
  const page = read("app/sign-in/page.tsx");
  assert.match(page, /retries: 2/);
});

/* ---------------- Dialog focus / drawer ---------------- */

test("focus trap index wraps in both directions", () => {
  assert.equal(nextTrapIndex(-1, 3, false), 0);
  assert.equal(nextTrapIndex(-1, 3, true), 2);
  assert.equal(nextTrapIndex(2, 3, false), 0);
  assert.equal(nextTrapIndex(0, 3, true), 2);
  assert.equal(nextTrapIndex(1, 3, false), 2);
  assert.equal(nextTrapIndex(0, 0, false), -1);
});

test("mobile dashboard drawer is an accessible dialog and the sidebar hides its scrollbar", () => {
  const shell = read("components/shell/AppShell.tsx");
  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /aria-label="Dashboard navigation"/);
  assert.match(shell, /useDialogFocus\(/);
  assert.match(shell, /data-autofocus/);
  assert.match(shell, /aria-expanded=\{open\}/);
  assert.match(shell, /pf-rail/);
  const hook = read("lib/hooks/useDialogFocus.ts");
  assert.match(hook, /Escape/);
  assert.match(hook, /document\.body\.style\.overflow = "hidden"/);
  assert.match(hook, /opener\.focus\(\)/);
  const css = read("app/globals.css");
  assert.match(css, /\.pf-rail\s*\{[^}]*scrollbar-width:\s*none/);
});

test("shared Modal traps focus, uses a unique title id and respects reduced motion", () => {
  const modal = read("components/ui/Modal.tsx");
  assert.match(modal, /useDialogFocus\(open, panelRef, onClose\)/);
  assert.match(modal, /aria-labelledby=\{titleId\}/);
  assert.match(modal, /useReducedMotion/);
  assert.doesNotMatch(modal, /id="modal-title"/);
});

/* ---------------- 2. Marketplace video ---------------- */

test("playableVideoUrl accepts only direct https video files", () => {
  assert.equal(playableVideoUrl("https://cdn.example.com/a/intro.mp4"), "https://cdn.example.com/a/intro.mp4");
  assert.equal(playableVideoUrl(" https://cdn.example.com/x.webm "), "https://cdn.example.com/x.webm");
  for (const bad of [
    null,
    undefined,
    "",
    42,
    "http://cdn.example.com/a.mp4",
    "https://user:pw@cdn.example.com/a.mp4",
    "https://localhost/a.mp4",
    "https://cdn.localhost/a.mp4",
    "https://intranet/a.mp4",
    "https://www.youtube.com/watch?v=abc",
    "https://cdn.example.com/a.mp4 x",
    "javascript:alert(1)//.mp4",
    `https://cdn.example.com/${"a".repeat(600)}.mp4`,
  ]) {
    assert.equal(playableVideoUrl(bad), null, String(bad));
  }
});

test("gig video player: accessible modal, no autoplay, play affordance only for valid URLs", () => {
  const modal = read("components/marketplace/MarketplaceVideoModal.tsx");
  assert.match(modal, /parseGigVideo\(videoUrl\)/);
  assert.match(modal, /if \(!video\) return null;/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby=\{titleId\}/);
  assert.match(modal, /useDialogFocus\(true, ref, close\)/);
  assert.match(modal, /aria-label=\{`Play video for \$\{title\}`\}/);
  assert.match(modal, /\bcontrols\b/);
  assert.match(modal, /playsInline/);
  assert.match(modal, /preload="metadata"/);
  assert.doesNotMatch(modal, /autoPlay|autoplay/i);
  assert.match(modal, /size-11/);
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  assert.match(parts, /const hasVideo = playableVideoUrl\(gig\.videoUrl\) !== null;/);
  assert.match(parts, /<GigVideoButton /);
  // The play button is a sibling of the card link, never nested inside it.
  const link = parts.indexOf("<Link\n        href={gigHref(gig.id)}\n        aria-label={gig.title}");
  const linkEnd = parts.indexOf("</Link>", link);
  const button = parts.indexOf("<GigVideoButton ");
  assert.ok(link > 0 && linkEnd > link && button > linkEnd);
  const media = read("components/marketplace/MarketplaceGigMedia.tsx");
  assert.match(media, /const video = parseGigVideo\(videoUrl\);/);
  const home = read("components/marketplace/MarketplaceHome.tsx");
  assert.doesNotMatch(home, /<Play\b/);
});

/* ---------------- 3. Dashboard command center ---------------- */

const job = (status: "open" | "closed" | "filled") => ({ status }) as MarketplaceWorkspaceData["jobs"][number];
const proposal = (status: "submitted" | "withdrawn" | "selected" | "rejected") =>
  ({ proposal: { status }, job: null }) as unknown as MarketplaceWorkspaceData["proposals"][number];
const gig = (status: "active" | "paused") => ({ status }) as MarketplaceWorkspaceData["gigs"][number];
const invite = (status: "pending" | "accepted" | "declined") =>
  ({ invitation: { status }, job: null }) as unknown as MarketplaceWorkspaceData["invitations"][number];

test("workspace cards count only real listings and stay honest when empty", () => {
  const empty: MarketplaceWorkspaceData = { jobs: [], proposals: [], gigs: [], invitations: [] };
  assert.equal(isMarketplaceWorkspaceEmpty(empty), true);
  const zero = marketplaceWorkspaceCards(empty);
  assert.deepEqual(zero.map((c) => c.value), [0, 0, 0, 0]);
  assert.match(zero[0].detail, /No jobs posted yet/);
  const data: MarketplaceWorkspaceData = {
    jobs: [job("open"), job("open"), job("filled")],
    proposals: [proposal("submitted"), proposal("selected"), proposal("rejected")],
    gigs: [gig("active"), gig("paused")],
    invitations: [invite("pending"), invite("declined")],
  };
  assert.equal(isMarketplaceWorkspaceEmpty(data), false);
  const cards = marketplaceWorkspaceCards(data);
  assert.deepEqual(
    cards.map((c) => [c.key, c.value, c.href]),
    [
      ["jobs", 2, "/dashboard/jobs"],
      ["proposals", 1, "/dashboard/proposals"],
      ["gigs", 1, "/dashboard/gigs"],
      ["invitations", 1, "/dashboard/invitations"],
    ]
  );
  assert.equal(cards[1].detail, "1 selected so far");
});

test("deadlines come from real offer acceptance deadlines, soonest first", () => {
  const offer = (address: string, acceptanceDeadline: number, deadlinePassed = false) =>
    ({ address, href: `/contracts/${address}`, acceptanceDeadline, deadlinePassed }) as OfferListItem;
  const items = upcomingDeadlines(
    { awaitingYourResponse: [offer("B", 300)], waitingForFreelancer: [offer("A", 100, true), offer("C", 200)] },
    2
  );
  assert.deepEqual(items.map((d) => [d.address, d.deadline, d.passed]), [["A", 100, true], ["C", 200, false]]);
  assert.deepEqual(upcomingDeadlines({ awaitingYourResponse: [], waitingForFreelancer: [] }), []);
});

test("reputation copy uses verified reviews only; greeting never shows a wallet", () => {
  assert.match(reputationLine(null), /No verified reviews yet/);
  const line = reputationLine({
    wallet: "w",
    reviewCount: 3,
    averageScore: 4.7,
    asFreelancerCount: 2,
    asEmployerCount: 1,
    completedContracts: 2,
    recent: [],
  });
  assert.equal(line, "Average 4.7 / 5 from 3 verified reviews across 2 completed contracts.");
  assert.equal(greetingName({ name: "Aniqa Armghan" }), "Aniqa");
  assert.equal(greetingName({ name: " ", email: "dev@example.com" }), "dev");
  assert.equal(greetingName(null), null);
});

test("dashboard renders only real data from existing hooks and APIs", () => {
  const overview = read("components/overview/OverviewPage.tsx");
  for (const marker of ["<CommandHeader context={roleContext} />", "<MarketplaceWorkspacePanel ws={ws} />", "<ActivityPanel />", "<ReputationPanel />", "upcomingDeadlines(offers)"]) {
    assert.ok(overview.includes(marker), marker);
  }
  assert.match(overview, /useReducedMotion/);
  const ws = read("components/overview/DashboardWorkspace.tsx");
  for (const fn of ["fetchMyJobs()", "fetchMyProposals()", "fetchMyGigs()", "fetchMyInvitations()", "fetchTrustSummary(", "fetchNotifications("]) {
    assert.ok(ws.includes(fn), fn);
  }
  assert.match(ws, /RetryButton/);
  assert.match(ws, /motion-reduce:animate-none/);
  for (const src of [overview, ws, read("lib/app/dashboard-command.ts")]) {
    assert.doesNotMatch(src, /Math\.random|faker|lorem|testimonial|trusted by/i);
  }
});

/* ---------------- 4/5. Responsive + states ---------------- */

test("touch targets, sticky mobile actions and transient-error retries", () => {
  assert.match(read("components/ui/Button.tsx"), /min-h-11/);
  assert.match(read("components/ui/Button.tsx"), /useReducedMotion/);
  assert.match(read("components/ui/Field.tsx"), /min-h-11/);
  assert.match(read("components/site/PublicShell.tsx"), /inline-flex size-11/);
  const gigDetail = read("components/marketplace/MarketplaceGigDetail.tsx");
  assert.match(gigDetail, /max-sm:sticky max-sm:bottom-3/);
  const jobDetail = read("components/marketplace/MarketplaceJobDetail.tsx");
  assert.match(jobDetail, /href="#send-proposal"/);
  assert.match(jobDetail, /id="send-proposal"/);
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  assert.match(parts, /onRetry\?: \(\) => void;/);
  assert.match(parts, /<ErrorState title="Could not load this page" error=\{error\} onRetry=\{onRetry\} \/>/);
  for (const page of ["MarketplaceMyJobs", "MarketplaceMyProposals", "MarketplaceMyGigs", "MarketplaceSaved", "MarketplaceProfileForm"]) {
    assert.match(read(`components/marketplace/${page}.tsx`), /onRetry=\{query\.reload\}/, page);
  }
});
