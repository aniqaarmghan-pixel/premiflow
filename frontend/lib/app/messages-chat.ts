import type { PublicContractMessage } from "@/lib/server/messages/pagination";
import type { ContractRole, PaymentModeName } from "@/lib/streampay-v2";

import type { MessagesPanelState } from "./messages-panel";

export const OPEN_CHAT_LABEL = "Open chat";
export const CLOSE_CHAT_LABEL = "Close";
export const LOAD_EARLIER_LABEL = "Load earlier messages";
export const MESSAGES_WORKSPACE_CONNECTED = "Connected";
export const MESSAGES_WORKSPACE_HEADING = "Messages";

export const CHAT_VERIFY_COPY = {
  headline: "Verify once to keep your contract messages private.",
  detail: "Message signature only — no transaction or fee.",
} as const;

export const CHAT_CARD_PRIVACY =
  "Employer and freelancer only. Stored by PREMIFLOW, not end-to-end encrypted.";

export const COMPACT_AUTH_STATUS: Record<MessagesPanelState, string> = {
  disconnected: "Connect a wallet to use Messages.",
  unverified: "Verify to open private messages.",
  verifying: "Waiting for a wallet signature…",
  verify_failed: "Verification did not complete.",
  session_mismatch: "Verify this wallet to continue.",
  unauthorized: "Only the employer and freelancer can chat.",
  loading: "Loading messages…",
  ready: "Private conversation",
  expired: "Verification expired.",
  rpc_unavailable: "Contract parties could not be checked.",
  backend_unavailable: "Messaging is temporarily unavailable.",
};

export const FUTURE_CHAT_ACTIONS = {
  attachments: false,
  reply: false,
  addToDisputeEvidence: false,
  unreadBadgesLive: true,
  contextLabels: false,
  premiflowAssistant: false,
} as const;

export function otherParticipantLabel(viewerRole: ContractRole): "Employer" | "Freelancer" | "Other participant" {
  if (viewerRole === "employer") return "Freelancer";
  if (viewerRole === "freelancer") return "Employer";
  return "Other participant";
}

export function messageBubbleSide(mine: boolean): "own" | "theirs" {
  return mine ? "own" : "theirs";
}

export function latestMessagePreview(
  messages: readonly Pick<PublicContractMessage, "body">[],
  max = 90
): string | null {
  if (messages.length === 0) return null;
  const body = messages[messages.length - 1].body.trim().replace(/\s+/g, " ");
  if (!body) return null;
  return body.length > max ? `${body.slice(0, max - 1)}…` : body;
}

export function shortContractChatLabel(
  paymentMode: PaymentModeName,
  title: string | null | undefined
): string {
  const trimmed = title?.trim();
  if (trimmed) return `${paymentMode} · ${trimmed}`;
  return paymentMode;
}

export function conversationRendersOnContractPage(chatOpen: boolean): boolean {
  return chatOpen;
}

export function shouldFollowNewestOnOpen(open: boolean): boolean {
  return open;
}
