/**
 * Client trigger for offer lifecycle notifications. Called only after a
 * confirmed accept / activation transaction, never on page load. The server
 * re-verifies on-chain state and dedupes, so this is safe to retry.
 */
export type OfferLifecycleNotificationKind =
  | "contract_offer_received"
  | "offer_accepted"
  | "contract_activated";

export function lifecycleNotificationForAction(
  action: string
): OfferLifecycleNotificationKind | null {
  switch (action) {
    case "acceptContract":
      return "offer_accepted";
    case "approveActivation":
    case "approveTrialAndActivate":
      return "contract_activated";
    default:
      return null;
  }
}

export function lifecycleNotificationPath(address: string): string {
  return `/api/contracts/${address}/lifecycle-notifications`;
}

export async function requestOfferLifecycleNotification(
  address: string,
  kind: OfferLifecycleNotificationKind,
  options: { fetchImpl?: typeof fetch; retries?: number; delayMs?: number } = {}
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retries = options.retries ?? 2;
  const delayMs = options.delayMs ?? 1500;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchImpl(lifecycleNotificationPath(address), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (res.ok) return true;
      // 409: the RPC node has not caught up with the confirmed transaction yet.
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
