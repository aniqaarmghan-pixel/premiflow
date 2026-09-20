import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MESSAGES_PANEL_COPY,
  MESSAGES_POLL_MS,
  MESSAGES_PRIVACY_COPY,
  VERIFY_WALLET_EXPLAIN,
  mergeMessagesById,
  resolveInitialPanelState,
  sessionMatchesConnectedWallet,
  shouldClearConversationOnWalletChange,
  shouldPollMessages,
  shouldRevokeSessionOnWalletChange,
  shouldShowComposer,
} from "../messages-panel";
import {
  CHAT_CARD_PRIVACY,
  CHAT_VERIFY_COPY,
  COMPACT_AUTH_STATUS,
  FUTURE_CHAT_ACTIONS,
  OPEN_CHAT_LABEL,
  conversationRendersOnContractPage,
  latestMessagePreview,
  messageBubbleSide,
  otherParticipantLabel,
  shortContractChatLabel,
} from "../messages-chat";
import { CONTRACT_MESSAGE_MAX_LENGTH, messagingAvailableForPaymentMode } from "../contract-messages";
import { SUPPORT_TOPICS } from "../support";
import { MESSAGE_EVIDENCE_COPY } from "../resolution-center";

const PANEL = readFileSync(
  new URL("../../../components/contracts/ContractMessages.tsx", import.meta.url),
  "utf8"
);
const DIALOG = readFileSync(
  new URL("../../../components/contracts/ContractChatDialog.tsx", import.meta.url),
  "utf8"
);
const UI = PANEL + DIALOG;
const CLIENT = readFileSync(
  new URL("../messages-client.ts", import.meta.url),
  "utf8"
);

