import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTACHMENTS_COMING_NEXT_LABEL,
  JUMP_TO_LATEST_LABEL,
  canRequestEarlierPage,
  detectNewActivityWhileReading,
  formatMessageDateSeparator,
  formatUnreadBadge,
  groupMessagesWithDateSeparators,
  isNearBottom,
  isNearTop,
  newestMessageId,
  preserveScrollAfterPrepend,
  shouldForceScrollOnIncoming,
  shouldShowJumpToLatest,
} from "../messages-history";
import type { PublicContractMessage } from "../../server/messages/pagination";

function msg(
  id: string,
  createdAt: string,
  body = "hello"
): PublicContractMessage {
  return {
    id,
    contractAddress: "C",
    senderWallet: "A",
    body,
    createdAt,
  };
}

test("date separators use Today, Yesterday, and long local dates", () => {
  const now = new Date("2026-09-21T15:00:00.000Z");
  // Construct local midnights relative to the same timezone as the formatter.
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
  const yesterdayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 0, 0);
  const earlierLocal = new Date(2026, 8, 18, 10, 0, 0); // Sep 18
  assert.equal(formatMessageDateSeparator(todayLocal.toISOString(), now), "Today");
  assert.equal(formatMessageDateSeparator(yesterdayLocal.toISOString(), now), "Yesterday");
  assert.match(formatMessageDateSeparator(earlierLocal.toISOString(), now), /September 18, 2026/);
});

test("groupMessagesWithDateSeparators inserts one separator per day, not per message", () => {
  const now = new Date("2026-09-21T15:00:00.000Z");
  const dayA = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0).toISOString();
  const dayA2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0).toISOString();
  const dayB = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9, 0, 0).toISOString();
  const items = groupMessagesWithDateSeparators(
    [msg("1", dayB, "old"), msg("2", dayA, "a"), msg("3", dayA2, "b")],
    now
  );
  const dates = items.filter((item) => item.kind === "date");
  const messages = items.filter((item) => item.kind === "message");
  assert.equal(dates.length, 2);
  assert.equal(messages.length, 3);
  assert.equal(dates[0]?.kind === "date" && dates[0].label, "Yesterday");
  assert.equal(dates[1]?.kind === "date" && dates[1].label, "Today");
});

test("long message body is preserved for wrapping (no truncation helper)", () => {
  const long = "x".repeat(2_000);
  const items = groupMessagesWithDateSeparators([msg("1", "2026-09-21T12:00:00.000Z", long)]);
  assert.equal(items[1]?.kind === "message" && items[1].message.body.length, 2_000);
});

test("upward pagination trigger and dedupe gates", () => {
  assert.equal(isNearTop(0), true);
  assert.equal(isNearTop(10), true);
  assert.equal(isNearTop(200), false);
  assert.equal(canRequestEarlierPage({ nextCursor: "abc", loadingEarlier: false }), true);
  assert.equal(canRequestEarlierPage({ nextCursor: "abc", loadingEarlier: true }), false);
  assert.equal(canRequestEarlierPage({ nextCursor: null, loadingEarlier: false }), false);
});

test("scroll-position preservation after prepend", () => {
  assert.equal(preserveScrollAfterPrepend(1_000, 40, 1_400), 440);
  assert.equal(preserveScrollAfterPrepend(500, 0, 500), 0);
});

test("jump-to-latest appears when away from bottom and restores follow", () => {
  assert.equal(shouldShowJumpToLatest({ followNewest: false, messageCount: 3 }), true);
  assert.equal(shouldShowJumpToLatest({ followNewest: true, messageCount: 3 }), false);
  assert.equal(shouldShowJumpToLatest({ followNewest: false, messageCount: 0 }), false);
  assert.equal(JUMP_TO_LATEST_LABEL, "Jump to latest");
  assert.equal(shouldForceScrollOnIncoming(true), true);
  assert.equal(shouldForceScrollOnIncoming(false), false);
});

test("new messages do not force-scroll while reading older history", () => {
  assert.equal(
    detectNewActivityWhileReading({
      followNewest: false,
      previousNewestId: "1",
      nextNewestId: "2",
    }),
    true
  );
  assert.equal(
    detectNewActivityWhileReading({
      followNewest: true,
      previousNewestId: "1",
      nextNewestId: "2",
    }),
    false
  );
  assert.equal(isNearBottom({ scrollTop: 900, scrollHeight: 1_000, clientHeight: 100 }), true);
  assert.equal(isNearBottom({ scrollTop: 100, scrollHeight: 1_000, clientHeight: 100 }), false);
});

test("unread badge formatting without inventing read receipts", () => {
  assert.equal(formatUnreadBadge(0), null);
  assert.equal(formatUnreadBadge(1), "1 unread");
  assert.equal(formatUnreadBadge(3), "3 unread");
  assert.equal(newestMessageId([msg("a", "2026-01-01T00:00:00.000Z"), msg("b", "2026-01-02T00:00:00.000Z")]), "b");
});

test("attachments remain coming-next, not a fake working upload", () => {
  assert.equal(ATTACHMENTS_COMING_NEXT_LABEL, "Attachments coming next");
});
