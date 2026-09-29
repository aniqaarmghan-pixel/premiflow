import { contractAddressFromContractsHref } from "@/lib/app/notifications-ui";

/** How often the /contracts list refreshes unread message dots. */
export const UNREAD_MESSAGES_REFRESH_MS = 60_000;

export type UnreadMessageSource = {
  type: string;
  readAt?: unknown;
  contractAddress?: string | null;
  href?: string | null;
};

/**
 * Unread `message_received` notifications grouped by contract address. Uses the
 * notification's contractAddress, falling back to its /contracts/<address> href.
 */
export function unreadMessageCountsByContract(
  items: ReadonlyArray<UnreadMessageSource>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.type !== "message_received" || item.readAt) continue;
    const address =
      item.contractAddress || (item.href ? contractAddressFromContractsHref(item.href) : null);
    if (!address) continue;
    counts[address] = (counts[address] ?? 0) + 1;
  }
  return counts;
}

export function unreadMessageBadgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export function unreadMessageAriaLabel(count: number): string {
  return `${count} unread message${count === 1 ? "" : "s"}`;
}
