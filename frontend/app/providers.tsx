"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { MotionConfig } from "framer-motion";

import { AppShell } from "@/components/shell/AppShell";
import { NoticeProvider } from "@/components/shell/NoticeProvider";
import { ContractsProvider } from "@/lib/hooks/ContractsProvider";
import { RPC_CONNECTION_CONFIG, browserRpcEndpoint } from "@/lib/network";
import { walletErrorReport } from "@/lib/app/wallet-connect";

import "@solana/wallet-adapter-react-ui/styles.css";

export default function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => browserRpcEndpoint(), []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  // Without onError the adapter logs every connect failure as an error, which
  // Next surfaces as a runtime error overlay (e.g. Phantom's internal
  // "reading 'some'" TypeError wrapped in WalletConnectionError). Callers
  // already show friendly copy; here errors are reported non-fatally.
  const onWalletError = useCallback((error: { name?: string; message?: string }) => {
    const report = walletErrorReport(error);
    if (report === "silent") return;
    const text = `[wallet] ${error?.name ?? "WalletError"}: ${error?.message || "connection failed"}`;
    if (report === "info") console.info(text);
    else console.warn(text);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <ConnectionProvider endpoint={endpoint} config={RPC_CONNECTION_CONFIG}>
        <WalletProvider wallets={wallets} onError={onWalletError}>
          <WalletModalProvider>
            <ContractsProvider>
              <NoticeProvider>
                <AppShell>{children}</AppShell>
              </NoticeProvider>
            </ContractsProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </MotionConfig>
  );
}
