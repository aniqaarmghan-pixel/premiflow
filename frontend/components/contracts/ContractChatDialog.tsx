"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

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
import { MESSAGES_PRIVACY_COPY } from "@/lib/app/messages-panel";
import type { PublicContractMessage } from "@/lib/server/messages/pagination";

export function ContractChatDialog({
  open,
  title,
  subtitle,
  contractLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  contractLabel: string;
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
          className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-6"
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
            className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-line bg-card shadow-[var(--shadow)] sm:h-[80vh] sm:max-h-[80vh] sm:w-[min(52rem,92vw)] sm:rounded-[28px] sm:border"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  {subtitle}
                </p>
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
  onLoadEarlier,
  followNewest,
}: {
  messages: readonly PublicContractMessage[];
  connectedWallet: string | null;
  otherLabel: string;
  empty: string;
  nextCursor: string | null;
  onLoadEarlier: () => void;
  followNewest: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !followNewest) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, followNewest]);

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
      aria-label="Message history"
    >
      {nextCursor ? (
        <div className="mb-4 flex justify-center">
          <Button type="button" variant="secondary" onClick={onLoadEarlier} aria-label={LOAD_EARLIER_LABEL}>
            {LOAD_EARLIER_LABEL}
          </Button>
        </div>
      ) : null}
      {messages.length === 0 ? (
        <p className="text-sm text-ink-faint">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {messages.map((message) => {
            const mine = message.senderWallet === connectedWallet;
            return (
              <ChatMessageBubble
                key={message.id}
                message={message}
                mine={mine}
                otherLabel={otherLabel}
              />
            );
          })}
        </ol>
      )}
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
      className={`flex max-w-[min(100%,32rem)] flex-col ${mine ? "ml-auto items-end" : "mr-auto items-start"}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <div
        className={`mt-1 rounded-2xl px-3 py-2 text-sm leading-6 text-ink ${
          mine
            ? "rounded-br-md bg-[linear-gradient(135deg,#e7fbf8,#eef4ff)]"
            : "rounded-bl-md bg-paper"
        }`}
      >
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>
      </div>
      <time className="mt-1 text-xs text-ink-faint" dateTime={message.createdAt}>
        {new Date(message.createdAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
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
      <Textarea
        value={draft}
        maxLength={CONTRACT_MESSAGE_MAX_LENGTH}
        placeholder={CONTRACT_MESSAGES_TARGET_UX.composerPlaceholder}
        aria-label="Write a message"
        className="min-h-[72px] resize-none text-base sm:text-sm"
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">
          {draft.trim().length} / {CONTRACT_MESSAGE_MAX_LENGTH}
        </p>
        <Button type="button" onClick={onSend} disabled={!canSend} aria-label="Send">
          {sending ? "Sending…" : CONTRACT_MESSAGES_TARGET_UX.send}
        </Button>
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
