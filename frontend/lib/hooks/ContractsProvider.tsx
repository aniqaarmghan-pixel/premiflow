"use client";

import { getMint } from "@solana/spl-token";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchWalletContractSets,
  getStreamPayV2Program,
  type ContractView,
} from "@/lib/streampay-v2";
import { groupContractsByRole, type GroupedContracts } from "@/lib/app/view-model";

type Status = "idle" | "loading" | "ready" | "error";

type ContractsContextValue = {
  status: Status;
  error: string | null;
  grouped: GroupedContracts;
  decimalsByMint: Record<string, number>;
  refresh: () => Promise<void>;
};

const ContractsContext = createContext<ContractsContextValue | null>(null);

export function ContractsProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractView[]>([]);
  const [decimalsByMint, setDecimalsByMint] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!wallet || !publicKey) {
      setContracts([]);
      setStatus("idle");
      setError(null);
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const program = getStreamPayV2Program(connection, wallet);
      const sets = await fetchWalletContractSets(program, publicKey);
      const merged = [...sets.asEmployer, ...sets.asFreelancer];
      const unique = new Map<string, ContractView>();
      for (const c of merged) unique.set(c.address.toBase58(), c);
      const list = [...unique.values()];
      setContracts(list);

      const mints = [...new Set(list.map((c) => c.tokenMint.toBase58()))];
      const next: Record<string, number> = {};
      await Promise.all(
        mints.map(async (mint) => {
          try {
            const info = await getMint(connection, new PublicKey(mint));
            next[mint] = info.decimals;
          } catch {
            next[mint] = 0;
          }
        })
      );
      setDecimalsByMint(next);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not load contracts.");
    }
  }, [connection, publicKey, wallet]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const grouped = useMemo(
    () =>
      publicKey
        ? groupContractsByRole(publicKey, contracts)
        : { all: [], hiring: [], working: [] },
    [contracts, publicKey]
  );

  const value = useMemo(
    () => ({ status, error, grouped, decimalsByMint, refresh }),
    [status, error, grouped, decimalsByMint, refresh]
  );

  return (
    <ContractsContext.Provider value={value}>{children}</ContractsContext.Provider>
  );
}

export function useContracts() {
  const ctx = useContext(ContractsContext);
  if (!ctx) throw new Error("useContracts must be used within ContractsProvider");
  return ctx;
}
