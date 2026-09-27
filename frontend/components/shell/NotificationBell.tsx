"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  FileCheck2,
  Handshake,
  LoaderCircle,
  MessageSquare,
  Scale,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { fetchSession } from "@/lib/app/messages-client";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  isNotificationsAuthError,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/app/notifications-client";
import {
  NOTIFICATIONS_BADGE_POLL_MS,
  NOTIFICATIONS_EMPTY_COPY,
  NOTIFICATIONS_PAGE_LIMIT,
  NOTIFICATIONS_SESSION_COPY,
  applyMarkAllLocal,
  applyMarkOneLocal,
  ariaLabelForBell,
  armOpenContractChat,
  bumpUnreadRequestGeneration,
  decideUnreadRefresh,
  decrementUnreadCount,
  formatNotificationTime,
  formatUnreadBadge,
  isNotificationUnread,
  mergeNotificationPages,
  notificationTypeLabel,
  resolveNotificationClickNavigation,
  shouldAcceptUnreadCountResponse,
  shouldClearNotificationsOnSessionChange,
  shouldPollNotificationBadge,
  shouldRefreshUnreadOnVisibility,
  signalOpenContractChat,
  type NotificationListItem,
  type NotificationsUiStatus,
} from "@/lib/app/notifications-ui";
import { sessionMatchesConnectedWallet } from "@/lib/app/messages-panel";

function TypeIcon({ type }: { type: string }) {
  const className = "size-3.5 shrink-0 opacity-80";
  switch (type) {
    case "message_received":
      return <MessageSquare className={className} aria-hidden />;
    case "contract_offer_received":
    case "offer_accepted":
    case "offer_declined":
    case "awaiting_activation":
    case "contract_activated":
    case "contract_cancelled":
      return <Handshake className={className} aria-hidden />;
    case "work_submitted":
    case "revision_requested":
    case "revised_work_submitted":
    case "work_approved":
      return <FileCheck2 className={className} aria-hidden />;
    case "payment_released":
    case "payment_withdrawn":
      return <Wallet className={className} aria-hidden />;
    case "dispute_opened":
    case "dispute_resolved":
      return <Scale className={className} aria-hidden />;
    case "deadline_warning":
      return <CircleAlert className={className} aria-hidden />;
    default:
      return <Bell className={className} aria-hidden />;
  }
}

/**
 * Persistent notification bell + panel (N2 + N5.1 intelligent polling).
 * Unread badge: 15s visible-tab poll, immediate refresh on focus/visibility,
 * single-flight + generation guards. List loads on bell open only (no push stream).
 */
