import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AuthError, readSession } from "../auth/service";
import {
  buildUnknownRouteErrorLog,
  handleRouteError,
  logUnknownRouteError,
} from "../api-guard";
import { hashSessionToken, randomId } from "../crypto";
import {
  createMemoryAuthStore,
  createMemoryNotificationStore,
} from "../memory-stores";
import { NOTIFICATION_KINDS } from "../notifications/kinds";
import {
  createNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  normalizeNotificationLimit,
  NotificationAccessError,
  NotificationValidationError,
  unreadNotificationCount,
  NOTIFICATION_PAGE_DEFAULT,
  NOTIFICATION_PAGE_MAX,
} from "../notifications/service";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const WALLET_A_ADDR = WALLET_A.toBase58();
const WALLET_B_ADDR = WALLET_B.toBase58();
const WALLET_C_ADDR = WALLET_C.toBase58();
const CONTRACT = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const SESSION_SECRET = "test-session-secret-value-32b!!";

async function seedNotice(
  store: ReturnType<typeof createMemoryNotificationStore>,
  input: {
    recipientWallet: string;
    uniqueKey: string;
    title?: string;
    type?: (typeof NOTIFICATION_KINDS)[number];
    createdAt?: Date;
  }
) {
  return createNotification(
    store,
    {
      recipientWallet: input.recipientWallet,
      type: input.type ?? "message_received",
      uniqueKey: input.uniqueKey,
      title: input.title ?? "New message",
      body: "Open the contract chat to read it.",
      contractAddress: CONTRACT,
      href: `/contracts/${CONTRACT}`,
      payload: { messageId: randomId() },
    },
    input.createdAt ?? new Date()
  );
}

test("notification kinds cover the audited event set", () => {
  for (const kind of [
    "message_received",
    "contract_offer_received",
    "offer_accepted",
    "offer_declined",
    "awaiting_activation",
    "contract_activated",
    "work_submitted",
    "revision_requested",
    "revised_work_submitted",
    "work_approved",
    "payment_released",
    "payment_withdrawn",
    "contract_cancelled",
    "dispute_opened",
    "dispute_resolved",
    "deadline_warning",
  ] as const) {
    assert.ok(NOTIFICATION_KINDS.includes(kind));
  }
});

test("unauthenticated notification access is rejected", async () => {
  const auth = createMemoryAuthStore();
  await assert.rejects(
    () => readSession(auth, { sessionSecret: SESSION_SECRET }, null),
    (err: unknown) => err instanceof AuthError && err.code === "unauthenticated"
  );
  const response = handleRouteError(
    new AuthError("unauthenticated", "Verify your wallet to continue.")
  );
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, "unauthenticated");
});

test("unknown route error stays a generic 500 and is logged server-side", async () => {
  const cause = new Error("fetch failed: ECONNRESET");
  const err = new Error("NeonDbError: connection terminated", { cause });

  const entry = buildUnknownRouteErrorLog(err);
  assert.equal(entry.name, "Error");
  assert.equal(entry.message, "NeonDbError: connection terminated");
  assert.equal(typeof entry.stack, "string");
  assert.deepEqual(
    { name: (entry.cause as { name: string }).name, message: (entry.cause as { message: string }).message },
    { name: "Error", message: "fetch failed: ECONNRESET" }
  );

  const logged: Record<string, unknown>[] = [];
  logUnknownRouteError(err, (e) => logged.push(e));
  assert.equal(logged.length, 1);
  assert.equal(logged[0].message, "NeonDbError: connection terminated");

  const originalConsoleError = console.error;
  const consoleCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    consoleCalls.push(args);
  };
  let response: Response;
  try {
    response = handleRouteError(err);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: { code: "internal", message: "Something went wrong." },
  });
  assert.equal(consoleCalls.length, 1);
  assert.equal(consoleCalls[0][0], "[api] unknown route error");
  assert.match(String(consoleCalls[0][1]), /connection terminated/);
  assert.match(String(consoleCalls[0][1]), /ECONNRESET/);

  const classified = handleRouteError(
    new AuthError("unauthenticated", "Verify your wallet to continue.")
  );
  assert.equal(classified.status, 401);
});

test("wallet A cannot list wallet B notifications", async () => {
  const store = createMemoryNotificationStore();
  await seedNotice(store, { recipientWallet: WALLET_A_ADDR, uniqueKey: "a-1" });
  await seedNotice(store, { recipientWallet: WALLET_B_ADDR, uniqueKey: "b-1" });

  const forA = await listNotifications(store, {
    recipientWallet: WALLET_A_ADDR,
    cursor: null,
    limit: "20",
  });
  assert.equal(forA.notifications.length, 1);
  assert.equal(forA.notifications[0].title, "New message");

  const forB = await listNotifications(store, {
    recipientWallet: WALLET_B_ADDR,
    cursor: null,
    limit: "20",
  });
  assert.equal(forB.notifications.length, 1);
  assert.notEqual(forA.notifications[0].id, forB.notifications[0].id);
});

