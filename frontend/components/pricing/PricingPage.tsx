"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { PageFade } from "@/components/shell/PageFade";
import { Card } from "@/components/ui/Card";
import { feePercentLabel } from "@/lib/app/platform-fee";
import {
  PRICING_COPY,
  SUBSCRIPTION_PLANS,
  planDemoUsdtLabel,
  planPriceLabel,
  type BillingTerm,
} from "@/lib/app/subscription-plans";
import { useStreamPayClient } from "@/lib/hooks/useStreamPayClient";
import { useSubscriptionPlan } from "@/lib/hooks/useSubscriptionPlan";

const TERMS: readonly BillingTerm[] = ["Monthly", "Annual"];

export function PricingPage() {
  const [term, setTerm] = useState<BillingTerm>("Monthly");
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const client = useStreamPayClient();
  const current = useSubscriptionPlan(publicKey?.toBase58() ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const activePaid = current.tier !== "Free";

  async function subscribe(tier: "Pro" | "Premium") {
    if (!publicKey || !client) {
      setVisible(true);
      return;
    }
    setBusy(tier);
    setStatus(null);
    try {
      await client.purchaseSubscription({ tier, term });
      setStatus(PRICING_COPY.purchased(tier, term));
      current.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? `${PRICING_COPY.failed} ${error.message}` : PRICING_COPY.failed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageFade>
      <article className="min-w-0 space-y-6">
        <header className="rounded-[32px] border border-line bg-card px-5 py-6 sm:px-7 sm:py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">{PRICING_COPY.eyebrow}</p>
          <h1 className="mt-3 font-display text-2xl tracking-tight sm:text-3xl lg:text-4xl">{PRICING_COPY.heading}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-soft sm:text-base">{PRICING_COPY.intro}</p>
          {publicKey ? (
            <p className="mt-3 text-sm font-medium text-ink">{PRICING_COPY.currentPlan(current.tier)}</p>
          ) : null}
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Billing period" className="inline-flex rounded-full border border-line p-1">
            {TERMS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={term === option}
                onClick={() => setTerm(option)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  term === option ? "bg-accent text-white" : "text-ink-soft"
                }`}
              >
                {option === "Monthly" ? PRICING_COPY.monthly : PRICING_COPY.annual}
              </button>
            ))}
          </div>
          {term === "Annual" ? <p className="text-sm font-medium text-cyan">{PRICING_COPY.annualNote}</p> : null}
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isCurrent = current.tier === plan.tier;
            const blocked = plan.purchasable && activePaid && !isCurrent;
            return (
              <Card key={plan.tier} className="flex h-full flex-col p-5">
                <h2 className="font-display text-2xl">{plan.name}</h2>
                <p className="mt-1 text-sm text-ink-soft">{plan.audience}</p>
                <p className="mt-4 font-display text-3xl">{planPriceLabel(plan, term)}</p>
                {plan.purchasable ? (
                  <p className="mt-1 text-xs text-ink-faint">{planDemoUsdtLabel(plan, term)}</p>
                ) : null}
                <p className="mt-3 text-sm font-semibold text-ink">{plan.feeLabel}</p>
                <p className="text-xs text-ink-soft">{PRICING_COPY.perSide(feePercentLabel(plan.feeBps))}</p>
                <div className="mt-auto pt-5">
                  {plan.purchasable ? (
                    <button
                      type="button"
                      disabled={busy !== null || blocked}
                      onClick={() => void subscribe(plan.tier === "Premium" ? "Premium" : "Pro")}
                      className="w-full rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {!publicKey
                        ? PRICING_COPY.connect
                        : busy === plan.tier
                          ? PRICING_COPY.processing
                          : isCurrent
                            ? PRICING_COPY.renew(plan.name)
                            : PRICING_COPY.subscribe(plan.name)}
                    </button>
                  ) : (
                    <p className="text-sm text-ink-faint">{PRICING_COPY.freeCta}</p>
                  )}
                  {blocked ? <p className="mt-2 text-xs text-ink-faint">{PRICING_COPY.tierChangeNote}</p> : null}
                </div>
              </Card>
            );
          })}
        </div>

        {status ? (
          <p role="status" className="text-sm text-ink">
            {status}
          </p>
        ) : null}

        <Card className="p-5">
          <ul className="space-y-2 text-sm leading-6 text-ink-soft">
            {PRICING_COPY.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Card>
        <p className="text-sm">
          <Link href="/about" className="font-semibold text-accent underline-offset-4 hover:underline">
            {PRICING_COPY.aboutLink}
          </Link>
        </p>
      </article>
    </PageFade>
  );
}