test("compact Messages card opens a chat dialog and does not inline the thread", () => {
  assert.equal(OPEN_CHAT_LABEL, "Open chat");
  assert.match(PANEL, /OPEN_CHAT_LABEL/);
  assert.match(PANEL, /<ContractChatDialog/);
  assert.match(PANEL, /latestMessagePreview/);
  assert.equal(conversationRendersOnContractPage(false), false);
  assert.doesNotMatch(PANEL, /messages\.map\(\(message\) =>/);
  assert.match(DIALOG, /messages\.map\(\(message\) =>/);
});

test("chat dialog closes from Close and overlay, and uses a bounded history scroller", () => {
  assert.match(DIALOG, /aria-label=\{CLOSE_CHAT_LABEL\}/);
  assert.match(DIALOG, /aria-label="Close chat overlay"/);
  assert.match(DIALOG, /role="dialog"/);
  assert.match(DIALOG, /sm:h-\[80vh\]/);
  assert.match(DIALOG, /h-\[100dvh\]/);
  assert.match(DIALOG, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(DIALOG, /shrink-0 border-t/);
});

test("Verify wallet is never started automatically", () => {
  assert.match(PANEL, /onVerify=\{\(\) => void onVerifyWallet\(\)\}/);
  assert.doesNotMatch(PANEL, /useEffect\([\s\S]{0,200}onVerifyWallet/);
  assert.doesNotMatch(PANEL, /useEffect\([\s\S]{0,400}signMessage/);
  assert.match(PANEL, /unverified/);
});

test("Verify wallet copy is shown in the chat dialog", () => {
  assert.equal(VERIFY_WALLET_EXPLAIN.button, "Verify wallet");
  assert.equal(CHAT_VERIFY_COPY.headline, "Verify once to keep your contract messages private.");
  assert.equal(CHAT_VERIFY_COPY.detail, "Message signature only — no transaction or fee.");
  assert.match(DIALOG, /CHAT_VERIFY_COPY\.headline/);
  assert.match(DIALOG, /CHAT_VERIFY_COPY\.detail/);
  assert.match(DIALOG, /aria-label="Verify wallet"/);
  assert.equal(MESSAGES_PANEL_COPY.disconnected, "Connect a wallet to use Contract Messages.");
  assert.equal(MESSAGES_PANEL_COPY.unverified, "Verify your wallet to open private messages.");
  assert.equal(COMPACT_AUTH_STATUS.unverified, "Verify to open private messages.");
});

test("Send is available only after a verified participant session", () => {
  assert.equal(shouldShowComposer("ready"), true);
  assert.equal(shouldShowComposer("unverified"), false);
  assert.equal(shouldShowComposer("disconnected"), false);
  assert.equal(shouldShowComposer("unauthorized"), false);
  assert.match(PANEL, /composerOpen = shouldShowComposer\(state\) && participant/);
  assert.match(PANEL, /canSend = composerOpen && !sending/);
  assert.match(PANEL, /composerOpen \? \(/);
});

test("failed send keeps the draft and offers Retry", () => {
  assert.match(PANEL, /setSendFailed\(true\)/);
  assert.match(
    PANEL,
    /setMessages\(\(current\) => mergeMessagesById\(current, \[result\.message\]\)\);\s*setDraft\(""\);/
  );
  assert.match(PANEL, /\} catch \{\s*setSendFailed\(true\);/);
  assert.match(DIALOG, /CONTRACT_MESSAGES_TARGET_UX\.failedSend/);
  assert.match(DIALOG, /aria-label="Retry"/);
});

test("composer enforces 2000 characters and disables empty send", () => {
  assert.equal(CONTRACT_MESSAGE_MAX_LENGTH, 2_000);
  assert.match(DIALOG, /maxLength=\{CONTRACT_MESSAGE_MAX_LENGTH\}/);
  assert.match(DIALOG, /disabled=\{!canSend\}/);
  assert.match(DIALOG, /draft\.trim\(\)\.length/);
});

test("current user and other participant bubbles are distinguished by side and text", () => {
  assert.equal(messageBubbleSide(true), "own");
  assert.equal(messageBubbleSide(false), "theirs");
  assert.equal(otherParticipantLabel("employer"), "Freelancer");
  assert.equal(otherParticipantLabel("freelancer"), "Employer");
  assert.match(DIALOG, /data-side=\{side\}/);
  assert.match(DIALOG, /mine \? "ml-auto items-end" : "mr-auto items-start"/);
  assert.match(DIALOG, /mine \? "You" : otherLabel/);
  assert.doesNotMatch(DIALOG, /Delivered|Read receipt|Seen/);
});

test("wallet change hides the prior conversation and revokes the old session", () => {
  assert.equal(shouldClearConversationOnWalletChange("A", "B"), true);
  assert.equal(shouldClearConversationOnWalletChange("A", null), true);
  assert.equal(shouldClearConversationOnWalletChange(null, "A"), true);
  assert.equal(shouldRevokeSessionOnWalletChange("A", "B"), true);
  assert.equal(shouldRevokeSessionOnWalletChange("A", null), true);
  assert.equal(shouldRevokeSessionOnWalletChange(null, "A"), false);
  assert.equal(sessionMatchesConnectedWallet("A", "B"), false);
  assert.match(PANEL, /shouldRevokeSessionOnWalletChange/);
  assert.match(PANEL, /clearConversation\(\)/);
  assert.match(PANEL, /setChatOpen\(false\)/);
});

test("all four payment modes retain Messages", () => {
  for (const mode of ["Fixed", "Milestone", "Streaming", "Hourly"] as const) {
    assert.equal(messagingAvailableForPaymentMode(mode), true);
  }
  assert.match(PANEL, /Same Messages surface for \{paymentMode\}/);
  assert.equal(shortContractChatLabel("Hourly", "Protected contract"), "Hourly · Protected contract");
});

test("polling is 20s only while visible, authenticated, and authorized", () => {
  assert.equal(MESSAGES_POLL_MS, 20_000);
  assert.equal(shouldPollMessages("ready", true), true);
  assert.equal(shouldPollMessages("ready", false), false);
  assert.equal(shouldPollMessages("unverified", true), false);
  assert.match(PANEL, /shouldPollMessages\(state, visible\)/);
});

test("privacy wording is stored-by-PREMIFLOW, not E2EE", () => {
  assert.match(MESSAGES_PRIVACY_COPY, /stored by PREMIFLOW/);
  assert.match(MESSAGES_PRIVACY_COPY, /not end-to-end encrypted/);
  assert.doesNotMatch(MESSAGES_PRIVACY_COPY, /private from PREMIFLOW/);
  assert.match(CHAT_CARD_PRIVACY, /not end-to-end encrypted/);
  assert.match(UI, /CHAT_CARD_PRIVACY|MESSAGES_PRIVACY_COPY/);
});

test("client uses same-origin APIs and cookie credentials, never localStorage tokens", () => {
  assert.match(CLIENT, /credentials: "include"/);
  assert.match(CLIENT, /"\/api\/auth\/challenge"/);
  assert.match(CLIENT, /"\/api\/auth\/verify"/);
  assert.doesNotMatch(CLIENT, /localStorage|sessionStorage/);
  assert.doesNotMatch(PANEL, /localStorage|sessionStorage/);
});

test("mergeMessagesById prevents duplicates across polls", () => {
  const merged = mergeMessagesById(
    [
      {
        id: "1",
        contractAddress: "C",
        senderWallet: "A",
        body: "hi",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    [
      {
        id: "1",
        contractAddress: "C",
        senderWallet: "A",
        body: "hi",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        contractAddress: "C",
        senderWallet: "B",
        body: "there",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ]
  );
  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["1", "2"]
  );
  assert.equal(latestMessagePreview(merged), "there");
});

test("resolver and AI still have no automatic thread access", () => {
  assert.equal(resolveInitialPanelState({ connected: true, role: "resolver" }), "unauthorized");
  assert.match(MESSAGE_EVIDENCE_COPY.body, /will not automatically read/i);
  const messages = SUPPORT_TOPICS.find((topic) => topic.id === "messages");
  assert.doesNotMatch(messages?.body.join(" ") ?? "", /being connected/);
  assert.match(messages?.body.join(" ") ?? "", /stored by PREMIFLOW off-chain/);
  assert.equal(FUTURE_CHAT_ACTIONS.attachments, false);
  assert.equal(FUTURE_CHAT_ACTIONS.reply, false);
  assert.equal(FUTURE_CHAT_ACTIONS.addToDisputeEvidence, false);
  assert.equal(FUTURE_CHAT_ACTIONS.premiflowAssistant, false);
  assert.doesNotMatch(UI, /Attach file|Reply to this message|Ask PREMIFLOW Assistant/);
});