test("wallet A cannot mark wallet B notification read", async () => {
  const store = createMemoryNotificationStore();
  const b = await seedNotice(store, {
    recipientWallet: WALLET_B_ADDR,
    uniqueKey: "b-private",
  });
  await assert.rejects(
    () =>
      markNotificationRead(store, {
        id: b.notification.id,
        recipientWallet: WALLET_A_ADDR,
      }),
    NotificationAccessError
  );
  const stillUnread = await unreadNotificationCount(store, WALLET_B_ADDR);
  assert.equal(stillUnread.unreadCount, 1);
});

test("unread count is wallet-specific", async () => {
  const store = createMemoryNotificationStore();
  await seedNotice(store, { recipientWallet: WALLET_A_ADDR, uniqueKey: "a-u1" });
  await seedNotice(store, { recipientWallet: WALLET_A_ADDR, uniqueKey: "a-u2" });
  await seedNotice(store, { recipientWallet: WALLET_B_ADDR, uniqueKey: "b-u1" });

  assert.equal((await unreadNotificationCount(store, WALLET_A_ADDR)).unreadCount, 2);
  assert.equal((await unreadNotificationCount(store, WALLET_B_ADDR)).unreadCount, 1);
  assert.equal((await unreadNotificationCount(store, WALLET_C_ADDR)).unreadCount, 0);
});

test("mark-one works for the authenticated wallet", async () => {
  const store = createMemoryNotificationStore();
  const created = await seedNotice(store, {
    recipientWallet: WALLET_A_ADDR,
    uniqueKey: "mark-one",
  });
  const marked = await markNotificationRead(store, {
    id: created.notification.id,
    recipientWallet: WALLET_A_ADDR,
  });
  assert.ok(marked.notification.readAt);
  assert.equal((await unreadNotificationCount(store, WALLET_A_ADDR)).unreadCount, 0);
  const again = await markNotificationRead(store, {
    id: created.notification.id,
    recipientWallet: WALLET_A_ADDR,
  });
  assert.equal(again.notification.readAt, marked.notification.readAt);
});

test("mark-all only affects the authenticated wallet", async () => {
  const store = createMemoryNotificationStore();
  await seedNotice(store, { recipientWallet: WALLET_A_ADDR, uniqueKey: "a-m1" });
  await seedNotice(store, { recipientWallet: WALLET_A_ADDR, uniqueKey: "a-m2" });
  await seedNotice(store, { recipientWallet: WALLET_B_ADDR, uniqueKey: "b-m1" });

  const result = await markAllNotificationsRead(store, WALLET_A_ADDR);
  assert.equal(result.markedCount, 2);
  assert.equal((await unreadNotificationCount(store, WALLET_A_ADDR)).unreadCount, 0);
  assert.equal((await unreadNotificationCount(store, WALLET_B_ADDR)).unreadCount, 1);
});

