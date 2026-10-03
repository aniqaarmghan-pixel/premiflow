"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletModalContext } from "@solana/wallet-adapter-react-ui";
import { useContext, useEffect, useRef, useState } from "react";

import {
  WALLET_CONNECT_COPY,
  walletConnectFailure,
  walletConnectStep,
  type WalletConnectFailure,
} from "@/lib/app/wallet-connect";

const READY_STATES = new Set(["Installed", "Loadable"]);

/**
 * Real wallet-adapter connect flow for contextual prompts (Apply / Hire).
 * Uses the single app wallet state (useWallet) - no separate store.
 * - wallet selected but disconnected -> connect()
 * - none selected -> open the wallet modal; once the user picks a wallet,
 *   connect() follows (the provider has no autoConnect, so select() alone
 *   never connects)
 * - modal provider missing -> select the installed wallet directly
 * - nothing installed -> install message
 */
export function useWalletConnectRequest() {
  const { wallet, wallets, connected, connecting, connect, select } = useWallet();
  const modal = useContext(WalletModalContext);
  // The library's default (missing-provider) context exposes `visible` as a getter.
  const hasModal = !Object.getOwnPropertyDescriptor(modal, "visible")?.get;
  const requestedRef = useRef(false);
  const [failure, setFailure] = useState<WalletConnectFailure | null>(null);

  const installed = wallets
    .filter((w) => String(w.readyState) === "Installed")
    .map((w) => w.adapter.name);
  const selectedReady = Boolean(wallet && READY_STATES.has(String(wallet.readyState)));

  // After the user picks a wallet (modal or direct select), finish with connect().
  useEffect(() => {
    if (!requestedRef.current || !wallet || connected || connecting) return;
    requestedRef.current = false;
    connect().catch((err: unknown) => setFailure(walletConnectFailure(err)));
  }, [wallet, connected, connecting, connect]);

  function request() {
    setFailure(null);
    const step = walletConnectStep({
      connected,
      connecting,
      selected: Boolean(wallet),
      selectedReady,
      installed,
      hasModal,
    });
    switch (step) {
      case "connected":
      case "busy":
        return;
      case "connect":
        connect().catch((err: unknown) => setFailure(walletConnectFailure(err)));
        return;
      case "open_modal":
        requestedRef.current = true;
        modal.setVisible(true);
        return;
      case "select_installed":
        requestedRef.current = true;
        select(installed[0] as Parameters<typeof select>[0]);
        return;
      case "not_installed":
        setFailure({ kind: "not_installed", message: WALLET_CONNECT_COPY.notInstalled });
        return;
    }
  }

  return { request, connected, connecting, failure };
}
