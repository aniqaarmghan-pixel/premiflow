import type { ContractStatus } from "@/lib/streampay-v2/types";

export type OutcomeNotificationKind = "contract_ended" | "settlement_recorded";

/** Which confirmed-outcome notification (if any) an on-chain status implies. */
export function outcomeNotificationKindForStatus(
  status: ContractStatus
): OutcomeNotificationKind | null {
  if (status === "Resolved") return "settlement_recorded";
  if (status === "Completed" || status === "Cancelled") return "contract_ended";
  return null;
}

export function outcomeSyncKey(
  address: string,
  kind: OutcomeNotificationKind,
  wallet: string
): string {
  return `${kind}:${address}:${wallet}`;
}

const seenThisPage = new Set<string>();

/** True the first time a key is seen in this page load (client-side throttle). */
export function markOutcomeSync(key: string, seen: Set<string> = seenThisPage): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

/** Best effort; the server re-reads chain facts and dedupes per recipient. */
export async function requestContractOutcomeNotification(
  address: string,
  kind: OutcomeNotificationKind,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  try {
    const res = await fetchImpl(`/api/contracts/${address}/outcome-notification`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
