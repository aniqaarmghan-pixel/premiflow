import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CONTRACT_MESSAGES_CONNECTING,
  CONTRACT_MESSAGES_TITLE,
  CONTRACT_MESSAGE_AI_POLICY,
  CONTRACT_MESSAGE_AUTH_PLAN,
  CONTRACT_MESSAGE_CHANNELS,
  CONTRACT_MESSAGE_MAX_LENGTH,
  CONTRACT_MESSAGE_PERSISTENCE,
  CONTRACT_MESSAGING_BACKEND_REQUIRED,
  CONTRACT_MESSAGING_STATUS,
  MESSAGE_EVIDENCE_PLAN,
  WHATSAPP_RECOMMENDATION,
  canSelectMessageForEvidence,
  contractMessagesAudience,
  contractMessagesCopy,
  isContractMessageParticipant,
  localOnlySendIsPresentedAsPersistent,
  messagingAvailableForPaymentMode,
  plannedMessageContextLabel,
  resolverIsChatParticipant,
  validateMessageBody,
} from "../contract-messages";
import { MESSAGE_EVIDENCE_COPY } from "../resolution-center";
import { SUPPORT_TOPICS } from "../support";

const CONTRACT_TYPES = ["Fixed", "Milestone", "Streaming", "Hourly"] as const;

test("Messages are available for all four contract types", () => {
  for (const type of CONTRACT_TYPES) {
    assert.equal(messagingAvailableForPaymentMode(type), true);
  }
  const detail = readFileSync(
    new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
    "utf8"
  );
  assert.match(detail, /<ContractMessages role=\{role\} paymentMode=\{contract\.paymentMode\} \/>/);
  assert.doesNotMatch(detail, /paymentMode === "Hourly"[\s\S]{0,80}ContractMessages/);
});

test("employer and freelancer are the only chat participants", () => {
  assert.equal(isContractMessageParticipant("employer"), true);
  assert.equal(isContractMessageParticipant("freelancer"), true);
  assert.equal(isContractMessageParticipant("resolver"), false);
  assert.equal(isContractMessageParticipant("none"), false);
  assert.equal(contractMessagesAudience("employer"), "employer_freelancer");
  assert.equal(contractMessagesAudience("freelancer"), "employer_freelancer");
  assert.equal(contractMessagesAudience("resolver"), "none");
  assert.equal(contractMessagesAudience("none"), "none");
});

test("resolver is not automatically a chat participant", () => {
  assert.equal(resolverIsChatParticipant("resolver"), false);
  assert.equal(resolverIsChatParticipant("employer"), false);
  assert.match(contractMessagesCopy("resolver").body, /does not automatically read/i);
  assert.equal(MESSAGE_EVIDENCE_PLAN.automaticResolverAccess, false);
  assert.equal(MESSAGE_EVIDENCE_PLAN.disclosesEntireThread, false);
  assert.equal(canSelectMessageForEvidence("employer"), false);
  assert.equal(canSelectMessageForEvidence("resolver"), false);
});