export function NotificationBell() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const connectedWallet = publicKey?.toBase58() ?? null;

  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const markingRef = useRef<Set<string>>(new Set());
  const markAllInFlight = useRef(false);
  const sessionWalletRef = useRef<string | null>(null);
  const connectedWalletRef = useRef<string | null>(connectedWallet);
  const unreadGenerationRef = useRef(0);
  const unreadInFlightRef = useRef(false);
  const unreadQueuedRef = useRef(false);
  const wasVisibleRef = useRef(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );
  const [sessionWallet, setSessionWallet] = useState<string | null>(null);
  const [status, setStatus] = useState<NotificationsUiStatus>("idle");
  const [countLoaded, setCountLoaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [items, setItems] = useState<NotificationListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  connectedWalletRef.current = connectedWallet;

  const hasSession = Boolean(
    sessionWallet &&
      connectedWallet &&
      sessionMatchesConnectedWallet(sessionWallet, connectedWallet)
  );

  const badge = formatUnreadBadge(unreadCount, { countLoaded });
  const ariaLabel = ariaLabelForBell(badge);

  const invalidateUnreadRequests = useCallback(() => {
    unreadGenerationRef.current = bumpUnreadRequestGeneration(
      unreadGenerationRef.current
    );
    unreadQueuedRef.current = false;
  }, []);

  const resetInbox = useCallback(() => {
    invalidateUnreadRequests();
    setItems([]);
    setNextCursor(null);
    setListLoaded(false);
    setUnreadCount(null);
    setCountLoaded(false);
    setStatus("idle");
    setErrorMessage(null);
  }, [invalidateUnreadRequests]);

  /** Session bootstrap only — not on every unread poll tick (N5.1). */
  const refreshSession = useCallback(async () => {
    if (!connectedWallet) {
      sessionWalletRef.current = null;
      setSessionWallet(null);
      resetInbox();
      return null;
    }
    try {
      const me = await fetchSession();
      if (!sessionMatchesConnectedWallet(me.wallet, connectedWallet)) {
        if (
          shouldClearNotificationsOnSessionChange({
            previousSessionWallet: sessionWalletRef.current,
            nextSessionWallet: null,
          })
        ) {
          resetInbox();
        }
        sessionWalletRef.current = null;
        setSessionWallet(null);
        setStatus("unauthenticated");
        setCountLoaded(true);
        setUnreadCount(0);
        return null;
      }
      if (
        shouldClearNotificationsOnSessionChange({
          previousSessionWallet: sessionWalletRef.current,
          nextSessionWallet: me.wallet,
        })
      ) {
        resetInbox();
      }
      sessionWalletRef.current = me.wallet;
      setSessionWallet(me.wallet);
      return me.wallet;
    } catch (err) {
      if (isNotificationsAuthError(err)) {
        if (
          shouldClearNotificationsOnSessionChange({
            previousSessionWallet: sessionWalletRef.current,
            nextSessionWallet: null,
          })
        ) {
          resetInbox();
        }
        sessionWalletRef.current = null;
        setSessionWallet(null);
        setStatus("unauthenticated");
        setCountLoaded(true);
        setUnreadCount(0);
        return null;
      }
      setStatus("error");
      setCountLoaded(true);
      return sessionWalletRef.current;
    }
  }, [connectedWallet, resetInbox]);

  /**
   * Unread-count only. Uses known session identity — does not call /api/auth/me.
   * Single-flight + generation guards prevent overlap and stale overwrites.
   */
  const refreshUnreadCount = useCallback(async () => {
    const session = sessionWalletRef.current;
    const connected = connectedWalletRef.current;
    const hasAuth =
      Boolean(session) &&
      Boolean(connected) &&
      sessionMatchesConnectedWallet(session, connected);

    const decision = decideUnreadRefresh({
      hasSession: hasAuth,
      inFlight: unreadInFlightRef.current,
    });
    if (decision === "skip") return;
    if (decision === "queue") {
      unreadQueuedRef.current = true;
      return;
    }

    unreadInFlightRef.current = true;
    const requestGeneration = unreadGenerationRef.current;
    const requestSessionWallet = session;

    try {
      const result = await fetchUnreadNotificationCount();
      if (
        !shouldAcceptUnreadCountResponse({
          requestGeneration,
          currentGeneration: unreadGenerationRef.current,
          requestSessionWallet,
          currentSessionWallet: sessionWalletRef.current,
        })
      ) {
        return;
      }
      if (
        !sessionMatchesConnectedWallet(
          sessionWalletRef.current,
          connectedWalletRef.current
        )
      ) {
        return;
      }
      setUnreadCount(result.unreadCount);
      setCountLoaded(true);
      setStatus("ready");
      setErrorMessage(null);
    } catch (err) {
      if (
        !shouldAcceptUnreadCountResponse({
          requestGeneration,
          currentGeneration: unreadGenerationRef.current,
          requestSessionWallet,
          currentSessionWallet: sessionWalletRef.current,
        })
      ) {
        return;
      }
      if (isNotificationsAuthError(err)) {
        invalidateUnreadRequests();
        sessionWalletRef.current = null;
        setSessionWallet(null);
        setStatus("unauthenticated");
        setUnreadCount(0);
        setCountLoaded(true);
        setItems([]);
        setListLoaded(false);
        return;
      }
      // Non-fatal: keep existing badge/list; later polls may recover.
      setStatus((current) => (current === "unauthenticated" ? current : "error"));
      setCountLoaded(true);
    } finally {
      unreadInFlightRef.current = false;
      if (unreadQueuedRef.current) {
        unreadQueuedRef.current = false;
        void refreshUnreadCount();
      }
    }
  }, [invalidateUnreadRequests]);

  const loadList = useCallback(
    async (mode: "replace" | "append") => {
      if (!hasSession) {
        setStatus("unauthenticated");
        setListLoaded(true);
        return;
      }
      if (mode === "append") {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
      } else {
        setListLoading(true);
      }
      try {
        const page = await fetchNotifications({
          cursor: mode === "append" ? nextCursor : null,
          limit: NOTIFICATIONS_PAGE_LIMIT,
        });
        setItems((current) => mergeNotificationPages(current, page.notifications, mode));
        setNextCursor(page.nextCursor);
        setListLoaded(true);
        setStatus("ready");
        setErrorMessage(null);
      } catch (err) {
        if (isNotificationsAuthError(err)) {
          invalidateUnreadRequests();
          sessionWalletRef.current = null;
          setSessionWallet(null);
          setStatus("unauthenticated");
          setItems([]);
          setUnreadCount(0);
          setCountLoaded(true);
          setListLoaded(true);
          return;
        }
        setStatus("error");
        setErrorMessage("Notifications could not be loaded.");
        setListLoaded(true);
      } finally {
        setListLoading(false);
        setLoadingMore(false);
      }
    },
    [hasSession, invalidateUnreadRequests, loadingMore, nextCursor]
  );

  // Visibility: pause when hidden; immediate unread refresh on hidden → visible.
  useEffect(() => {
    wasVisibleRef.current =
      typeof document !== "undefined"
        ? document.visibilityState === "visible"
        : true;
    setVisible(wasVisibleRef.current);

    function onVisibility() {
      const isVisible = document.visibilityState === "visible";
      const wasVisible = wasVisibleRef.current;
      wasVisibleRef.current = isVisible;
      setVisible(isVisible);
      if (shouldRefreshUnreadOnVisibility({ wasVisible, isVisible })) {
        void refreshUnreadCount();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      invalidateUnreadRequests();
    };
  }, [invalidateUnreadRequests, refreshUnreadCount]);

  // Wallet change: bootstrap session once, then immediate unread fetch.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wallet = await refreshSession();
      if (cancelled) return;
      if (wallet) {
        void refreshUnreadCount();
      }
    })();
    return () => {
      cancelled = true;
      invalidateUnreadRequests();
    };
  }, [connectedWallet, invalidateUnreadRequests, refreshSession, refreshUnreadCount]);

  // Periodic unread poll while visible + authenticated (list is NOT polled).
  useEffect(() => {
    if (!shouldPollNotificationBadge({ visible, hasSession })) return;
    const timer = window.setInterval(() => {
      void refreshUnreadCount();
    }, NOTIFICATIONS_BADGE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [visible, hasSession, refreshUnreadCount]);

  // Bell open: list replace + unread sync (single-flight unread).
  useEffect(() => {
    if (!open) return;
    void loadList("replace");
    void refreshUnreadCount();
  }, [open, sessionWallet, connectedWallet]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: reload when panel opens / session identity changes

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onMarkOne(item: NotificationListItem) {
    const nav = resolveNotificationClickNavigation({ href: item.href });
    if (markingRef.current.has(item.id)) {
      if (nav.path) {
        setOpen(false);
        if (nav.shouldOpenChat && nav.contractAddress) {
          armOpenContractChat(nav.contractAddress);
        }
        router.push(nav.path);
        if (nav.shouldOpenChat) {
          queueMicrotask(() => signalOpenContractChat(nav.contractAddress));
        }
      }
      return;
    }
    markingRef.current.add(item.id);
    try {
      if (isNotificationUnread(item) && hasSession) {
        // Invalidate any in-flight unread so it cannot restore a stale badge.
        invalidateUnreadRequests();
        const result = await markNotificationRead(item.id);
        const readAt = result.notification.readAt ?? new Date().toISOString();
        setItems((current) => {
          const applied = applyMarkOneLocal(current, item.id, readAt);
          if (applied.becameRead) {
            setUnreadCount((count) => decrementUnreadCount(count, true));
          }
          return applied.items;
        });
        void refreshUnreadCount();
      }
    } catch (err) {
      if (isNotificationsAuthError(err)) {
        invalidateUnreadRequests();
        setStatus("unauthenticated");
        setUnreadCount(0);
        setItems([]);
      }
    } finally {
      markingRef.current.delete(item.id);
    }
    if (nav.path) {
      setOpen(false);
      if (nav.shouldOpenChat && nav.contractAddress) {
        armOpenContractChat(nav.contractAddress);
      }
      router.push(nav.path);
      if (nav.shouldOpenChat) {
        queueMicrotask(() => signalOpenContractChat(nav.contractAddress));
      }
    }
  }

  async function onMarkAll() {
    if (!hasSession || !unreadCount || markAllInFlight.current) return;
    markAllInFlight.current = true;
    try {
      invalidateUnreadRequests();
      await markAllNotificationsRead();
      setItems((current) => {
        const applied = applyMarkAllLocal(current, new Date().toISOString());
        setUnreadCount(0);
        return applied.items;
      });
      void refreshUnreadCount();
    } catch (err) {
      if (isNotificationsAuthError(err)) {
        invalidateUnreadRequests();
        setStatus("unauthenticated");
        setUnreadCount(0);
        setItems([]);
      }
    } finally {
      markAllInFlight.current = false;
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={ariaLabel}
        className="relative inline-flex size-11 items-center justify-center rounded-full border border-line bg-card text-ink hover:border-cyan/40 sm:size-9"
      >
        <Bell size={16} aria-hidden />
        {badge ? (
          <span
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-navy px-1 text-[10px] font-bold leading-4 text-cyan"
            aria-hidden
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 flex max-h-[min(28rem,70vh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)] sm:w-[22rem]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                Notifications
              </p>
              {hasSession && countLoaded && unreadCount != null && unreadCount > 0 ? (
                <p className="mt-0.5 text-xs text-ink-soft">
                  {unreadCount > 99 ? "99+" : unreadCount} unread
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={!hasSession || !unreadCount}
              onClick={() => void onMarkAll()}
              className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-cyan disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck size={14} aria-hidden />
              Mark all as read
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {!connectedWallet ? (
              <p className="px-3 py-8 text-center text-sm text-ink-soft">
                Connect a wallet to use notifications.
              </p>
            ) : status === "unauthenticated" || !hasSession ? (
              <p className="px-3 py-8 text-center text-sm text-ink-soft">
                {NOTIFICATIONS_SESSION_COPY}
              </p>
            ) : listLoading && !listLoaded ? (
              <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-ink-faint">
                <LoaderCircle size={16} className="animate-spin" aria-hidden />
                Loading…
              </div>
            ) : errorMessage ? (
              <p className="px-3 py-8 text-center text-sm text-ink-soft">{errorMessage}</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-ink-soft">
                {NOTIFICATIONS_EMPTY_COPY}
              </p>
            ) : (
              <ul className="space-y-1">
                {items.map((item) => {
                  const unread = isNotificationUnread(item);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void onMarkOne(item)}
                        className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition hover:bg-paper-2 ${
                          unread ? "bg-cyan/[0.06]" : ""
                        }`}
                      >
                        <span
                          className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full ${
                            unread
                              ? "bg-cyan/15 text-cyan"
                              : "bg-paper-2 text-ink-faint"
                          }`}
                        >
                          <TypeIcon type={item.type} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span
                              className={`text-sm leading-5 ${
                                unread ? "font-semibold text-ink" : "font-medium text-ink"
                              }`}
                            >
                              {item.title}
                            </span>
                            {unread ? (
                              <span
                                className="mt-1 size-1.5 shrink-0 rounded-full bg-cyan"
                                aria-label="Unread"
                              />
                            ) : null}
                          </span>
                          <span className="mt-0.5 line-clamp-2 text-xs leading-4 text-ink-soft">
                            {item.body}
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint">
                            <span>{notificationTypeLabel(item.type)}</span>
                            <span aria-hidden>·</span>
                            <time dateTime={item.createdAt}>
                              {formatNotificationTime(item.createdAt)}
                            </time>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {hasSession && nextCursor ? (
            <div className="border-t border-line p-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadList("append")}
                className="flex min-h-10 w-full items-center justify-center rounded-xl text-xs font-semibold text-cyan hover:bg-paper-2 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
