"use client";

import { MessagesSquare } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  ChatComposer,
  ChatHistory,
  ChatVerifyGate,
  ContractChatDialog,
} from "@/components/contracts/ContractChatDialog";
import {
  CONTRACT_MESSAGES_SUBTITLE,
  CONTRACT_MESSAGES_TARGET_UX,
  CONTRACT_MESSAGES_TITLE,
  isContractMessageParticipant,
  validateMessageBody,
} from "@/lib/app/contract-messages";
import {
  CHAT_CARD_PRIVACY,
  COMPACT_AUTH_STATUS,
  OPEN_CHAT_LABEL,
  latestMessagePreview,
  otherParticipantLabel,
  shortContractChatLabel,
} from "@/lib/app/messages-chat";
import {
  createChallenge,
  fetchContractMessages,
  fetchSession,
  logoutSession,
  markContractMessagesRead,
  sendContractMessage,
  signatureToBase64,
  verifyChallenge,
  type ApiError,
} from "@/lib/app/messages-client";
import {
  MESSAGES_PANEL_COPY,
  MESSAGES_POLL_MS,
  mergeMessagesById,
  panelStateFromApiError,
  resolveInitialPanelState,
  sessionMatchesConnectedWallet,
  shouldClearConversationOnWalletChange,
  shouldPollMessages,
  shouldRevokeSessionOnWalletChange,
  shouldShowComposer,
  type MessagesPanelState,
} from "@/lib/app/messages-panel";
import type { PublicContractMessage } from "@/lib/server/messages/pagination";
import type { ContractRole, PaymentModeName } from "@/lib/streampay-v2";

