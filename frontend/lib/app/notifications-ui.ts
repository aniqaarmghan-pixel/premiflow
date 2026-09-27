import type { PublicNotification } from "@/lib/server/notifications/pagination";
import type { NotificationKind } from "@/lib/server/notifications/kinds";

/**
 * Visible-tab unread badge poll interval (N5.1 intelligent polling).
 * Full notification lists are not polled on this timer — only unread count.
 */
export const NOTIFICATIONS_BADGE_POLL_MS = 15_000;

export const NOTIFICATIONS_PAGE_LIMIT = 20;

export const NOTIFICATIONS_EMPTY_COPY = "No notifications yet";

export const NOTIFICATIONS_SESSION_COPY =
  "Verify your wallet to see notifications.";

export type NotificationListItem = PublicNotification;

export type NotificationsUiStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unauthenticated"
  | "error";

/**
 * Badge label for the bell.
 * - unread unknown / still loading → null (never flash a fake 0)
 * - 0 → null (no badge)
 * - 1–99 → exact count
 * - >99 → "99+"
 */
export function formatUnreadBadge(
  unreadCount: number | null,
  options: { countLoaded: boolean } = { countLoaded: true }
): string | null {
  if (!options.countLoaded || unreadCount == null) return null;
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) return null;
  if (unreadCount > 99) return "99+";
  return String(Math.floor(unreadCount));
}

export function isNotificationUnread(item: Pick<NotificationListItem, "readAt">): boolean {
  return item.readAt == null;
}

export function shouldPollNotificationBadge(input: {
  visible: boolean;
  hasSession: boolean;
}): boolean {
  return input.visible && input.hasSession;
}

/** True when the tab transitions from hidden → visible (immediate unread refresh). */
export function shouldRefreshUnreadOnVisibility(input: {
  wasVisible: boolean;
  isVisible: boolean;
}): boolean {
  return !input.wasVisible && input.isVisible;
}

/**
 * Accept an unread-count response only when it still matches the active
 * request generation and session wallet (stale / cross-session guard).
 */
export function shouldAcceptUnreadCountResponse(input: {
  requestGeneration: number;
  currentGeneration: number;
  requestSessionWallet: string | null;
  currentSessionWallet: string | null;
}): boolean {
  if (input.requestGeneration !== input.currentGeneration) return false;
  if (!input.requestSessionWallet || !input.currentSessionWallet) return false;
  return input.requestSessionWallet === input.currentSessionWallet;
}

export function bumpUnreadRequestGeneration(current: number): number {
  return current + 1;
}

/**
 * Single-flight unread refresh: start a new request, or queue one follow-up
 * while in flight. Skip when there is no authenticated session.
 */
export function decideUnreadRefresh(input: {
  hasSession: boolean;
  inFlight: boolean;
}): "start" | "queue" | "skip" {
  if (!input.hasSession) return "skip";
  if (input.inFlight) return "queue";
  return "start";
}

export function shouldClearNotificationsOnSessionChange(input: {
  previousSessionWallet: string | null;
  nextSessionWallet: string | null;
}): boolean {
  return input.previousSessionWallet !== input.nextSessionWallet;
}

export function mergeNotificationPages(
  existing: NotificationListItem[],
  incoming: NotificationListItem[],
  mode: "replace" | "append"
): NotificationListItem[] {
  if (mode === "replace") return [...incoming];
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function applyMarkOneLocal(
  items: NotificationListItem[],
  id: string,
  readAtIso: string
): { items: NotificationListItem[]; becameRead: boolean } {
  let becameRead = false;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    if (item.readAt == null) becameRead = true;
    return { ...item, readAt: item.readAt ?? readAtIso };
  });
  return { items: next, becameRead };
}

export function decrementUnreadCount(unreadCount: number | null, becameRead: boolean): number {
  const base = unreadCount ?? 0;
  if (!becameRead) return base;
  return Math.max(0, base - 1);
}

