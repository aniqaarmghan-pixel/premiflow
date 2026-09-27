import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NOTIFICATIONS_BADGE_POLL_MS,
  NOTIFICATIONS_EMPTY_COPY,
  NOTIFICATIONS_PAGE_LIMIT,
  NOTIFICATIONS_SESSION_COPY,
  OPEN_CONTRACT_CHAT_EVENT,
  applyMarkAllLocal,
  applyMarkOneLocal,
  ariaLabelForBell,
  bumpUnreadRequestGeneration,
  contractAddressFromContractsHref,
  decideUnreadRefresh,
  decrementUnreadCount,
  formatNotificationTime,
  formatUnreadBadge,
  isNotificationUnread,
  mergeNotificationPages,
  notificationHrefPath,
  resolveNotificationClickNavigation,
  shouldAcceptUnreadCountResponse,
  shouldClearNotificationsOnSessionChange,
  shouldOpenChatFromSearch,
  shouldPollNotificationBadge,
  shouldRefreshUnreadOnVisibility,
  type NotificationListItem,
} from "../notifications-ui";

const BELL = readFileSync(
  new URL("../../../components/shell/NotificationBell.tsx", import.meta.url),
  "utf8"
);
const SHELL = readFileSync(
  new URL("../../../components/shell/AppShell.tsx", import.meta.url),
  "utf8"
);
const CLIENT = readFileSync(
  new URL("../notifications-client.ts", import.meta.url),
  "utf8"
);

function item(
  overrides: Partial<NotificationListItem> & Pick<NotificationListItem, "id">
): NotificationListItem {
  return {
    id: overrides.id,
    type: overrides.type ?? "message_received",
    contractAddress: overrides.contractAddress ?? null,
    title: overrides.title ?? "Title",
    body: overrides.body ?? "Body",
    href: overrides.href ?? "/contracts/abc",
    payload: overrides.payload ?? null,
    createdAt: overrides.createdAt ?? "2026-09-26T00:00:00.000Z",
    readAt: overrides.readAt === undefined ? null : overrides.readAt,
  };
}

test("zero unread → no badge; loading never flashes a fake 0", () => {
  assert.equal(formatUnreadBadge(0, { countLoaded: true }), null);
  assert.equal(formatUnreadBadge(null, { countLoaded: false }), null);
  assert.equal(formatUnreadBadge(0, { countLoaded: false }), null);
  assert.equal(formatUnreadBadge(null, { countLoaded: true }), null);
});

test("unread count displayed; >99 → 99+", () => {
  assert.equal(formatUnreadBadge(1, { countLoaded: true }), "1");
  assert.equal(formatUnreadBadge(12, { countLoaded: true }), "12");
  assert.equal(formatUnreadBadge(99, { countLoaded: true }), "99");
  assert.equal(formatUnreadBadge(100, { countLoaded: true }), "99+");
  assert.equal(formatUnreadBadge(250, { countLoaded: true }), "99+");
  assert.equal(ariaLabelForBell("3"), "Notifications, 3 unread");
  assert.equal(ariaLabelForBell("99+"), "Notifications, 99 or more unread");
  assert.equal(ariaLabelForBell(null), "Notifications");
});

test("empty notification state copy is fixed", () => {
  assert.equal(NOTIFICATIONS_EMPTY_COPY, "No notifications yet");
  assert.match(BELL, /NOTIFICATIONS_EMPTY_COPY/);
});

