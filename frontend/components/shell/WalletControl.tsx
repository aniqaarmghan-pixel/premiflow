"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Check, ChevronDown, Copy, LogOut, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  WALLET_SWITCH_DISCONNECT_TIMEOUT_MS,
  settleWithin,
  startWalletSwitch,
  walletSwitchAction,
  walletSwitchStep,
  type WalletSwitchPending,
} from "@/lib/app/wallet-connect";

import {
  isWalletUiConnected,
  shortenAddress,
  walletControlLabel,
} from "@/lib/network";

const READY_STATES = new Set(["Installed", "Loadable"]);

export function WalletControl() {
  const { connected, connecting, disconnecting, publicKey, connect, disconnect, select, wallet } = useWallet();
  const { setVisible, visible: modalVisible } = useWalletModal();
  const modalWasOpenRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const connectRequestedRef = useRef(false);
  // Active-wallet switch in progress (null = none). Refs only: one switch, one connect.
  const switchRef = useRef<WalletSwitchPending | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({
    walletName: null as string | null,
    walletReady: false,
    connected: false,
    connecting: false,
    disconnecting: false,
    modalVisible: false,
    connect,
  });
  const menuId = useId();

  const pubkey = publicKey?.toBase58() ?? null;
  const uiConnected = isWalletUiConnected({
    connected,
    publicKeyBase58: pubkey,
  });
  const label = walletControlLabel({
    connected,
    publicKeyBase58: pubkey,
  });

  // Close the wallet menu once the wallet disconnects (adjusted during render).
  if (!uiConnected && menuOpen) setMenuOpen(false);

  useEffect(() => {
    if (
      !connectRequestedRef.current ||
      !wallet ||
      connected ||
      connecting
    ) {
      return;
    }

    // Consume the request synchronously so no second effect re-connects.
    connectRequestedRef.current = false;
    void connect().catch(() => {
      // Non-fatal: reported by the provider onError; rejection keeps the UI usable.
    });
  }, [wallet, connected, connecting, connect]);

  // Picker dismissed without choosing: drop the pending connect so a later
  // selection elsewhere (Apply / Hire prompt) is not connected twice.
  useEffect(() => {
    if (modalVisible) {
      modalWasOpenRef.current = true;
      return;
    }
    if (!modalWasOpenRef.current) return;
    modalWasOpenRef.current = false;
    const pending = connectRequestedRef.current;
    connectRequestedRef.current = false;
    if (pending && wallet && !connected && !connecting) {
      void connect().catch(() => {
        // Non-fatal: reported by the provider onError, the button stays usable.
      });
    }
  }, [modalVisible, wallet, connected, connecting, connect]);

  const walletName = wallet?.adapter?.name ?? null;
  const walletReady = READY_STATES.has(String(wallet?.readyState));

  // Latest provider state for the deferred switch connect (updated after each commit).
  useEffect(() => {
    latestRef.current = { walletName, walletReady, connected, connecting, disconnecting, modalVisible, connect };
  });

  useEffect(() => {
    return () => {
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    };
  }, []);

  // Drive a pending switch. Connect happens only for the freshly selected
  // adapter, on a later tick than the adapter swap (the provider attaches the
  // new adapter's listeners after this child effect), and exactly once.
  useEffect(() => {
    function run(state: typeof latestRef.current) {
      const action = walletSwitchAction({ pending: switchRef.current, ...state });
      switch (action.kind) {
        case "idle":
          return;
        case "wait":
          switchRef.current = action.pending;
          return;
        case "arm":
          switchRef.current = action.pending;
          if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
          switchTimerRef.current = setTimeout(() => {
            switchTimerRef.current = null;
            run(latestRef.current);
          }, 0);
          return;
        case "connect":
          switchRef.current = null;
          // Rejection / extension errors are non-fatal (provider onError reports softly).
          void state.connect().catch(() => undefined);
          return;
        case "cancel":
          switchRef.current = null;
          // Re-select (not connect) the previous wallet so one click reconnects it.
          if (action.restore) select(action.restore as WalletName);
          return;
        case "not_ready":
        case "done":
          switchRef.current = null;
          return;
      }
    }
    run({ walletName, walletReady, connected, connecting, disconnecting, modalVisible, connect });
  }, [walletName, walletReady, connected, connecting, disconnecting, modalVisible, connect, select]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function copyAddress() {
    if (!pubkey) return;
    await navigator.clipboard.writeText(pubkey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function onDisconnect() {
    setMenuOpen(false);
    try {
      await disconnect();
    } catch {
      // Adapter may throw if already disconnected — UI still clears via state.
    }
  }

  async function onChangeWallet() {
    setMenuOpen(false);
    if (switchRef.current) return; // a switch is already in progress
    // The generic connect-on-select path must not race the switch.
    connectRequestedRef.current = false;
    const from = walletName;
    // One active wallet per session: release the current adapter first. Bounded,
    // because a wallet that never settles its disconnect would freeze the switch.
    if (walletSwitchStep({ connected, selected: Boolean(wallet) }) === "disconnect_then_pick") {
      await settleWithin(disconnect(), WALLET_SWITCH_DISCONNECT_TIMEOUT_MS);
    }
    // Clear the selection so the provider tears the old adapter down (resetting
    // its connecting/disconnecting flags); whatever is picked next is the target.
    select(null);
    switchRef.current = startWalletSwitch(from);
    setVisible(true);
  }

  function onPrimaryClick() {
    if (connecting) return;

    if (!uiConnected) {
      connectRequestedRef.current = true;

      if (wallet) {
        void connect().catch(() => {
          connectRequestedRef.current = false;
        });
      } else {
        setVisible(true);
      }

      return;
    }

    setMenuOpen((value) => !value);
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={onPrimaryClick}
        disabled={connecting}
        aria-haspopup={uiConnected ? "menu" : undefined}
        aria-expanded={uiConnected ? menuOpen : undefined}
        aria-controls={uiConnected && menuOpen ? menuId : undefined}
        aria-label={uiConnected ? "Wallet menu" : "Connect wallet"}
        className="inline-flex min-h-11 max-w-[min(148px,42vw)] items-center justify-center gap-1.5 rounded-full bg-ink px-3 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60 sm:min-h-10 sm:max-w-[180px] sm:px-4 sm:text-[13px]"
      >
        <Wallet size={14} className="shrink-0 opacity-80" aria-hidden />
        <span className="truncate font-mono tracking-tight">{connecting ? "Connecting…" : label}</span>
        {uiConnected ? (
          <ChevronDown size={14} className="shrink-0 opacity-70" aria-hidden />
        ) : null}
      </button>

      {uiConnected && menuOpen && pubkey ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Wallet"
          className="absolute right-0 z-50 mt-2 w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)]"
        >
          <div className="border-b border-line px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Wallet
            </p>
            <p className="mt-1 break-all font-mono text-sm text-ink">
              {shortenAddress(pubkey, 4)}
            </p>
            {wallet?.adapter?.name ? (
              <p className="mt-1 text-xs text-ink-soft">{wallet.adapter.name}</p>
            ) : null}
          </div>
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => void copyAddress()}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-ink hover:bg-paper-2 sm:min-h-10"
            >
              {copied ? <Check size={16} className="text-cyan" /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy address"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void onChangeWallet()}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-ink hover:bg-paper-2 sm:min-h-10"
            >
              <RefreshCw size={16} />
              Change wallet
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void onDisconnect()}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-danger hover:bg-paper-2 sm:min-h-10"
            >
              <LogOut size={16} />
              Disconnect
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
