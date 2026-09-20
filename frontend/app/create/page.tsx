"use client";

import { useWallet } from "@solana/wallet-adapter-react";

import { CreateWizard } from "@/components/create/CreateWizard";
import { ConnectPrompt } from "@/components/shell/ConnectPrompt";
import { PageFade } from "@/components/shell/PageFade";
import { brand } from "@/lib/brand";

export default function CreatePage() {
  const { connected } = useWallet();
  return (
    <PageFade>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">{brand.eyebrow}</p>
      <h1 className="mt-1 font-display text-4xl">Create protected work</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">
        Fund the work up front. Start by choosing what kind of work you are paying for. The
        connected wallet is the employer.
      </p>
      <div className="mt-8">
        {connected ? <CreateWizard /> : <ConnectPrompt />}
      </div>
    </PageFade>
  );
}
