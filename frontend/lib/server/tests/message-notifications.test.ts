import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PublicKey } from "@solana/web3.js";

import {
  createContractMessage,
  listContractMessages,
  markThreadRead,
  unreadCountForWallet,
} from "../messages/service";
import { isAuthorizedMessageWallet } from "../messages/authorize";
import {
  MESSAGE_RECEIVED_BODY,
  MESSAGE_RECEIVED_TITLE,
  messageNotificationHref,
  messageReceivedUniqueKey,
  notifyOtherPartyOfMessage,
  otherMessageParty,
} from "../notifications/message-received";
import {
  createNotification,
  listNotifications,
  unreadNotificationCount,
} from "../notifications/service";
import {
  createMemoryMessageStore,
  createMemoryNotificationStore,
  createMemoryRateLimitStore,
} from "../memory-stores";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const STRANGER = WALLET_C.toBase58();

const PARTIES = { employer: EMPLOYER, freelancer: FREELANCER };

function messageStores() {
  return {
    messages: createMemoryMessageStore(),
    rates: createMemoryRateLimitStore(),
  };
}

test("otherMessageParty maps employer↔freelancer and rejects strangers", () => {
  assert.equal(otherMessageParty(EMPLOYER, PARTIES), FREELANCER);
  assert.equal(otherMessageParty(FREELANCER, PARTIES), EMPLOYER);
  assert.equal(otherMessageParty(STRANGER, PARTIES), null);
  assert.equal(isAuthorizedMessageWallet(STRANGER, PARTIES), false);
});

test("employer message → freelancer notification; sender gets none", async () => {
  const notes = createMemoryNotificationStore();
  const db = messageStores();
  const sent = await createContractMessage(db, {
    contractAddress: CONTRACT,
    wallet: EMPLOYER,
    body: "Secret kickoff details for the employer only to type.",
  });

  const emit = await notifyOtherPartyOfMessage(notes, {
    contractAddress: CONTRACT,
    messageId: sent.id,
    senderWallet: EMPLOYER,
    parties: PARTIES,
  });
  assert.equal(emit.created, true);

  const forFreelancer = await listNotifications(notes, {
    recipientWallet: FREELANCER,
    cursor: null,
    limit: "20",
  });
  assert.equal(forFreelancer.notifications.length, 1);
  assert.equal(forFreelancer.notifications[0].type, "message_received");
  assert.equal(forFreelancer.notifications[0].title, MESSAGE_RECEIVED_TITLE);
  assert.equal(forFreelancer.notifications[0].body, MESSAGE_RECEIVED_BODY);

  const forEmployer = await listNotifications(notes, {
    recipientWallet: EMPLOYER,
    cursor: null,
    limit: "20",
  });
  assert.equal(forEmployer.notifications.length, 0);
  assert.equal((await unreadNotificationCount(notes, FREELANCER)).unreadCount, 1);
  assert.equal((await unreadNotificationCount(notes, EMPLOYER)).unreadCount, 0);
});

test("freelancer message → employer notification", async () => {
  const notes = createMemoryNotificationStore();
  const db = messageStores();
  const sent = await createContractMessage(db, {
    contractAddress: CONTRACT,
    wallet: FREELANCER,
    body: "Delivery update from freelancer.",
  });
  await notifyOtherPartyOfMessage(notes, {
    contractAddress: CONTRACT,
    messageId: sent.id,
    senderWallet: FREELANCER,
    parties: PARTIES,
  });
  const forEmployer = await listNotifications(notes, {
    recipientWallet: EMPLOYER,
    cursor: null,
    limit: "10",
  });
  assert.equal(forEmployer.notifications.length, 1);
  assert.equal(
    (await listNotifications(notes, { recipientWallet: FREELANCER, cursor: null, limit: "10" }))
      .notifications.length,
    0
  );
});