export function applyMarkAllLocal(
  items: NotificationListItem[],
  readAtIso: string
): { items: NotificationListItem[]; unreadCount: number } {
  return {
    items: items.map((item) => ({
      ...item,
      readAt: item.readAt ?? readAtIso,
    })),
    unreadCount: 0,
  };
}

export function notificationHrefPath(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  return trimmed;
}

/** Same-tab signal so chat opens even when Next soft-nav keeps ContractMessages mounted. */
export const OPEN_CONTRACT_CHAT_EVENT = "premiflow:open-contract-chat";

export const OPEN_CONTRACT_CHAT_STORAGE_KEY = "premiflow.openContractChat";

export function shouldOpenChatFromSearch(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  try {
    return new URLSearchParams(raw).get("chat") === "1";
  } catch {
    return false;
  }
}

export function contractAddressFromContractsHref(href: string): string | null {
  const path = (href.split("?")[0] ?? "").trim();
  const match = path.match(/^\/contracts\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
  return match?.[1] ?? null;
}

export function resolveNotificationClickNavigation(input: {
  href: string | null | undefined;
}): {
  path: string | null;
  shouldOpenChat: boolean;
  contractAddress: string | null;
} {
  const path = notificationHrefPath(input.href);
  if (!path) {
    return { path: null, shouldOpenChat: false, contractAddress: null };
  }
  const contractAddress = contractAddressFromContractsHref(path);
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  return {
    path,
    shouldOpenChat: shouldOpenChatFromSearch(query),
    contractAddress,
  };
}

export function armOpenContractChat(contractAddress: string): void {
  try {
    sessionStorage.setItem(OPEN_CONTRACT_CHAT_STORAGE_KEY, contractAddress);
  } catch {
    // private mode / unavailable storage
  }
}

export function consumeOpenContractChat(contractAddress: string): boolean {
  try {
    if (sessionStorage.getItem(OPEN_CONTRACT_CHAT_STORAGE_KEY) !== contractAddress) {
      return false;
    }
    sessionStorage.removeItem(OPEN_CONTRACT_CHAT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function signalOpenContractChat(contractAddress: string | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPEN_CONTRACT_CHAT_EVENT, {
      detail: { contractAddress },
    })
  );
}

export function formatNotificationTime(
  iso: string,
  nowMs = Date.now()
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const deltaSec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (deltaSec < 45) return "Just now";
  if (deltaSec < 3600) {
    const mins = Math.max(1, Math.floor(deltaSec / 60));
    return `${mins}m ago`;
  }
  if (deltaSec < 86_400) {
    const hours = Math.max(1, Math.floor(deltaSec / 3600));
    return `${hours}h ago`;
  }
  if (deltaSec < 86_400 * 7) {
    const days = Math.max(1, Math.floor(deltaSec / 86_400));
    return `${days}d ago`;
  }
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const TYPE_LABELS: Partial<Record<NotificationKind, string>> = {
  message_received: "Message",
  contract_offer_received: "Offer",
  offer_accepted: "Accepted",
  offer_declined: "Declined",
  awaiting_activation: "Activation",
  contract_activated: "Activated",
  work_submitted: "Work",
  revision_requested: "Revision",
  revised_work_submitted: "Revision",
  work_approved: "Approved",
  payment_released: "Payment",
  payment_withdrawn: "Withdrawn",
  contract_cancelled: "Cancelled",
  dispute_opened: "Dispute",
  dispute_resolved: "Dispute",
  deadline_warning: "Deadline",
};

export function notificationTypeLabel(type: string): string {
  return TYPE_LABELS[type as NotificationKind] ?? "Update";
}

export function ariaLabelForBell(badge: string | null): string {
  if (!badge) return "Notifications";
  if (badge === "99+") return "Notifications, 99 or more unread";
  const n = Number(badge);
  if (n === 1) return "Notifications, 1 unread";
  return `Notifications, ${badge} unread`;
}