test("panel list rendering and unread/read visual distinction", () => {
  assert.match(BELL, /items\.map\(\(item\) =>/);
  assert.match(BELL, /isNotificationUnread/);
  assert.match(BELL, /bg-cyan\/\[0\.06\]/);
  assert.match(BELL, /aria-label="Unread"/);
  assert.match(BELL, /formatNotificationTime/);
  assert.match(BELL, /role="dialog"/);
  assert.match(BELL, /aria-label="Notifications"/);
  assert.equal(isNotificationUnread(item({ id: "1", readAt: null })), true);
  assert.equal(isNotificationUnread(item({ id: "2", readAt: "2026-09-26T01:00:00.000Z" })), false);
});

test("mark one updates state/count", () => {
  const items = [
    item({ id: "a", readAt: null }),
    item({ id: "b", readAt: null }),
  ];
  const next = applyMarkOneLocal(items, "a", "2026-09-26T02:00:00.000Z");
  assert.equal(next.becameRead, true);
  assert.equal(next.items[0].readAt, "2026-09-26T02:00:00.000Z");
  assert.equal(next.items[1].readAt, null);
  assert.equal(decrementUnreadCount(5, true), 4);
  assert.equal(decrementUnreadCount(1, true), 0);
  const again = applyMarkOneLocal(next.items, "a", "2026-09-26T03:00:00.000Z");
  assert.equal(again.becameRead, false);
  assert.equal(again.items[0].readAt, "2026-09-26T02:00:00.000Z");
  assert.equal(decrementUnreadCount(4, false), 4);
});

test("mark all updates state/count", () => {
  const items = [
    item({ id: "a", readAt: null }),
    item({ id: "b", readAt: "2026-09-26T01:00:00.000Z" }),
    item({ id: "c", readAt: null }),
  ];
  const next = applyMarkAllLocal(items, "2026-09-26T04:00:00.000Z");
  assert.equal(next.unreadCount, 0);
  assert.ok(next.items.every((row) => row.readAt != null));
  assert.match(BELL, /markAllNotificationsRead/);
  assert.match(BELL, /Mark all as read/);
  assert.match(BELL, /disabled=\{!hasSession \|\| !unreadCount\}/);
});

test("pagination / load more", () => {
  assert.equal(NOTIFICATIONS_PAGE_LIMIT, 20);
  const first = mergeNotificationPages([], [item({ id: "1" }), item({ id: "2" })], "replace");
  const second = mergeNotificationPages(first, [item({ id: "2" }), item({ id: "3" })], "append");
  assert.deepEqual(
    second.map((row) => row.id),
    ["1", "2", "3"]
  );
  assert.match(BELL, /Load more/);
  assert.match(BELL, /nextCursor/);
  assert.match(BELL, /loadList\("append"\)/);
  assert.match(CLIENT, /cursor/);
  assert.match(CLIENT, /limit/);
});

test("401 / session failure handled gracefully", () => {
  assert.equal(NOTIFICATIONS_SESSION_COPY, "Verify your wallet to see notifications.");
  assert.match(BELL, /isNotificationsAuthError/);
  assert.match(BELL, /unauthenticated/);
  assert.match(BELL, /NOTIFICATIONS_SESSION_COPY/);
  assert.match(CLIENT, /status === 401/);
});

test("wallet/session change clears stale notification data", () => {
  assert.equal(
    shouldClearNotificationsOnSessionChange({
      previousSessionWallet: "WalletA",
      nextSessionWallet: "WalletB",
    }),
    true
  );
  assert.equal(
    shouldClearNotificationsOnSessionChange({
      previousSessionWallet: "WalletA",
      nextSessionWallet: "WalletA",
    }),
    false
  );
  assert.equal(
    shouldClearNotificationsOnSessionChange({
      previousSessionWallet: "WalletA",
      nextSessionWallet: null,
    }),
    true
  );
  assert.match(BELL, /shouldClearNotificationsOnSessionChange/);
  assert.match(BELL, /resetInbox/);
  assert.match(BELL, /sessionMatchesConnectedWallet/);
});

test("href navigation behavior stays same-origin path only", () => {
  assert.equal(notificationHrefPath("/contracts/abc"), "/contracts/abc");
  assert.equal(notificationHrefPath("https://evil.example/x"), null);
  assert.equal(notificationHrefPath("//evil.example"), null);
  assert.equal(notificationHrefPath(null), null);
  assert.match(BELL, /resolveNotificationClickNavigation/);
  assert.match(BELL, /router\.push\(nav\.path\)/);
});

/** Valid-length base58 pubkey shape (matches live message_received href contract). */
const CONTRACT = "FmFZY3ek3kXUs7Mk4BN3L8DBneS7nPYa2J41Qv7MYYea";

test("A. unread notification click marks it read", () => {
  assert.match(BELL, /onMarkOne/);
  assert.match(BELL, /isNotificationUnread\(item\) && hasSession/);
  assert.match(BELL, /markNotificationRead\(item\.id\)/);
  assert.match(BELL, /applyMarkOneLocal/);
  assert.match(BELL, /onClick=\{\(\) => void onMarkOne\(item\)\}/);
  const unread = item({ id: "n1", readAt: null });
  const applied = applyMarkOneLocal([unread], "n1", "2026-09-26T12:00:00.000Z");
  assert.equal(applied.becameRead, true);
  assert.equal(applied.items[0].readAt, "2026-09-26T12:00:00.000Z");
});

test("B. valid same-origin href is navigated", () => {
  const href = `/contracts/${CONTRACT}?chat=1`;
  const nav = resolveNotificationClickNavigation({ href });
  assert.equal(nav.path, href);
  assert.equal(nav.shouldOpenChat, true);
  assert.equal(nav.contractAddress, CONTRACT);
  assert.match(BELL, /armOpenContractChat/);
  assert.match(BELL, /signalOpenContractChat/);
  assert.match(BELL, /router\.push\(nav\.path\)/);
});

test("C. /contracts/{address}?chat=1 opens Messages", () => {
  assert.equal(shouldOpenChatFromSearch("chat=1"), true);
  assert.equal(shouldOpenChatFromSearch("?chat=1"), true);
  assert.equal(shouldOpenChatFromSearch("foo=1"), false);
  const panel = readFileSync(
    new URL("../../../components/contracts/ContractMessages.tsx", import.meta.url),
    "utf8"
  );
  assert.match(panel, /shouldOpenChatFromSearch\(searchParams\.toString\(\)\)/);
  assert.match(panel, /setChatOpen\(true\)/);
  assert.match(panel, /useSearchParams/);
});

test("D. same-contract navigation to ?chat=1 also opens Messages", () => {
  const panel = readFileSync(
    new URL("../../../components/contracts/ContractMessages.tsx", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(panel, /deepLinkOpened/);
  assert.match(panel, /\[contractAddress, searchParams\]/);
  assert.match(panel, /consumeOpenContractChat\(contractAddress\)/);
  assert.match(panel, /addEventListener\(OPEN_CONTRACT_CHAT_EVENT/);
  assert.equal(OPEN_CONTRACT_CHAT_EVENT, "premiflow:open-contract-chat");
  assert.equal(
    resolveNotificationClickNavigation({
      href: `/contracts/${CONTRACT}?chat=1`,
    }).shouldOpenChat,
    true
  );
  assert.equal(
    resolveNotificationClickNavigation({
      href: `/contracts/${CONTRACT}?chat=1`,
    }).contractAddress,
    CONTRACT
  );
});

test("E. invalid/external href is not navigated", () => {
  assert.equal(
    resolveNotificationClickNavigation({ href: "https://evil.example/x" }).path,
    null
  );
  assert.equal(
    resolveNotificationClickNavigation({ href: "//evil.example" }).path,
    null
  );
  assert.equal(resolveNotificationClickNavigation({ href: null }).path, null);
  assert.equal(resolveNotificationClickNavigation({ href: "" }).path, null);
  assert.equal(resolveNotificationClickNavigation({ href: "contracts/x" }).path, null);
  assert.equal(contractAddressFromContractsHref("https://evil.example/x"), null);
  assert.match(BELL, /if \(nav\.path\)/);
});

test("bell placement and accessibility in AppShell header", () => {
  assert.match(SHELL, /NotificationBell/);
  assert.match(SHELL, /NetworkControl/);
  assert.match(SHELL, /WalletControl/);
  assert.match(BELL, /aria-label=\{ariaLabel\}/);
  assert.match(BELL, /aria-haspopup="dialog"/);
  assert.match(BELL, /aria-expanded=\{open\}/);
  assert.match(BELL, /<Bell /);
});

test("notification APIs never send a wallet address", () => {
  assert.doesNotMatch(CLIENT, /\bwallet\b/i);
  assert.match(CLIENT, /credentials: "include"/);
  assert.match(CLIENT, /\/api\/notifications\/unread-count/);
  assert.match(CLIENT, /\/api\/notifications\/\$\{/);
  assert.match(CLIENT, /\/api\/notifications\/read-all/);
});

test("N5.1 intelligent badge polling — 15s, no websocket/sse, list not polled", () => {
  assert.equal(NOTIFICATIONS_BADGE_POLL_MS, 15_000);
  assert.equal(shouldPollNotificationBadge({ visible: true, hasSession: true }), true);
  assert.equal(shouldPollNotificationBadge({ visible: false, hasSession: true }), false);
  assert.equal(shouldPollNotificationBadge({ visible: true, hasSession: false }), false);
  assert.equal(
    shouldRefreshUnreadOnVisibility({ wasVisible: false, isVisible: true }),
    true
  );
  assert.equal(
    shouldRefreshUnreadOnVisibility({ wasVisible: true, isVisible: true }),
    false
  );
  assert.equal(
    shouldRefreshUnreadOnVisibility({ wasVisible: true, isVisible: false }),
    false
  );
  assert.match(BELL, /NOTIFICATIONS_BADGE_POLL_MS/);
  assert.match(BELL, /visibilitychange/);
  assert.match(BELL, /shouldRefreshUnreadOnVisibility/);
  assert.match(BELL, /refreshUnreadCount/);
  assert.match(BELL, /invalidateUnreadRequests/);
  assert.match(BELL, /decideUnreadRefresh/);
  assert.match(BELL, /shouldAcceptUnreadCountResponse/);
  // Periodic tick must not re-hit /api/auth/me (session bootstrap is separate).
  assert.match(BELL, /does not call \/api\/auth\/me/);
  assert.match(BELL, /refreshSession/);
  assert.match(BELL, /setInterval/);
  assert.match(BELL, /List loads on bell open only/);
  assert.doesNotMatch(BELL, /WebSocket/);
  assert.doesNotMatch(BELL, /EventSource/);
  assert.doesNotMatch(BELL, /new EventSource/);
  assert.doesNotMatch(SHELL, /NoticeProvider/);
  // List fetch is open-driven; unread poll must not call fetchNotifications in the interval path.
  const intervalBlock = BELL.slice(
    BELL.indexOf("Periodic unread poll"),
    BELL.indexOf("Bell open:")
  );
  assert.ok(intervalBlock.length > 0);
  assert.doesNotMatch(intervalBlock, /fetchNotifications|loadList/);
  assert.match(intervalBlock, /refreshUnreadCount/);
});

test("N5.1 unread single-flight and stale response guards", () => {
  assert.equal(decideUnreadRefresh({ hasSession: false, inFlight: false }), "skip");
  assert.equal(decideUnreadRefresh({ hasSession: true, inFlight: false }), "start");
  assert.equal(decideUnreadRefresh({ hasSession: true, inFlight: true }), "queue");

  assert.equal(bumpUnreadRequestGeneration(0), 1);
  assert.equal(bumpUnreadRequestGeneration(7), 8);

  assert.equal(
    shouldAcceptUnreadCountResponse({
      requestGeneration: 3,
      currentGeneration: 3,
      requestSessionWallet: "WalletA",
      currentSessionWallet: "WalletA",
    }),
    true
  );
  assert.equal(
    shouldAcceptUnreadCountResponse({
      requestGeneration: 3,
      currentGeneration: 4,
      requestSessionWallet: "WalletA",
      currentSessionWallet: "WalletA",
    }),
    false
  );
  assert.equal(
    shouldAcceptUnreadCountResponse({
      requestGeneration: 3,
      currentGeneration: 3,
      requestSessionWallet: "WalletA",
      currentSessionWallet: "WalletB",
    }),
    false
  );
  assert.equal(
    shouldAcceptUnreadCountResponse({
      requestGeneration: 1,
      currentGeneration: 1,
      requestSessionWallet: null,
      currentSessionWallet: "WalletA",
    }),
    false
  );

  // Mark-read path invalidates generation before applying local badge update.
  assert.match(BELL, /invalidateUnreadRequests\(\);\s*\n\s*const result = await markNotificationRead/s);
  assert.match(BELL, /invalidateUnreadRequests\(\);\s*\n\s*await markAllNotificationsRead/s);
  assert.match(BELL, /void refreshUnreadCount\(\);/);
});

test("N5.1 session bootstrap vs periodic unread separation", () => {
  // Wallet/session bootstrap still uses fetchSession once.
  assert.match(BELL, /const me = await fetchSession\(\)/);
  // refreshUnreadCount body must fetch unread count, not fetchSession.
  const unreadFnStart = BELL.indexOf("const refreshUnreadCount = useCallback");
  const unreadFnEnd = BELL.indexOf("const loadList = useCallback");
  assert.ok(unreadFnStart >= 0 && unreadFnEnd > unreadFnStart);
  const unreadFn = BELL.slice(unreadFnStart, unreadFnEnd);
  assert.match(unreadFn, /fetchUnreadNotificationCount/);
  assert.doesNotMatch(unreadFn, /fetchSession/);
  // Unmount / session replacement invalidates in-flight unread work.
  assert.match(BELL, /invalidateUnreadRequests\(\);/);
  assert.match(BELL, /return \(\) => \{\s*cancelled = true;\s*invalidateUnreadRequests/s);
});

test("relative timestamp formatting", () => {
  const now = Date.parse("2026-09-26T12:00:00.000Z");
  assert.equal(formatNotificationTime("2026-09-26T11:59:30.000Z", now), "Just now");
  assert.equal(formatNotificationTime("2026-09-26T11:30:00.000Z", now), "30m ago");
  assert.equal(formatNotificationTime("2026-09-26T09:00:00.000Z", now), "3h ago");
});

test("NoticeProvider and Activity remain separate from bell inbox", () => {
  assert.doesNotMatch(BELL, /NoticeProvider|noticeFromTxOutcome|Activity/);
  assert.doesNotMatch(CLIENT, /NoticeProvider/);
});