test("retry does not duplicate notification; same unique_key is idempotent", async () => {
  const notes = createMemoryNotificationStore();
  const messageId = "11111111-1111-4111-8111-111111111111";
  const first = await notifyOtherPartyOfMessage(notes, {
    contractAddress: CONTRACT,
    messageId,
    senderWallet: EMPLOYER,
    parties: PARTIES,
  });
  const second = await notifyOtherPartyOfMessage(notes, {
    contractAddress: CONTRACT,
    messageId,
    senderWallet: EMPLOYER,
    parties: PARTIES,
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(
    messageReceivedUniqueKey(messageId, FREELANCER),
    `message_received:${messageId}:${FREELANCER}`
  );
  assert.equal(
    (await listNotifications(notes, { recipientWallet: FREELANCER, cursor: null, limit: "20" }))
      .notifications.length,
    1
  );
});

test("private message body is not copied into notification", async () => {
  const notes = createMemoryNotificationStore();
  const secret = "PRIVATE_CHAT_BODY_MUST_NOT_LEAK";
  const db = messageStores();
  const sent = await createContractMessage(db, {
    contractAddress: CONTRACT,
    wallet: EMPLOYER,
    body: secret,
  });
  await notifyOtherPartyOfMessage(notes, {
    contractAddress: CONTRACT,
    messageId: sent.id,
    senderWallet: EMPLOYER,
    parties: PARTIES,
  });
  const note = (
    await listNotifications(notes, { recipientWallet: FREELANCER, cursor: null, limit: "5" })
  ).notifications[0];
  assert.notEqual(note.body, secret);
  assert.doesNotMatch(note.body, /PRIVATE_CHAT/);
  assert.equal(note.body, MESSAGE_RECEIVED_BODY);
  assert.deepEqual(note.payload, { messageId: sent.id });
  assert.ok(!("body" in (note.payload ?? {})));
});

test("correct contract deep link", () => {
  assert.equal(messageNotificationHref(CONTRACT), `/contracts/${CONTRACT}?chat=1`);
  const panel = readFileSync(join(ROOT, "components/contracts/ContractMessages.tsx"), "utf8");
  assert.match(panel, /shouldOpenChatFromSearch/);
  assert.match(panel, /consumeOpenContractChat/);
  assert.match(panel, /OPEN_CONTRACT_CHAT_EVENT/);
  assert.match(panel, /setChatOpen\(true\)/);
  assert.doesNotMatch(panel, /deepLinkOpened/);
});

test("existing message unread/read behavior still works alongside notifications", async () => {
  const db = messageStores();
  const notes = createMemoryNotificationStore();
  const sent = await createContractMessage(db, {
    contractAddress: CONTRACT,
    wallet: EMPLOYER,
    body: "Unread thread check.",
  });
  await notifyOtherPartyOfMessage(notes, {
    contractAddress: CONTRACT,
    messageId: sent.id,
    senderWallet: EMPLOYER,
    parties: PARTIES,
  });

  assert.equal(await unreadCountForWallet(db.messages, CONTRACT, FREELANCER), 1);
  assert.equal((await unreadNotificationCount(notes, FREELANCER)).unreadCount, 1);

  await markThreadRead(db.messages, {
    contractAddress: CONTRACT,
    wallet: FREELANCER,
    lastReadMessageId: sent.id,
  });
  assert.equal(await unreadCountForWallet(db.messages, CONTRACT, FREELANCER), 0);
  // Thread read must not clear the cross-contract notification inbox.
  assert.equal((await unreadNotificationCount(notes, FREELANCER)).unreadCount, 1);

  const page = await listContractMessages(db.messages, {
    contractAddress: CONTRACT,
    cursor: null,
    limit: "30",
    wallet: FREELANCER,
  });
  assert.equal(page.messages.length, 1);
  assert.equal(page.unreadCount, 0);
});

test("notification unread count reflects the new message notification", async () => {
  const notes = createMemoryNotificationStore();
  await notifyOtherPartyOfMessage(notes, {
    contractAddress: CONTRACT,
    messageId: "22222222-2222-4222-8222-222222222222",
    senderWallet: FREELANCER,
    parties: PARTIES,
  });
  await createNotification(notes, {
    recipientWallet: EMPLOYER,
    type: "work_submitted",
    uniqueKey: "other-event",
    title: "Work submitted",
    body: "A deliverable is ready for review.",
    contractAddress: CONTRACT,
  });
  assert.equal((await unreadNotificationCount(notes, EMPLOYER)).unreadCount, 2);
});

test("stranger cannot be treated as a message party for notification routing", async () => {
  const notes = createMemoryNotificationStore();
  const result = await notifyOtherPartyOfMessage(notes, {
    contractAddress: CONTRACT,
    messageId: "33333333-3333-4333-8333-333333333333",
    senderWallet: STRANGER,
    parties: PARTIES,
  });
  assert.equal(result.created, false);
  assert.equal(result.skipped, "no_counterparty");
  assert.equal(
    (await listNotifications(notes, { recipientWallet: EMPLOYER, cursor: null, limit: "5" }))
      .notifications.length,
    0
  );
  assert.equal(
    (await listNotifications(notes, { recipientWallet: FREELANCER, cursor: null, limit: "5" }))
      .notifications.length,
    0
  );
});

test("messages POST route emits best-effort notification after persist", () => {
  const route = readFileSync(
    join(ROOT, "app/api/contracts/[address]/messages/route.ts"),
    "utf8"
  );
  assert.match(route, /notifyOtherPartyOfMessage/);
  assert.match(route, /stores\.notifications/);
  assert.match(route, /parties/);
  assert.match(route, /session\.walletAddress/);
  assert.match(route, /createContractMessage/);
  assert.match(route, /message_received emit failed/);
  // Recipient must not come from the request body.
  assert.doesNotMatch(route, /body\.recipient|body\.wallet/);
});
