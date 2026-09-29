"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

import { CreateWizard } from "@/components/create/CreateWizard";
import { ConnectPrompt } from "@/components/shell/ConnectPrompt";
import { PageFade } from "@/components/shell/PageFade";
import { createPageView, nextWizardOwner } from "@/lib/app/create-page-gate";
import { brand } from "@/lib/brand";

export default function CreatePage() {
  const { connected, publicKey } = useWallet();
  const walletKey = publicKey?.toBase58() ?? null;
  // The wallet this wizard was started with. A transient disconnect keeps the
  // wizard (and its draft) mounted but hidden; a different wallet remounts it.
  const [wizardOwner, setWizardOwner] = useState<string | null>(null);
  const owner = nextWizardOwner(wizardOwner, connected, walletKey);
  if (owner !== wizardOwner) setWizardOwner(owner);
  const view = createPageView({ connected, wizardStarted: owner !== null });
  return (
    <PageFade>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan sm:text-xs">
        {brand.eyebrow}
      </p>
      <h1 className="mt-1 font-display text-[1.65rem] tracking-tight sm:text-3xl">
        Create contract
      </h1>
      <p className="mt-1 text-sm font-medium text-ink sm:text-base">
        Set up protected work in a few steps.
      </p>
      <p className="mt-1 max-w-xl text-sm text-ink-soft">
        Choose how the work will be paid, set the terms, and review before funding.
      </p>
      <div className="mt-5 sm:mt-6">
        {view.showConnectPrompt ? <ConnectPrompt /> : null}
        {view.mountWizard && owner ? (
          <div hidden={!view.showWizard}>
            <CreateWizard key={owner} />
          </div>
        ) : null}
      </div>
    </PageFade>
  );
}
