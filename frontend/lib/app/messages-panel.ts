import type { PublicContractMessage } from "@/lib/server/messages/pagination";
import type { ContractRole } from "@/lib/streampay-v2";

export type MessagesPanelState =
  | "disconnected"
  | "unverified"
  | "verifying"
  | "verify_failed"
  | "session_mismatch"
  | "unauthorized"
  | "loading"
  | "ready"
  | "expired"
  | "rpc_unavailable"
  | "backend_unavailable";

export const MESSAGES_PANEL_COPY: Record<MessagesPanelState, string> = {
  disconnected: "Connect a wallet to use Contract Messages.",
  unverified: "Verify your wallet to open private messages.",
  verifying: "Waiting for a wallet message signature…",
  verify_failed: "Wallet verification did not complete. You can try again.",
  session_mismatch:
    "The connected wallet does not match the verified session. Verify this wallet to continue.",
  unauthorized: "Only this contract's employer and freelancer can use Messages.",
  loading: "Loading messages…",
  ready: "Conversation",
  expired: "Verification expired. Verify your wallet again.",
  rpc_unavailable: "Contract parties could not be checked. Try again.",
  backend_unavailable: "Messaging is temporarily unavailable.",
};

export const VERIFY_WALLET_EXPLAIN = {
  button: "Verify wallet",
  proves: "proves wallet ownership",
  messageOnly: "message signature only",
  notTransaction: "not a transaction",
  noSol: "costs no SOL",
  noSpend: "does not grant spending permission",
} as const;

export const MESSAGES_PRIVACY_COPY =
  "Messages are stored by PREMIFLOW for this contract and are available only to the verified employer and freelancer. This is not end-to-end encrypted.";

export const MESSAGES_POLL_MS = 20_000;

export function sessionMatchesConnectedWallet(
  sessionWallet: string | null,
  connectedWallet: string | null
): boolean {
  return Boolean(sessionWallet && connectedWallet && sessionWallet === connectedWallet);
}

export function shouldShowComposer(state: MessagesPanelState): boolean {
  return state === "ready";
}

export function shouldPollMessages(state: MessagesPanelState, visible: boolean): boolean {
  return visible && state === "ready";
}

export function shouldClearConversationOnWalletChange(
  previousWallet: string | null,
  nextWallet: string | null
): boolean {
  return previousWallet !== nextWallet;
}

export function shouldRevokeSessionOnWalletChange(
  previousWallet: string | null,
  nextWallet: string | null
): boolean {
  return previousWallet != null && previousWallet !== nextWallet;
}

export function resolveInitialPanelState(input: {
  connected: boolean;
  role: ContractRole;
}): MessagesPanelState {
  if (!input.connected) return "disconnected";
  if (input.role !== "employer" && input.role !== "freelancer") return "unauthorized";
  return "unverified";
}

export function mergeMessagesById(
  current: readonly PublicContractMessage[],
  incoming: readonly PublicContractMessage[]
): PublicContractMessage[] {
  const map = new Map<string, PublicContractMessage>();
  for (const message of current) map.set(message.id, message);
  for (const message of incoming) map.set(message.id, message);
  return [...map.values()].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function panelStateFromApiError(
  status: number,
  code: string
): MessagesPanelState | null {
  if (status === 401) return code.includes("expired") || code.includes("revoked") ? "expired" : "unverified";
  if (status === 403) return "unauthorized";
  if (status === 502) return "rpc_unavailable";
  if (status === 503) return "backend_unavailable";
  return null;
}
