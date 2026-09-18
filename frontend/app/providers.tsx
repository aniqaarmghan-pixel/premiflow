"use client";

import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { MotionConfig } from "framer-motion";

import { AppShell } from "@/components/shell/AppShell";
import { ContractsProvider } from "@/lib/hooks/ContractsProvider";
import { NETWORK } from "@/lib/network";

import "@solana/wallet-adapter-react-ui/styles.css";

export default function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => NETWORK.endpoint, []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <MotionConfig reducedMotion="user">
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <ContractsProvider>
              <AppShell>{children}</AppShell>
            </ContractsProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </MotionConfig>
  );
}