export function ContractMessages({
  role,
  paymentMode,
  contractAddress,
  contractTitle,
}: {
  role: ContractRole;
  paymentMode: PaymentModeName;
  contractAddress: string;
  contractTitle?: string;
}) {
  const { connected, publicKey, signMessage } = useWallet();
  const connectedWallet = publicKey?.toBase58() ?? null;
  const participant = isContractMessageParticipant(role);
  const [state, setState] = useState<MessagesPanelState>(() =>
    resolveInitialPanelState({ connected, role })
  );
  const [messages, setMessages] = useState<PublicContractMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [followNewest, setFollowNewest] = useState(true);
  const lastWallet = useRef<string | null>(connectedWallet);
  const cursorInitialized = useRef(false);
  const visible = useBrowserVisible();

  const clearConversation = useCallback(() => {
    setMessages([]);
    setUnreadCount(0);
    setSendFailed(false);
    setNextCursor(null);
    cursorInitialized.current = false;
  }, []);

  const applyApiError = useCallback((err: unknown) => {
    const api = err as ApiError;
    const next = panelStateFromApiError(api.status, api.code);
    if (next) setState(next);
    return api;
  }, []);

  const loadConversation = useCallback(async () => {
    const page = await fetchContractMessages(contractAddress);
    setMessages((current) => mergeMessagesById(current, page.messages));
    setUnreadCount(page.unreadCount);
    if (!cursorInitialized.current) {
      setNextCursor(page.nextCursor);
      cursorInitialized.current = true;
    }
    if (page.messages.length > 0) {
      const last = page.messages[page.messages.length - 1];
      try {
        const read = await markContractMessagesRead(contractAddress, last.id);
        setUnreadCount(read.unreadCount);
      } catch {
        // Read receipts are best-effort; the thread still loads.
      }
    }
    setState("ready");
  }, [contractAddress]);

  useEffect(() => {
    if (shouldClearConversationOnWalletChange(lastWallet.current, connectedWallet)) {
      clearConversation();
      setDraft("");
      setChatOpen(false);
      if (shouldRevokeSessionOnWalletChange(lastWallet.current, connectedWallet)) {
        void logoutSession().catch(() => undefined);
      }
      setState(resolveInitialPanelState({ connected, role }));
    }
    lastWallet.current = connectedWallet;
  }, [clearConversation, connected, connectedWallet, role]);

  useEffect(() => {
    if (!shouldPollMessages(state, visible)) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadConversation().catch((err) => applyApiError(err));
      }
    }, MESSAGES_POLL_MS);
    return () => window.clearInterval(id);
  }, [applyApiError, loadConversation, state, visible]);

  async function onVerifyWallet() {
    if (!connectedWallet) return;
    if (!signMessage) {
      setVerifyError("This wallet cannot sign login messages.");
      setState("verify_failed");
      return;
    }
    setVerifyError(null);
    setState("verifying");
    try {
      const challenge = await createChallenge(connectedWallet);
      const signature = await signMessage(new TextEncoder().encode(challenge.message));
      await verifyChallenge(challenge.challengeId, signatureToBase64(signature));
      const me = await fetchSession();
      if (!sessionMatchesConnectedWallet(me.wallet, connectedWallet)) {
        await logoutSession().catch(() => undefined);
        setState("session_mismatch");
        return;
      }
      setState("loading");
      setFollowNewest(true);
      await loadConversation();
    } catch (err) {
      const api = err as ApiError;
      setVerifyError(api.message);
      setState(panelStateFromApiError(api.status, api.code) ?? "verify_failed");
    }
  }

  useEffect(() => {
    if (!connectedWallet || !participant) return;
    if (state !== "unverified") return;
    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchSession();
        if (cancelled) return;
        if (!sessionMatchesConnectedWallet(me.wallet, connectedWallet)) {
          setState("session_mismatch");
          return;
        }
        setState("loading");
        await loadConversation();
      } catch (err) {
        if (cancelled) return;
        const api = err as ApiError;
        setState(panelStateFromApiError(api.status, api.code) ?? "unverified");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedWallet, loadConversation, participant, state]);

  async function onSend() {
    const parsed = validateMessageBody(draft);
    if (!parsed.ok) return;
    setSending(true);
    setSendFailed(false);
    try {
      const result = await sendContractMessage(contractAddress, draft);
      setFollowNewest(true);
      setMessages((current) => mergeMessagesById(current, [result.message]));
      setDraft("");
    } catch {
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  }

  async function onLoadEarlier() {
    if (!nextCursor) return;
    setFollowNewest(false);
    try {
      const page = await fetchContractMessages(contractAddress, { cursor: nextCursor });
      setMessages((current) => mergeMessagesById(current, page.messages));
      setNextCursor(page.nextCursor);
    } catch (err) {
      applyApiError(err);
    }
  }

  function openChat() {
    setFollowNewest(true);
    setChatOpen(true);
  }

  const composerOpen = shouldShowComposer(state) && participant;
  const canSend = composerOpen && !sending && validateMessageBody(draft).ok;
  const preview = state === "ready" ? latestMessagePreview(messages) : null;
  const needsVerify =
    state === "unverified" ||
    state === "verifying" ||
    state === "verify_failed" ||
    state === "expired" ||
    state === "session_mismatch";

  return (
    <>
      <section
        aria-labelledby="contract-messages-heading"
        className="rounded-[24px] border border-line bg-card p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
              {CONTRACT_MESSAGES_SUBTITLE}
            </p>
            <h2
              id="contract-messages-heading"
              className="mt-1 flex items-center gap-2 font-display text-2xl"
            >
              <MessagesSquare size={20} aria-hidden="true" />
              {CONTRACT_MESSAGES_TITLE}
              {unreadCount > 0 ? (
                <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs font-semibold text-ink-soft">
                  {unreadCount}
                </span>
              ) : null}
            </h2>
          </div>
          <p
            className="rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold text-ink-soft"
            aria-live="polite"
          >
            {COMPACT_AUTH_STATUS[state]}
          </p>
        </div>

        <p className="mt-3 text-sm leading-6 text-ink-soft">{CHAT_CARD_PRIVACY}</p>
        {preview ? (
          <p className="mt-2 truncate text-sm text-ink">{preview}</p>
        ) : (
          <p className="mt-2 text-sm text-ink-faint">
            Same Messages surface for {paymentMode} and every other contract type.
          </p>
        )}

        <div className="mt-4">
          <Button type="button" onClick={openChat} aria-label={OPEN_CHAT_LABEL}>
            {OPEN_CHAT_LABEL}
          </Button>
        </div>
      </section>

      <ContractChatDialog
        open={chatOpen}
        title={CONTRACT_MESSAGES_TITLE}
        subtitle={CONTRACT_MESSAGES_SUBTITLE}
        contractLabel={shortContractChatLabel(paymentMode, contractTitle)}
        onClose={() => setChatOpen(false)}
      >
        {needsVerify ? (
          <ChatVerifyGate
            disabled={!connectedWallet}
            verifying={state === "verifying"}
            error={verifyError}
            onVerify={() => void onVerifyWallet()}
          />
        ) : null}

        {state === "disconnected" ||
        state === "unauthorized" ||
        state === "rpc_unavailable" ||
        state === "backend_unavailable" ? (
          <p className="flex min-h-0 flex-1 items-center px-5 py-8 text-sm leading-6 text-ink-soft">
            {MESSAGES_PANEL_COPY[state]}
          </p>
        ) : null}

        {state === "loading" ? (
          <p className="flex min-h-0 flex-1 items-center px-5 py-8 text-sm text-ink-faint">
            {CONTRACT_MESSAGES_TARGET_UX.loading}
          </p>
        ) : null}

        {state === "ready" ? (
          <ChatHistory
            messages={messages}
            connectedWallet={connectedWallet}
            otherLabel={otherParticipantLabel(role)}
            empty={CONTRACT_MESSAGES_TARGET_UX.empty}
            nextCursor={nextCursor}
            onLoadEarlier={() => void onLoadEarlier()}
            followNewest={followNewest}
          />
        ) : null}

        {composerOpen ? (
          <ChatComposer
            draft={draft}
            sending={sending}
            sendFailed={sendFailed}
            canSend={canSend}
            onDraftChange={setDraft}
            onSend={() => void onSend()}
          />
        ) : null}
      </ContractChatDialog>
    </>
  );
}

function useBrowserVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    function onChange() {
      setVisible(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}
