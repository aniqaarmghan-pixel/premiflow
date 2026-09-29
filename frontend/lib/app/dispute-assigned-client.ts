/**
 * Resolver "New dispute assigned" inbox notification: shared dedupe key and a
 * best-effort client trigger. The server re-reads confirmed chain facts
 * (status Disputed, resolver, disputed_at) and inserts idempotently on the
 * deterministic key, so retries or repeated page loads never create a second
 * row and read/unread state is preserved.
 */
export const DISPUTE_ASSIGNED_NOTIFICATION = {
  title: "New dispute assigned",
  body: "A contract assigned to you requires review.",
} as const;

export function disputeAssignedUniqueKey(
  contractAddress: string,
  disputedAt: number,
  resolverWallet: string
): string {
  return `dispute_assigned:${contractAddress}:${disputedAt}:${resolverWallet}`;
}

export function disputeAssignedNotificationPath(address: string): string {
  return `/api/contracts/${address}/dispute-assigned-notification`;
}

const syncedThisPage = new Set<string>();

/** True the first time a key is seen in this page session. */
export function markDisputeAssignedSync(
  key: string,
  seen: Set<string> = syncedThisPage
): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

export async function requestDisputeAssignedNotification(
  address: string,
  options: { fetchImpl?: typeof fetch; retries?: number; delayMs?: number } = {}
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retries = options.retries ?? 2;
  const delayMs = options.delayMs ?? 1500;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchImpl(disputeAssignedNotificationPath(address), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (res.ok) return true;
      // 409: the RPC node has not caught up with the confirmed dispute yet.
      if (res.status !== 409) return false;
    } catch {
      return false;
    }
    if (attempt < retries && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}
