"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Paperclip, Send, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type UIEvent,
} from "react";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import {
  CONTRACT_MESSAGE_MAX_LENGTH,
  CONTRACT_MESSAGES_TARGET_UX,
} from "@/lib/app/contract-messages";
import {
  CHAT_VERIFY_COPY,
  CLOSE_CHAT_LABEL,
  LOAD_EARLIER_LABEL,
  messageBubbleSide,
} from "@/lib/app/messages-chat";
import {
  ATTACHMENTS_COMING_NEXT_LABEL,
  JUMP_TO_LATEST_LABEL,
  LOADING_EARLIER_LABEL,
  NEW_ACTIVITY_LABEL,
  canRequestEarlierPage,
  groupMessagesWithDateSeparators,
  isNearBottom,
  isNearTop,
  messageTimestampLabel,
  preserveScrollAfterPrepend,
  shouldForceScrollOnIncoming,
  shouldShowJumpToLatest,
} from "@/lib/app/messages-history";
import { MESSAGES_PRIVACY_COPY } from "@/lib/app/messages-panel";
import type { PublicContractMessage } from "@/lib/server/messages/pagination";

export function ContractChatDialog({
  open,
  title,
  subtitle,
  contractLabel,
  connectedLabel,
  unreadLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  contractLabel: string;
  connectedLabel?: string | null;
  unreadLabel?: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-4 md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close chat overlay"
            className="absolute inset-0 bg-[rgba(18,24,38,.48)]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-chat-heading"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-line bg-card shadow-[var(--shadow)] sm:h-[min(90vh,56rem)] sm:max-h-[min(90vh,56rem)] sm:w-[min(64rem,96vw)] sm:rounded-[28px] sm:border"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
                    {subtitle}
                  </p>
                  {connectedLabel ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-cyan"
                        aria-hidden="true"
                      />
                      {connectedLabel}
                    </span>
                  ) : null}
                  {unreadLabel ? (
                    <span
                      className="rounded-full bg-paper-2 px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft"
                      aria-live="polite"
                    >
                      {unreadLabel}
                    </span>
                  ) : null}
                </div>
                <h2 id="contract-chat-heading" className="mt-1 font-display text-2xl text-ink">
                  {title}
                </h2>
                <p className="mt-1 truncate text-sm text-ink-soft">{contractLabel}</p>
              </div>
              <Button type="button" variant="ghost" onClick={onClose} aria-label={CLOSE_CHAT_LABEL}>
                <X size={18} />
                <span className="sr-only">{CLOSE_CHAT_LABEL}</span>
              </Button>
            </header>
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ChatHistory({
  messages,
  connectedWallet,
  otherLabel,
  empty,
  nextCursor,
  loadingEarlier,
  onLoadEarlier,
  followNewest,
  onFollowNewestChange,
  newActivity,
  onJumpToLatest,
}: {
  messages: readonly PublicContractMessage[];
  connectedWallet: string | null;
  otherLabel: string;
  empty: string;
  nextCursor: string | null;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  followNewest: boolean;
  onFollowNewestChange: (follow: boolean) => void;
  newActivity: boolean;
  onJumpToLatest: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pendingPrepend = useRef(false);
  const prevScrollMetrics = useRef<{ height: number; top: number } | null>(null);
  const prevMessageCount = useRef(messages.length);
  const items = groupMessagesWithDateSeparators(messages);
  const showJump = shouldShowJumpToLatest({
    followNewest,
    messageCount: messages.length,
  });

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;

    if (pendingPrepend.current && prevScrollMetrics.current) {
      const { height, top } = prevScrollMetrics.current;
      node.scrollTop = preserveScrollAfterPrepend(height, top, node.scrollHeight);
      pendingPrepend.current = false;
      prevScrollMetrics.current = null;
      prevMessageCount.current = messages.length;
      return;
    }

    if (shouldForceScrollOnIncoming(followNewest)) {
      node.scrollTop = node.scrollHeight;
    }
    prevMessageCount.current = messages.length;
  }, [messages, followNewest]);

  const requestEarlier = useCallback(() => {
    if (!canRequestEarlierPage({ nextCursor, loadingEarlier })) return;
    const node = scroller.current;
    if (node) {
      prevScrollMetrics.current = {
        height: node.scrollHeight,
        top: node.scrollTop,
      };
      pendingPrepend.current = true;
    }
    onLoadEarlier();
  }, [loadingEarlier, nextCursor, onLoadEarlier]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    if (isNearBottom(node)) {
      if (!followNewest) onFollowNewestChange(true);
    } else if (followNewest) {
      onFollowNewestChange(false);
    }
    if (isNearTop(node.scrollTop) && canRequestEarlierPage({ nextCursor, loadingEarlier })) {
      requestEarlier();
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
        aria-label="Message history"
        onScroll={onScroll}
      >
        {nextCursor || loadingEarlier ? (
          <div className="mb-4 flex flex-col items-center gap-2">
            {loadingEarlier ? (
              <p className="text-xs text-ink-faint" aria-live="polite">
                {LOADING_EARLIER_LABEL}
              </p>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={requestEarlier}
                aria-label={LOAD_EARLIER_LABEL}
              >
                {LOAD_EARLIER_LABEL}
              </Button>
            )}
          </div>
        ) : null}

        {messages.length === 0 ? (
          <p className="text-sm text-ink-faint">{empty}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {items.map((item) => {
              if (item.kind === "date") {
                return (
                  <li
                    key={`date-${item.key}`}
                    className="flex items-center gap-3 py-1"
                    aria-label={`Messages from ${item.label}`}
                  >
                    <span className="h-px flex-1 bg-line" aria-hidden="true" />
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      {item.label}
                    </span>
                    <span className="h-px flex-1 bg-line" aria-hidden="true" />
                  </li>
                );
              }
              const mine = item.message.senderWallet === connectedWallet;
              return (
                <ChatMessageBubble
                  key={item.message.id}
                  message={item.message}
                  mine={mine}
                  otherLabel={otherLabel}
                />
              );
            })}
          </ol>
        )}
      </div>

      {showJump ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4">
          <Button
            type="button"
            variant="secondary"
            className="pointer-events-auto shadow-[var(--shadow)]"
            onClick={onJumpToLatest}
            aria-label={JUMP_TO_LATEST_LABEL}
          >
            <ArrowDown size={14} aria-hidden="true" />
            {JUMP_TO_LATEST_LABEL}
            {newActivity ? (
              <span className="ml-1 rounded-full bg-cyan/15 px-2 py-0.5 text-[11px] font-semibold text-cyan">
                {NEW_ACTIVITY_LABEL}
              </span>
            ) : null}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ChatMessageBubble({
  message,
  mine,
  otherLabel,
}: {
  message: PublicContractMessage;
  mine: boolean;
  otherLabel: string;
  contextLabel?: string;
  replyToMessageId?: string | null;
}) {
  const side = messageBubbleSide(mine);
  const label = mine ? "You" : otherLabel;
  return (
    <li
      data-side={side}
      className={`flex max-w-[min(100%,36rem)] flex-col ${mine ? "ml-auto items-end" : "mr-auto items-start"}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <div
        className={`mt-1 rounded-2xl px-3.5 py-2.5 text-sm leading-6 text-ink ${
          mine
            ? "rounded-br-md bg-[linear-gradient(135deg,#e7fbf8,#eef4ff)]"
            : "rounded-bl-md bg-paper"
        }`}
      >
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>
      </div>
      <time className="mt-1 text-[11px] text-ink-faint" dateTime={message.createdAt}>
        {messageTimestampLabel(message.createdAt)}
      </time>
    </li>
  );
}

export function ChatComposer({
  draft,
  sending,
  sendFailed,
  canSend,
  onDraftChange,
  onSend,
}: {
  draft: string;
  sending: boolean;
  sendFailed: boolean;
  canSend: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-line bg-card px-4 py-3 sm:px-5">
      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled
          aria-label={ATTACHMENTS_COMING_NEXT_LABEL}
          title={ATTACHMENTS_COMING_NEXT_LABEL}
          className="shrink-0"
        >
          <Paperclip size={18} aria-hidden="true" />
          <span className="sr-only">{ATTACHMENTS_COMING_NEXT_LABEL}</span>
        </Button>
        <Textarea
          value={draft}
          maxLength={CONTRACT_MESSAGE_MAX_LENGTH}
          placeholder={CONTRACT_MESSAGES_TARGET_UX.composerPlaceholder}
          aria-label="Write a message"
          className="max-h-40 min-h-[72px] flex-1 resize-none overflow-y-auto text-base sm:text-sm"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        <Button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send"
          className="shrink-0"
        >
          {sending ? (
            "Sending…"
          ) : (
            <>
              <Send size={16} aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{CONTRACT_MESSAGES_TARGET_UX.send}</span>
            </>
          )}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">
          {draft.trim().length} / {CONTRACT_MESSAGE_MAX_LENGTH}
        </p>
        <p className="text-xs text-ink-faint">{ATTACHMENTS_COMING_NEXT_LABEL}</p>
      </div>
      {sendFailed ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-danger">
          <p>{CONTRACT_MESSAGES_TARGET_UX.failedSend}</p>
          <Button type="button" variant="secondary" onClick={onSend} aria-label="Retry">
            {CONTRACT_MESSAGES_TARGET_UX.retry}
          </Button>
        </div>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-ink-faint">{MESSAGES_PRIVACY_COPY}</p>
    </div>
  );
}

export function ChatVerifyGate({
  disabled,
  verifying,
  error,
  onVerify,
}: {
  disabled: boolean;
  verifying: boolean;
  error: string | null;
  onVerify: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-5 py-8">
      <p className="text-base font-medium text-ink">{CHAT_VERIFY_COPY.headline}</p>
      <p className="text-sm leading-6 text-ink-soft">{CHAT_VERIFY_COPY.detail}</p>
      <div>
        <Button type="button" onClick={onVerify} disabled={disabled || verifying} aria-label="Verify wallet">
          Verify wallet
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
