"use client";

import { getMint } from "@solana/spl-token";
import { useConnection } from "@solana/wallet-adapter-react";
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

import { useAccountSession } from "@/lib/account-auth/useAccountSession";
import {
  fetchWalletContractSets,
  getStreamPayV2ReadOnlyProgram,
  type ContractView,
} from "@/lib/streampay-v2";
import {
  groupContractsByWallets,
  type GroupedContracts,
} from "@/lib/app/view-model";

type Status = "idle" | "loading" | "ready" | "error";

type AccountWalletLinksResponse = {
  wallets?: Array<{
    walletAddress?: unknown;
  }>;
};

type ContractsContextValue = {
  status: Status;
  error: string | null;
  grouped: GroupedContracts;
  decimalsByMint: Record<string, number>;

  /**
   * Verified Solana wallets linked to the signed-in PREMIFLOW account.
   *
   * These wallets are used only for read-only account discovery here.
   * They do not grant transaction authority.
   */
  accountWallets: PublicKey[];

  refresh: () => Promise<void>;
};

const EMPTY_GROUPED: GroupedContracts = {
  all: [],
  hiring: [],
  working: [],
};

const ContractsContext = createContext<ContractsContextValue | null>(null);

function parseAccountWallets(payload: unknown): PublicKey[] {
  if (!payload || typeof payload !== "object") return [];

  const { wallets } = payload as AccountWalletLinksResponse;
  if (!Array.isArray(wallets)) return [];

  const unique = new Map<string, PublicKey>();

  for (const item of wallets) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.walletAddress !== "string"
    ) {
      continue;
    }

    try {
      const key = new PublicKey(item.walletAddress);
      unique.set(key.toBase58(), key);
    } catch {
      // Ignore malformed persisted addresses defensively.
      // Wallet links created through PREMIFLOW are server-verified.
    }
  }

  return [...unique.values()];
}

export function ContractsProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const {
    data: accountSession,
    isPending: accountSessionPending,
  } = useAccountSession();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractView[]>([]);
  const [accountWallets, setAccountWallets] = useState<PublicKey[]>([]);
  const [decimalsByMint, setDecimalsByMint] = useState<Record<string, number>>(
    {}
  );

  const accountUserId = accountSession?.user?.id ?? null;

  const refresh = useCallback(async () => {
    if (accountSessionPending) {
      return;
    }

    if (!accountUserId) {
      setAccountWallets([]);
      setContracts([]);
      setDecimalsByMint({});
      setStatus("idle");
      setError(null);
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/account-wallets", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Your PREMIFLOW account session has expired."
            : "Could not load linked wallets."
        );
      }

      const payload = (await response.json()) as unknown;
      const linkedWallets = parseAccountWallets(payload);

      setAccountWallets(linkedWallets);

      if (linkedWallets.length === 0) {
        setContracts([]);
        setDecimalsByMint({});
        setStatus("ready");
        return;
      }

      const program = getStreamPayV2ReadOnlyProgram(connection);

      const walletSets = await Promise.all(
        linkedWallets.map((wallet) =>
          fetchWalletContractSets(program, wallet)
        )
      );

      const uniqueContracts = new Map<string, ContractView>();

      for (const sets of walletSets) {
        for (const contract of [
          ...sets.asEmployer,
          ...sets.asFreelancer,
        ]) {
          uniqueContracts.set(
            contract.address.toBase58(),
            contract
          );
        }
      }

      const list = [...uniqueContracts.values()];
      setContracts(list);

      const mints = [
        ...new Set(
          list.map((contract) =>
            contract.tokenMint.toBase58()
          )
        ),
      ];

      const nextDecimals: Record<string, number> = {};

      await Promise.all(
        mints.map(async (mint) => {
          try {
            const info = await getMint(
              connection,
              new PublicKey(mint)
            );
            nextDecimals[mint] = info.decimals;
          } catch {
            nextDecimals[mint] = 0;
          }
        })
      );

      setDecimalsByMint(nextDecimals);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error
          ? err.message
          : "Could not load contracts."
      );
    }
  }, [
    accountSessionPending,
    accountUserId,
    connection,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refresh]);

  const grouped = useMemo(
    () =>
      accountWallets.length > 0
        ? groupContractsByWallets(accountWallets, contracts)
        : EMPTY_GROUPED,
    [accountWallets, contracts]
  );

  const value = useMemo(
    () => ({
      status,
      error,
      grouped,
      decimalsByMint,
      accountWallets,
      refresh,
    }),
    [
      status,
      error,
      grouped,
      decimalsByMint,
      accountWallets,
      refresh,
    ]
  );

  return (
    <ContractsContext.Provider value={value}>
      {children}
    </ContractsContext.Provider>
  );
}

export function useContracts() {
  const ctx = useContext(ContractsContext);

  if (!ctx) {
    throw new Error(
      "useContracts must be used within ContractsProvider"
    );
  }

  return ctx;
}
