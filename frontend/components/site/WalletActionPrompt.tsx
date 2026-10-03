"use client";

import { Wallet } from "lucide-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

/**
 * Contextual wallet request shown only next to an action that needs one
 * (hire, propose, create). Opens the existing wallet modal on click; it never
 * opens by itself and does not change wallet provider behaviour.
 */
export function WalletActionPrompt({ message, action = "Connect wallet" }: { message: string; action?: string }) {
  const { setVisible } = useWalletModal();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-ink-faint">
      <span>{message}</span>
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="pf-chip inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3 font-semibold text-ink hover:border-accent/50"
      >
        <Wallet size={13} aria-hidden="true" />
        {action}
      </button>
    </div>
  );
}
