"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Check, ChevronDown, Copy, LogOut, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  isWalletUiConnected,
  shortenAddress,
  walletControlLabel,
} from "@/lib/network";

export function WalletControl() {
  const { connected, connecting, publicKey, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!uiConnected) setMenuOpen(false);
  }, [uiConnected, pubkey]);

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

  function onChangeWallet() {
    setMenuOpen(false);
    setVisible(true);
  }

  function onPrimaryClick() {
    if (connecting) return;
    if (!uiConnected) {
      setVisible(true);
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
              onClick={onChangeWallet}
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
