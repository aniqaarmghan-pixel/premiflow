import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NOTIFICATIONS_BADGE_POLL_MS,
  NOTIFICATIONS_EMPTY_COPY,
  NOTIFICATIONS_PAGE_LIMIT,
  NOTIFICATIONS_SESSION_COPY,
  NOTIFICATIONS_VERIFY_BUTTON,
  NOTIFICATIONS_VERIFY_CANNOT_SIGN,
  NOTIFICATIONS_VERIFY_DETAIL,
  NOTIFICATIONS_VERIFY_FAILED,
  NOTIFICATIONS_VERIFY_IDLE,
  NOTIFICATIONS_VERIFY_MISMATCH,
  NOTIFICATIONS_VERIFY_PENDING,
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
  notificationsAccess,
  shouldApplyNotificationsVerifyResult,
  verifyNotificationsWallet,
  verifyStatusForWallet,
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
  assert.equal(
    NOTIFICATIONS_SESSION_COPY,
    "Your wallet is connected. Verify it with PREMIFLOW to view notifications."
  );
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

const MESSAGING_SESSION = readFileSync(
  new URL("../messaging-session.ts", import.meta.url),
  "utf8"
);

test("connected but unverified wallet shows the verify state and copy", () => {
  assert.equal(
    notificationsAccess({ connectedWallet: null, sessionWallet: null, status: "idle" }),
    "connect"
  );
  assert.equal(
    notificationsAccess({ connectedWallet: "WalletA", sessionWallet: null, status: "unauthenticated" }),
    "verify"
  );
  assert.equal(
    notificationsAccess({ connectedWallet: "WalletA", sessionWallet: null, status: "idle" }),
    "verify"
  );
  assert.match(NOTIFICATIONS_SESSION_COPY, /wallet is connected/i);
  assert.match(NOTIFICATIONS_SESSION_COPY, /PREMIFLOW/);
  assert.match(NOTIFICATIONS_SESSION_COPY, /view notifications/);
  assert.equal(NOTIFICATIONS_VERIFY_DETAIL, "Verification signs a message \u2014 not a transaction.");
  assert.equal(NOTIFICATIONS_VERIFY_BUTTON, "Verify wallet");
  assert.match(NOTIFICATIONS_VERIFY_PENDING, /signature/);
  assert.match(NOTIFICATIONS_VERIFY_CANNOT_SIGN, /can't sign messages/);
  assert.match(BELL, /access === "verify"/);
  assert.match(BELL, /NOTIFICATIONS_VERIFY_DETAIL/);
  assert.match(BELL, /NOTIFICATIONS_VERIFY_BUTTON/);
  assert.match(BELL, /NOTIFICATIONS_VERIFY_PENDING/);
  assert.match(BELL, /!signMessage \?/);
  assert.match(BELL, /NOTIFICATIONS_VERIFY_CANNOT_SIGN/);
  assert.match(BELL, /role="alert"/);
});

test("Verify wallet reuses the existing sign-message session flow", async () => {
  assert.match(BELL, /const \{ publicKey, signMessage \} = useWallet\(\)/);
  assert.match(BELL, /ensureSession: ensureMessagingSession/);
  assert.match(BELL, /from "@\/lib\/app\/messaging-session"/);
  assert.doesNotMatch(BELL, /createChallenge|verifyChallenge|\/api\/auth\/verify/);
  assert.match(MESSAGING_SESSION, /deps\.createChallenge\(input\.wallet\)/);
  assert.match(MESSAGING_SESSION, /input\.signMessage\(/);
  assert.match(MESSAGING_SESSION, /deps\.verifyChallenge\(/);

  const signMessage = async (message: Uint8Array) => message;
  const calls: Array<{ wallet: string; signMessage: unknown }> = [];
  const ok = await verifyNotificationsWallet(
    { wallet: "WalletA", signMessage },
    {
      ensureSession: async (input) => {
        calls.push(input);
        return { session: { wallet: input.wallet }, didSign: true };
      },
      errorMessage: () => "unused",
    }
  );
  assert.deepEqual(ok, { ok: true, wallet: "WalletA", didSign: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].wallet, "WalletA");
  assert.equal(calls[0].signMessage, signMessage);

  let called = false;
  const cannot = await verifyNotificationsWallet(
    { wallet: "WalletA", signMessage: undefined },
    {
      ensureSession: async () => {
        called = true;
        return { session: { wallet: "WalletA" }, didSign: false };
      },
      errorMessage: () => "unused",
    }
  );
  assert.equal(called, false);
  assert.deepEqual(cannot, {
    ok: false,
    reason: "cannot_sign",
    message: NOTIFICATIONS_VERIFY_CANNOT_SIGN,
  });

  const failed = await verifyNotificationsWallet(
    { wallet: "WalletA", signMessage },
    {
      ensureSession: async () => {
        throw new Error("User rejected the request.");
      },
      errorMessage: (err) => (err as Error).message,
    }
  );
  assert.deepEqual(failed, { ok: false, reason: "failed", message: "User rejected the request." });
  const failedNoMessage = await verifyNotificationsWallet(
    { wallet: "WalletA", signMessage },
    {
      ensureSession: async () => {
        throw new Error("x");
      },
      errorMessage: () => "",
    }
  );
  assert.equal(failedNoMessage.ok ? "" : failedNoMessage.message, NOTIFICATIONS_VERIFY_FAILED);
});

test("verified wallet loads notifications in place", () => {
  assert.equal(
    notificationsAccess({ connectedWallet: "WalletA", sessionWallet: "WalletA", status: "idle" }),
    "verified"
  );
  assert.equal(
    notificationsAccess({ connectedWallet: "WalletA", sessionWallet: "WalletA", status: "ready" }),
    "verified"
  );
  assert.match(BELL, /async function onVerifyWallet\(\)[\s\S]*await refreshSession\(\)[\s\S]*void refreshUnreadCount\(\)/);
  assert.match(BELL, /\[open, sessionWallet, connectedWallet\]/);
  assert.match(BELL, /void loadList\("replace"\)/);
});

test("wallet switch never reuses another wallet's verification", async () => {
  assert.equal(
    notificationsAccess({ connectedWallet: "WalletB", sessionWallet: "WalletA", status: "ready" }),
    "verify"
  );
  const mismatch = await verifyNotificationsWallet(
    { wallet: "WalletB", signMessage: async (m: Uint8Array) => m },
    {
      ensureSession: async () => ({ session: { wallet: "WalletA" }, didSign: false }),
      errorMessage: () => "unused",
    }
  );
  assert.deepEqual(mismatch, {
    ok: false,
    reason: "mismatch",
    message: NOTIFICATIONS_VERIFY_MISMATCH,
  });
  assert.equal(
    shouldApplyNotificationsVerifyResult({ requestWallet: "WalletA", currentWallet: "WalletB" }),
    false
  );
  assert.equal(
    shouldApplyNotificationsVerifyResult({ requestWallet: "WalletA", currentWallet: null }),
    false
  );
  assert.equal(
    shouldApplyNotificationsVerifyResult({ requestWallet: "WalletA", currentWallet: "WalletA" }),
    true
  );
  const pendingForA = { wallet: "WalletA", state: "pending" as const, error: null };
  assert.equal(verifyStatusForWallet(pendingForA, "WalletA"), pendingForA);
  assert.deepEqual(verifyStatusForWallet(pendingForA, "WalletB"), NOTIFICATIONS_VERIFY_IDLE);
  assert.deepEqual(verifyStatusForWallet(pendingForA, null), NOTIFICATIONS_VERIFY_IDLE);
  assert.match(BELL, /verifyStatusForWallet\(verify, connectedWallet\)/);
  assert.match(BELL, /shouldApplyNotificationsVerifyResult\(\{/);
  assert.match(BELL, /sessionMatchesConnectedWallet\(sessionWallet, connectedWallet\)/);
});

test("successful verify refreshes the notification state in place", () => {
  const start = BELL.indexOf("async function onVerifyWallet()");
  assert.ok(start > 0);
  const rest = BELL.slice(start);
  const fn = rest.slice(0, rest.indexOf("\n  }\n") + 4);
  assert.match(fn, /if \(!outcome\.ok\) \{[\s\S]*?return;\s*\}/);
  const afterOk = fn.slice(fn.indexOf("if (!outcome.ok)"));
  let last = -1;
  for (const marker of [
    "await refreshSession()",
    "setVerify(NOTIFICATIONS_VERIFY_IDLE)",
    'current === "unauthenticated" ? "idle" : current',
    "void refreshUnreadCount()",
  ]) {
    const at = afterOk.indexOf(marker);
    assert.ok(at > last, marker);
    last = at;
  }
  assert.doesNotMatch(fn, /window\.location|router\.(push|refresh|replace)/);
});
