"use client";

import { getMint } from "@solana/spl-token";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

import {
  disputeAssignedUniqueKey,
  markDisputeAssignedSync,
  requestDisputeAssignedNotification,
} from "@/lib/app/dispute-assigned-client";
import { resolverCasesForWallet } from "@/lib/app/resolver-cases";
import { writeResolverCapability } from "@/lib/app/workspace-store";
import { useContracts } from "@/lib/hooks/ContractsProvider";
import {
  fetchContractsForResolver,
  getStreamPayV2Program,
  type ContractView,
} from "@/lib/streampay-v2";

type Status = "idle" | "loading" | "ready" | "error";

/**
 * Contracts where the connected wallet is the on-chain resolver, discovered
 * with a memcmp filter on the resolver field (same architecture as the
 * employer/freelancer discovery). Independent of ContractsProvider so the
 * existing Hiring/Working data flow is untouched.
 */
export function useResolverCases() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [status, setStatus] = useState<Status>("idle");
  const [cases, setCases] = useState<ContractView[]>([]);
  const [decimalsByMint, setDecimalsByMint] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!wallet || !publicKey) {
      setCases([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    try {
      const program = getStreamPayV2Program(connection, wallet);
      const fetched = await fetchContractsForResolver(program, publicKey);
      const list = resolverCasesForWallet(publicKey, fetched);
      const mints = [...new Set(list.map((c) => c.tokenMint.toBase58()))];
      const next: Record<string, number> = {};
      await Promise.all(
        mints.map(async (mint) => {
          try {
            const info = await getMint(connection, new PublicKey(mint));
            next[mint] = info.decimals;
          } catch {
            // Unknown decimals: amounts render as raw base units.
          }
        })
      );
      setCases(list);
      setDecimalsByMint(next);
      setStatus("ready");
      // Best-effort inbox sync; the server verifies chain facts and dedupes.
      const resolverWallet = publicKey.toBase58();
      for (const contract of list) {
        if (contract.status !== "Disputed") continue;
        const address = contract.address.toBase58();
        const key = disputeAssignedUniqueKey(address, contract.disputedAt, resolverWallet);
        if (markDisputeAssignedSync(key)) {
          void requestDisputeAssignedNotification(address, { retries: 0 });
        }
      }
    } catch {
      setCases([]);
      setStatus("error");
    }
  }, [connection, publicKey, wallet]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // Remember (locally) that this wallet resolves disputes so the shell can
  // offer the Resolver Workspace without another RPC scan on every page.
  const { status: partyStatus, grouped } = useContracts();
  const partyCount = partyStatus === "ready" ? grouped.all.length : null;
  useEffect(() => {
    if (!publicKey || status !== "ready") return;
    writeResolverCapability(publicKey.toBase58(), {
      resolverCaseCount: cases.length,
      partyContractCount: partyCount,
    });
  }, [cases.length, partyCount, publicKey, status]);

  return { status, cases, decimalsByMint, refresh };
}
