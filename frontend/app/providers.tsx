"use client";

import { useMemo, type ReactNode } from "react";
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

import "@solana/wallet-adapter-react-ui/styles.css";

export default function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => browserRpcEndpoint(), []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <MotionConfig reducedMotion="user">
      <ConnectionProvider endpoint={endpoint} config={RPC_CONNECTION_CONFIG}>
        <WalletProvider wallets={wallets}>
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