test("no fake messages and no local-only Send flow", () => {
  assert.equal(CONTRACT_MESSAGING_STATUS.connected, false);
  assert.equal(CONTRACT_MESSAGING_STATUS.persistent, false);
  assert.equal(CONTRACT_MESSAGING_STATUS.sendEnabled, false);
  assert.equal(CONTRACT_MESSAGING_STATUS.localOnlySendForbidden, true);
  assert.equal(CONTRACT_MESSAGING_STATUS.encrypted, false);
  assert.equal(CONTRACT_MESSAGING_STATUS.storesOnChain, false);
  assert.equal(localOnlySendIsPresentedAsPersistent(), false);
  assert.equal(CONTRACT_MESSAGES_TITLE, "Messages");
  assert.equal(contractMessagesCopy("employer").status, CONTRACT_MESSAGES_CONNECTING);

  const panel = readFileSync(
    new URL("../../../components/contracts/ContractMessages.tsx", import.meta.url),
    "utf8"
  );
  assert.match(panel, /CONTRACT_MESSAGES_CONNECTING|copy\.status/);
  assert.match(panel, /CONTRACT_MESSAGES_TITLE/);
  assert.doesNotMatch(panel, /<button[^>]*>\s*Send/);
  assert.doesNotMatch(panel, /type=["']submit["']/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage|useState\(\[\]\)/);
  assert.doesNotMatch(panel, /Please work on the dashboard first/);
  assert.doesNotMatch(panel, /end-to-end encrypted|E2E/);
  assert.match(panel, /not encrypted yet/i);
});

test("support, messages, dispute, and assistant stay distinct", () => {
  assert.equal(
    CONTRACT_MESSAGE_CHANNELS.contractMessages.purpose.includes("employer"),
    true
  );
  assert.equal(CONTRACT_MESSAGE_CHANNELS.helpSupport.href, "/support");
  assert.match(CONTRACT_MESSAGE_CHANNELS.resolutionCenter.purpose, /disagreement/);
  assert.match(CONTRACT_MESSAGE_CHANNELS.assistant.purpose, /coming later/);
  assert.ok(SUPPORT_TOPICS.some((topic) => topic.id === "messages"));
  const messages = SUPPORT_TOPICS.find((topic) => topic.id === "messages");
  assert.match(messages?.body.join(" ") ?? "", /not Help & Support/i);
  assert.match(messages?.body.join(" ") ?? "", /not Resolution Center/i);
});

test("future evidence selection is a snapshot, not thread disclosure", () => {
  assert.equal(MESSAGE_EVIDENCE_PLAN.actionLabel, "Add to dispute evidence");
  assert.equal(MESSAGE_EVIDENCE_PLAN.createsSnapshot, true);
  assert.equal(MESSAGE_EVIDENCE_PLAN.connected, false);
  assert.equal(MESSAGE_EVIDENCE_COPY.actionLabel, "Add to dispute evidence");
  assert.match(MESSAGE_EVIDENCE_COPY.body, /will not automatically read/i);
  assert.match(plannedMessageContextLabel("fixed_deliverable"), /main deliverable/);
  assert.match(plannedMessageContextLabel("milestone", { index: 2 }), /milestone 2/);
  assert.match(plannedMessageContextLabel("streaming_schedule"), /schedule/);
  assert.match(plannedMessageContextLabel("hourly_session", { index: 4 }), /session #4/);
  assert.match(plannedMessageContextLabel("revision"), /revision request/);
});

test("message length validation and model bounds", () => {
  assert.equal(CONTRACT_MESSAGE_MAX_LENGTH, 2_000);
  assert.equal(validateMessageBody("").ok, false);
  assert.equal(validateMessageBody("   ").ok, false);
  assert.equal(validateMessageBody("Okay. Starting now.").ok, true);
  assert.equal(validateMessageBody("x".repeat(2_000)).ok, true);
  assert.equal(validateMessageBody("x".repeat(2_001)).ok, false);
});

test("wallet address JSON claims are not authentication", () => {
  assert.equal(CONTRACT_MESSAGE_AUTH_PLAN.trustBrowserWalletClaim, false);
  assert.deepEqual(CONTRACT_MESSAGE_AUTH_PLAN.flow, [
    "server issues nonce/challenge",
    "wallet signs challenge",
    "server verifies signature",
    "authenticated session is established",
    "server checks contract participant authorization",
    "message API permits read/write",
  ]);
});

test("persistence recommendation stays off-chain and uninstalled in H4", () => {
  assert.equal(CONTRACT_MESSAGE_PERSISTENCE.recommended, "app_database");
  assert.equal(CONTRACT_MESSAGE_PERSISTENCE.installInH4, false);
  assert.match(CONTRACT_MESSAGE_PERSISTENCE.comparison.on_chain, /Rejected/);
  assert.ok(CONTRACT_MESSAGING_BACKEND_REQUIRED.length >= 4);
  assert.equal(WHATSAPP_RECOMMENDATION.required, false);
  assert.equal(WHATSAPP_RECOMMENDATION.addedInH4, false);
  assert.equal(WHATSAPP_RECOMMENDATION.primary, false);
});

test("AI policy forbids automatic private-chat reading and dispute decisions", () => {
  assert.equal(CONTRACT_MESSAGE_AI_POLICY.autoReadPrivateChat, false);
  assert.equal(CONTRACT_MESSAGE_AI_POLICY.decideDisputes, false);
  assert.equal(CONTRACT_MESSAGE_AI_POLICY.determinePaymentSplits, false);
  assert.equal(CONTRACT_MESSAGE_AI_POLICY.signTransactions, false);
  assert.equal(CONTRACT_MESSAGE_AI_POLICY.requiresExplicitPermission, true);
});

test("Messages panel is mobile-safe and accessible", () => {
  const panel = readFileSync(
    new URL("../../../components/contracts/ContractMessages.tsx", import.meta.url),
    "utf8"
  );
  assert.match(panel, /aria-labelledby="contract-messages-heading"/);
  assert.match(panel, /id="contract-messages-heading"/);
  assert.match(panel, /aria-live="polite"/);
  assert.doesNotMatch(panel, /min-w-\[[6-9]\d\d/);
});
