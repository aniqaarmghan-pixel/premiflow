"use client";

import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { Copy } from "lucide-react";

import { NETWORK, shortenAddress } from "@/lib/network";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export function WalletControl() {
  const { publicKey, connected } = useWallet();

  async function copy() {
    if (!publicKey) return;
    await navigator.clipboard.writeText(publicKey.toBase58());
  }

  return (
    <div className="flex items-center gap-2 overflow-hidden">
      <span className="hidden rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan sm:inline">
        {NETWORK.label}
      </span>
      {connected && publicKey ? (
        <button
          type="button"
          onClick={copy}
          className="hidden items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 font-mono text-[11px] text-ink-soft hover:text-ink md:flex"
          aria-label="Copy connected address"
        >
          {shortenAddress(publicKey.toBase58())}
          <Copy size={12} />
        </button>
      ) : null}
      <WalletMultiButton />
    </div>
  );
}
