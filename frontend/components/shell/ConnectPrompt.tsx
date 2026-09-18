"use client";

import { ClientOnly } from "@/components/shell/ClientOnly";
import { WalletControl } from "@/components/shell/WalletControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { brand } from "@/lib/brand";

export function ConnectPrompt() {
  return (
    <div className="space-y-6">
      <EmptyState
        kind="wallet"
        title={`Connect to ${brand.name}`}
        body="Your wallet is how you hire, work, and settle. We never ask for a seed phrase or private key."
      />
      <div className="flex justify-center">
        <ClientOnly>
          <WalletControl />
        </ClientOnly>
      </div>
    </div>
  );
}
