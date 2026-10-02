import { isRealSignature } from "@/lib/app/resolve-signature-store";

/** Subset of web3.js ConfirmedSignatureInfo used for resolver activity. */
export type SignatureInfoLike = {
  signature: string;
  slot: number;
  err: unknown;
  blockTime?: number | null;
};

export type ResolverTxItem = {
  signature: string;
  contract: string;
  blockTime: number | null;
  timeLabel: string;
  failed: boolean;
  explorerHref: string;
  contractHref: string;
};

export const RESOLVER_TX_HISTORY_PER_CONTRACT = 10;
export const RESOLVER_TX_HISTORY_MAX_CONTRACTS = 12;
export const RESOLVER_TX_HISTORY_LIMIT = 30;

/**
 * Real on-chain signatures for the resolver's assigned contract accounts.
 * Deduplicated, newest first, only well-formed signatures (no invented links).
 */
export function mergeResolverTxHistory(
  perContract: readonly { contract: string; signatures: readonly SignatureInfoLike[] }[],
  explorer: (signature: string) => string,
  limit: number = RESOLVER_TX_HISTORY_LIMIT
): ResolverTxItem[] {
  const seen = new Set<string>();
  const rows: (ResolverTxItem & { slot: number })[] = [];
  for (const { contract, signatures } of perContract) {
    for (const info of signatures) {
      if (!isRealSignature(info.signature) || seen.has(info.signature)) continue;
      seen.add(info.signature);
      const blockTime = typeof info.blockTime === "number" ? info.blockTime : null;
      rows.push({
        signature: info.signature,
        contract,
        blockTime,
        timeLabel:
          blockTime != null ? new Date(blockTime * 1000).toLocaleString() : "Time unavailable",
        failed: info.err != null,
        explorerHref: explorer(info.signature),
        contractHref: `/contracts/${contract}`,
        slot: info.slot,
      });
    }
  }
  rows.sort((a, b) => {
    if (a.blockTime != null && b.blockTime != null && a.blockTime !== b.blockTime) {
      return b.blockTime - a.blockTime;
    }
    if (a.blockTime == null && b.blockTime != null) return 1;
    if (a.blockTime != null && b.blockTime == null) return -1;
    return b.slot - a.slot;
  });
  return rows.slice(0, limit).map((row) => {
    const item: ResolverTxItem & { slot?: number } = { ...row };
    delete item.slot;
    return item;
  });
}
