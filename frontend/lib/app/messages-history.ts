import type { PublicContractMessage } from "@/lib/server/messages/pagination";

export const SCROLL_TOP_LOAD_THRESHOLD_PX = 72;
export const SCROLL_BOTTOM_FOLLOW_THRESHOLD_PX = 96;
export const LOADING_EARLIER_LABEL = "Loading earlier messages…";
export const JUMP_TO_LATEST_LABEL = "Jump to latest";
export const NEW_ACTIVITY_LABEL = "New messages";
export const ATTACHMENTS_ENABLED_LABEL = "Attach files";
export const ATTACHMENTS_HINT =
  "PDF, images, Office docs, ZIP, CSV, or text — max 5 files, 10 MiB each.";

/** @deprecated Block 3C enables attachments; kept only for migration-era string searches. */
export const ATTACHMENTS_COMING_NEXT_LABEL = ATTACHMENTS_ENABLED_LABEL;

export type MessageHistoryItem =
  | { kind: "date"; key: string; label: string }
  | { kind: "message"; message: PublicContractMessage };

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function localDayKey(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local calendar label: Today / Yesterday / long date. */
export function formatMessageDateSeparator(
  iso: string,
  now: Date = new Date()
): string {
  const date = new Date(iso);
  const day = startOfLocalDay(date);
  const today = startOfLocalDay(now);
  const dayMs = 86_400_000;
  if (day === today) return "Today";
  if (day === today - dayMs) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Insert one date separator per local calendar day, never per message. */
export function groupMessagesWithDateSeparators(
  messages: readonly PublicContractMessage[],
  now: Date = new Date()
): MessageHistoryItem[] {
  const items: MessageHistoryItem[] = [];
  let lastKey: string | null = null;
  for (const message of messages) {
    const key = localDayKey(message.createdAt);
    if (key !== lastKey) {
      items.push({
        kind: "date",
        key,
        label: formatMessageDateSeparator(message.createdAt, now),
      });
      lastKey = key;
    }
    items.push({ kind: "message", message });
  }
  return items;
}

export function isNearTop(
  scrollTop: number,
  thresholdPx: number = SCROLL_TOP_LOAD_THRESHOLD_PX
): boolean {
  return scrollTop <= thresholdPx;
}

export function isNearBottom(
  el: { scrollTop: number; scrollHeight: number; clientHeight: number },
  thresholdPx: number = SCROLL_BOTTOM_FOLLOW_THRESHOLD_PX
): boolean {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distance <= thresholdPx;
}

export function canRequestEarlierPage(input: {
  nextCursor: string | null;
  loadingEarlier: boolean;
}): boolean {
  return Boolean(input.nextCursor) && !input.loadingEarlier;
}

/** Keep the same messages in view after older rows are prepended. */
export function preserveScrollAfterPrepend(
  previousScrollHeight: number,
  previousScrollTop: number,
  nextScrollHeight: number
): number {
  const delta = nextScrollHeight - previousScrollHeight;
  return Math.max(0, previousScrollTop + delta);
}

export function shouldShowJumpToLatest(input: {
  followNewest: boolean;
  messageCount: number;
}): boolean {
  return input.messageCount > 0 && !input.followNewest;
}

export function shouldForceScrollOnIncoming(followNewest: boolean): boolean {
  return followNewest;
}

export function detectNewActivityWhileReading(input: {
  followNewest: boolean;
  previousNewestId: string | null;
  nextNewestId: string | null;
}): boolean {
  if (input.followNewest) return false;
  if (!input.previousNewestId || !input.nextNewestId) return false;
  return input.previousNewestId !== input.nextNewestId;
}

export function newestMessageId(
  messages: readonly Pick<PublicContractMessage, "id">[]
): string | null {
  if (messages.length === 0) return null;
  return messages[messages.length - 1].id;
}

/** Compact unread presentation. No per-message receipts. */
export function formatUnreadBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const n = Math.floor(count);
  return n === 1 ? "1 unread" : `${n} unread`;
}

export function messageTimestampLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
