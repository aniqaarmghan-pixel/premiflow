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
  MESSAGES_WORKSPACE_CONNECTED,
  OPEN_CHAT_LABEL,
  latestMessagePreview,
  otherParticipantLabel,
  shortContractChatLabel,
} from "@/lib/app/messages-chat";
import {
  canRequestEarlierPage,
  detectNewActivityWhileReading,
  formatUnreadBadge,
  newestMessageId,
} from "@/lib/app/messages-history";
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
  discardPendingAttachment,
  uploadContractAttachment,
} from "@/lib/app/attachments-client";
import {
  MESSAGE_ATTACHMENT_MAX,
  validateAttachmentFile,
} from "@/lib/app/attachments-policy";
import type { AttachmentChipModel } from "@/components/contracts/AttachmentChips";
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

type PendingComposerAttachment = AttachmentChipModel & {
  file: File;
  attachmentId?: string;
};

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
  const [pendingAttachments, setPendingAttachments] = useState<PendingComposerAttachment[]>(
    []
  );
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [followNewest, setFollowNewest] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [newActivity, setNewActivity] = useState(false);
  const lastWallet = useRef<string | null>(connectedWallet);
  const cursorInitialized = useRef(false);
  const newestIdRef = useRef<string | null>(null);
  const visible = useBrowserVisible();

  const clearConversation = useCallback(() => {
    setMessages([]);
    setUnreadCount(0);
    setSendFailed(false);
    setPendingAttachments([]);
    setNextCursor(null);
    setLoadingEarlier(false);
    setNewActivity(false);
    cursorInitialized.current = false;
    newestIdRef.current = null;
  }, []);

  const applyApiError = useCallback((err: unknown) => {
    const api = err as ApiError;
    const next = panelStateFromApiError(api.status, api.code);
    if (next) setState(next);
    return api;
  }, []);

  const loadConversation = useCallback(async () => {
    const page = await fetchContractMessages(contractAddress);
    setMessages((current) => {
      const merged = mergeMessagesById(current, page.messages);
      const previousNewest = newestIdRef.current;
      const nextNewest = newestMessageId(merged);
      if (
        detectNewActivityWhileReading({
          followNewest,
          previousNewestId: previousNewest,
          nextNewestId: nextNewest,
        })
      ) {
        setNewActivity(true);
      }
      newestIdRef.current = nextNewest;
      return merged;
    });
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
  }, [contractAddress, followNewest]);

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
      setNewActivity(false);
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

  async function uploadOne(localId: string, file: File) {
    setPendingAttachments((current) =>
      current.map((item) =>
        item.localId === localId
          ? { ...item, status: "uploading", progress: 0, error: null }
          : item
      )
    );
    try {
      const result = await uploadContractAttachment(
        contractAddress,
        file,
        "message",
        (ratio) => {
          setPendingAttachments((current) =>
            current.map((item) =>
              item.localId === localId ? { ...item, progress: ratio } : item
            )
          );
        }
      );
      setPendingAttachments((current) =>
        current.map((item) =>
          item.localId === localId
            ? {
                ...item,
                status: "uploaded",
                progress: 1,
                attachmentId: result.attachment.id,
                error: null,
              }
            : item
        )
      );
    } catch (err) {
      const api = err as ApiError;
      setPendingAttachments((current) =>
        current.map((item) =>
          item.localId === localId
            ? {
                ...item,
                status: "failed",
                error: api.message ?? "Upload failed.",
              }
            : item
        )
      );
    }
  }

  function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MESSAGE_ATTACHMENT_MAX - pendingAttachments.length;
    if (room <= 0) return;
    const additions: PendingComposerAttachment[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      const policy = validateAttachmentFile({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        byteSize: file.size,
      });
      const localId = crypto.randomUUID();
      if (!policy.ok) {
        additions.push({
          localId,
          file,
          displayFilename: file.name || "file",
          byteSize: file.size,
          status: "failed",
          error: policy.error,
        });
        continue;
      }
      additions.push({
        localId,
        file,
        displayFilename: policy.displayFilename,
        byteSize: policy.byteSize,
        status: "selected",
      });
    }
    setPendingAttachments((current) => [...current, ...additions]);
    for (const item of additions) {
      if (item.status === "selected") {
        void uploadOne(item.localId, item.file);
      }
    }
  }

  async function onRemoveAttachment(localId: string) {
    const target = pendingAttachments.find((item) => item.localId === localId);
    setPendingAttachments((current) => current.filter((item) => item.localId !== localId));
    if (target?.attachmentId) {
      try {
        await discardPendingAttachment(contractAddress, target.attachmentId);
      } catch {
        // Best-effort orphan cleanup; send will only bind uploaded ids that remain.
      }
    }
  }

  function onRetryAttachment(localId: string) {
    const target = pendingAttachments.find((item) => item.localId === localId);
    if (!target) return;
    void uploadOne(localId, target.file);
  }

  async function onSend() {
    const parsed = validateMessageBody(draft);
    if (!parsed.ok) return;
    if (pendingAttachments.some((item) => item.status === "uploading")) return;
    if (pendingAttachments.some((item) => item.status === "failed" || item.status === "selected")) {
      return;
    }
    const attachmentIds = pendingAttachments
      .filter((item) => item.status === "uploaded" && item.attachmentId)
      .map((item) => item.attachmentId!);
    setSending(true);
    setSendFailed(false);
    try {
      const result = await sendContractMessage(contractAddress, draft, attachmentIds);
      setFollowNewest(true);
      setNewActivity(false);
      setMessages((current) => {
        const merged = mergeMessagesById(current, [result.message]);
        newestIdRef.current = newestMessageId(merged);
        return merged;
      });
      setDraft("");
      setPendingAttachments([]);
    } catch {
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  }

  async function onLoadEarlier() {
    if (!canRequestEarlierPage({ nextCursor, loadingEarlier })) return;
    setFollowNewest(false);
    setLoadingEarlier(true);
    try {
      const page = await fetchContractMessages(contractAddress, { cursor: nextCursor });
      setMessages((current) => mergeMessagesById(current, page.messages));
      setNextCursor(page.nextCursor);
    } catch (err) {
      applyApiError(err);
    } finally {
      setLoadingEarlier(false);
    }
  }

  function openChat() {
    setFollowNewest(true);
    setNewActivity(false);
    setChatOpen(true);
  }

  function jumpToLatest() {
    setFollowNewest(true);
    setNewActivity(false);
  }

  const composerOpen = shouldShowComposer(state) && participant;
  const attachmentsReady =
    pendingAttachments.length === 0 ||
    pendingAttachments.every((item) => item.status === "uploaded");
  const canSend =
    composerOpen &&
    !sending &&
    validateMessageBody(draft).ok &&
    attachmentsReady &&
    !pendingAttachments.some((item) => item.status === "failed");
  const preview = state === "ready" ? latestMessagePreview(messages) : null;
  const unreadLabel = formatUnreadBadge(unreadCount);
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
              className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl"
            >
              <MessagesSquare size={20} aria-hidden="true" />
              {CONTRACT_MESSAGES_TITLE}
              {unreadLabel ? (
                <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs font-semibold text-ink-soft">
                  {unreadLabel}
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
        connectedLabel={state === "ready" ? MESSAGES_WORKSPACE_CONNECTED : null}
        unreadLabel={unreadLabel}
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
            loadingEarlier={loadingEarlier}
            onLoadEarlier={() => void onLoadEarlier()}
            followNewest={followNewest}
            onFollowNewestChange={setFollowNewest}
            newActivity={newActivity}
            onJumpToLatest={jumpToLatest}
          />
        ) : null}

        {composerOpen ? (
          <ChatComposer
            draft={draft}
            sending={sending}
            sendFailed={sendFailed}
            canSend={canSend}
            attachments={pendingAttachments}
            onDraftChange={setDraft}
            onSend={() => void onSend()}
            onPickFiles={onPickFiles}
            onRemoveAttachment={(localId) => void onRemoveAttachment(localId)}
            onRetryAttachment={onRetryAttachment}
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