test("duplicate unique_key for same recipient does not create duplicate rows", async () => {
  const store = createMemoryNotificationStore();
  const first = await seedNotice(store, {
    recipientWallet: WALLET_A_ADDR,
    uniqueKey: "same-key",
    title: "First",
  });
  const second = await createNotification(store, {
    recipientWallet: WALLET_A_ADDR,
    type: "message_received",
    uniqueKey: "same-key",
    title: "Second attempt",
    body: "Should not insert.",
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.notification.id, first.notification.id);
  assert.equal(second.notification.title, "First");
  assert.equal((await unreadNotificationCount(store, WALLET_A_ADDR)).unreadCount, 1);
});

test("same unique_key for different recipients is allowed", async () => {
  const store = createMemoryNotificationStore();
  const a = await seedNotice(store, {
    recipientWallet: WALLET_A_ADDR,
    uniqueKey: "shared-key",
  });
  const b = await seedNotice(store, {
    recipientWallet: WALLET_B_ADDR,
    uniqueKey: "shared-key",
  });
  assert.equal(a.created, true);
  assert.equal(b.created, true);
  assert.notEqual(a.notification.id, b.notification.id);
});

test("pagination is deterministic newest-first and limit is bounded", async () => {
  const store = createMemoryNotificationStore();
  const base = new Date("2026-03-01T00:00:00.000Z");
  for (let i = 0; i < 5; i += 1) {
    await seedNotice(store, {
      recipientWallet: WALLET_A_ADDR,
      uniqueKey: `page-${i}`,
      title: `n${i}`,
      createdAt: new Date(base.getTime() + i * 1000),
    });
  }

  const first = await listNotifications(store, {
    recipientWallet: WALLET_A_ADDR,
    cursor: null,
    limit: "2",
  });
  assert.deepEqual(
    first.notifications.map((n) => n.title),
    ["n4", "n3"]
  );
  assert.ok(first.nextCursor);

  const second = await listNotifications(store, {
    recipientWallet: WALLET_A_ADDR,
    cursor: first.nextCursor,
    limit: "2",
  });
  assert.deepEqual(
    second.notifications.map((n) => n.title),
    ["n2", "n1"]
  );

  const third = await listNotifications(store, {
    recipientWallet: WALLET_A_ADDR,
    cursor: second.nextCursor,
    limit: "2",
  });
  assert.deepEqual(
    third.notifications.map((n) => n.title),
    ["n0"]
  );
  assert.equal(third.nextCursor, null);

  assert.equal(normalizeNotificationLimit(null), NOTIFICATION_PAGE_DEFAULT);
  assert.equal(normalizeNotificationLimit("999"), NOTIFICATION_PAGE_MAX);
  await assert.rejects(
    () =>
      listNotifications(store, {
        recipientWallet: WALLET_A_ADDR,
        cursor: null,
        limit: "0",
      }),
    NotificationValidationError
  );
});

test("create strips private message body keys from payload", async () => {
  const store = createMemoryNotificationStore();
  const created = await createNotification(store, {
    recipientWallet: WALLET_A_ADDR,
    type: "message_received",
    uniqueKey: "no-body",
    title: "New message",
    body: "Open chat to read it.",
    payload: {
      messageId: "msg-1",
      body: "secret chat text",
      messageBody: "also secret",
      workUnitIndex: 2,
    },
  });
  assert.deepEqual(created.notification.payload, {
    messageId: "msg-1",
    workUnitIndex: 2,
  });
});

test("session wallet is the only ownership source for notification APIs", async () => {
  const auth = createMemoryAuthStore();
  const token = "session-token-for-wallet-a";
  const now = new Date();
  await auth.insertSession({
    id: randomId(),
    tokenHash: hashSessionToken(SESSION_SECRET, token),
    walletAddress: WALLET_A_ADDR,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
    revokedAt: null,
  });
  const session = await readSession(auth, { sessionSecret: SESSION_SECRET }, token);
  assert.equal(session.walletAddress, WALLET_A_ADDR);

  const store = createMemoryNotificationStore();
  await seedNotice(store, { recipientWallet: WALLET_A_ADDR, uniqueKey: "owned" });
  await seedNotice(store, { recipientWallet: WALLET_B_ADDR, uniqueKey: "other" });

  // Routes pass session.walletAddress — spoofed query wallet must be ignored by callers.
  const listed = await listNotifications(store, {
    recipientWallet: session.walletAddress,
    cursor: null,
    limit: null,
  });
  assert.equal(listed.notifications.length, 1);

  const spoofedWallet = WALLET_B_ADDR;
  assert.notEqual(session.walletAddress, spoofedWallet);
});

test("notification routes enforce session auth and never trust client wallet params", () => {
  const listRoute = readFileSync(join(ROOT, "app/api/notifications/route.ts"), "utf8");
  const unreadRoute = readFileSync(
    join(ROOT, "app/api/notifications/unread-count/route.ts"),
    "utf8"
  );
  const markOne = readFileSync(
    join(ROOT, "app/api/notifications/[id]/read/route.ts"),
    "utf8"
  );
  const markAll = readFileSync(
    join(ROOT, "app/api/notifications/read-all/route.ts"),
    "utf8"
  );

    for (const source of [listRoute, unreadRoute, markOne, markAll]) {
    assert.match(source, /requireSession/);
    assert.match(source, /session\.walletAddress/);
    assert.doesNotMatch(source, /searchParams\.get\(["']wallet/);
    assert.doesNotMatch(source, /body\.wallet/);
    assert.doesNotMatch(source, /publicKey/);
  }
  assert.match(markOne, /requireMutatingOrigin/);
  assert.match(markAll, /requireMutatingOrigin/);
});

test("migration 0004 is additive notifications-only; prior migrations untouched", () => {
  const sql = readFileSync(join(ROOT, "drizzle/0004_notifications.sql"), "utf8");
  assert.match(sql, /CREATE TABLE "notifications"/);
  assert.match(sql, /notifications_recipient_unique_key_uidx/);
  assert.match(sql, /notifications_recipient_read_created_idx/);
  assert.doesNotMatch(sql, /DROP TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
  assert.doesNotMatch(sql, /CREATE TABLE "contract_messages"/);
  assert.doesNotMatch(sql, /CREATE TABLE "contract_attachments"/);
  assert.doesNotMatch(sql, /CREATE TABLE "contract_work_submissions"/);

  const zero = readFileSync(join(ROOT, "drizzle/0000_h4b_contract_messages.sql"), "utf8");
  const three = readFileSync(join(ROOT, "drizzle/0003_contract_attachments.sql"), "utf8");
  assert.match(zero, /contract_messages/);
  assert.match(three, /contract_attachments/);

  const journal = readFileSync(join(ROOT, "drizzle/meta/_journal.json"), "utf8");
  assert.match(journal, /0004_notifications/);
});
