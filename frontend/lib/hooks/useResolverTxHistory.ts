"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

import {
  RESOLVER_TX_HISTORY_MAX_CONTRACTS,
  RESOLVER_TX_HISTORY_PER_CONTRACT,
  mergeResolverTxHistory,
  type ResolverTxItem,
} from "@/lib/app/resolver-tx-history";
import { explorerTxUrl } from "@/lib/network";

export type ResolverTxHistoryState = {
  status: "idle" | "loading" | "ready" | "error";
  items: ResolverTxItem[];
};

/** Read-only RPC history (getSignaturesForAddress) for the given contract accounts. */
export function useResolverTxHistory(addresses: readonly string[]): ResolverTxHistoryState {
  const { connection } = useConnection();
  const key = addresses.slice(0, RESOLVER_TX_HISTORY_MAX_CONTRACTS).join(",");
  const [result, setResult] = useState<{ key: string; items: ResolverTxItem[]; failed: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void (async () => {
      try {
        const perContract = await Promise.all(
          key.split(",").map(async (contract) => ({
            contract,
            signatures: await connection.getSignaturesForAddress(new PublicKey(contract), {
              limit: RESOLVER_TX_HISTORY_PER_CONTRACT,
            }),
          }))
        );
        if (!cancelled) {
          setResult({ key, items: mergeResolverTxHistory(perContract, explorerTxUrl), failed: false });
        }
      } catch {
        if (!cancelled) setResult({ key, items: [], failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, key]);

  if (!key) return { status: "idle", items: [] };
  if (!result || result.key !== key) return { status: "loading", items: [] };
  return result.failed ? { status: "error", items: [] } : { status: "ready", items: result.items };
}
