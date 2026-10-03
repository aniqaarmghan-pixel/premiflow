"use client";
import { Wallet } from "lucide-react";

import { PHANTOM_INSTALL_URL } from "@/lib/app/wallet-connect";
import { useWalletConnectRequest } from "@/lib/hooks/useWalletConnectRequest";

/**
 * Contextual wallet request shown only next to an action that needs one
 * (apply, hire). One shared component for Apply and Hire. It runs the real
 * wallet-adapter flow on click (connect the selected wallet, or open the
 * wallet picker and connect what the user picks); it never opens by itself.
 * The parent unlocks its action reactively from the same useWallet state.
 */
export function WalletActionPrompt({ message, action = "Connect wallet" }: { message: string; action?: string }) {
  const { request, connected, connecting, failure } = useWalletConnectRequest();
  if (connected) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-xs text-ink-faint">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span>{message}</span>
        <button
          type="button"
          onClick={request}
          disabled={connecting}
          aria-busy={connecting || undefined}
          className="pf-chip inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3 font-semibold text-ink hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
        >
          <Wallet size={13} aria-hidden="true" />
          {connecting ? "Connecting..." : action}
        </button>
      </div>
      {failure ? (
        <p role="alert" className="break-words text-xs text-ink-soft">
          {failure.message}{" "}
          {failure.kind === "not_installed" ? (
            <a
              href={PHANTOM_INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent underline"
            >
              Install Phantom
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
