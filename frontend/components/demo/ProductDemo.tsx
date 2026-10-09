"use client";

import Link from "next/link";

import { formatDemoTime } from "@/lib/app/landing-explainer";
import { ProductDemoPlayer, useProductDemo } from "./ProductDemoPlayer";

/**
 * Public /demo: the customer-facing PREMIFLOW product demo. Only the player
 * (play/pause, restart, progress, voice + volume, captions, full screen) and
 * product branding. Recording tools live in the internal /demo/studio.
 * Presentation only: synthetic data, no wallet, RPC, API or transactions.
 */
export function ProductDemo() {
  const demo = useProductDemo({ initialVoiceOn: true });

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 sm:py-14 lg:min-h-[calc(100dvh-9rem)] lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Product demo</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
        Watch PREMIFLOW in action
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
        A {formatDemoTime(demo.seq.totalMs)} walkthrough of the product at work: proposal, hire, funded offer,
        delivery, payment and dispute protection.
      </p>

      <ProductDemoPlayer demo={demo} className="mt-6" />

      <div className="mt-5 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <ul className="flex min-w-0 flex-wrap gap-2 text-xs text-ink-soft" aria-label="About this demo">
          {["Sample data", "Demo USDT is a Devnet test asset", "No wallet needed to watch"].map((item) => (
            <li key={item} className="rounded-full border border-line bg-card px-3 py-1.5">
              {item}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/marketplace/jobs"
            className="inline-flex min-h-11 items-center rounded-full bg-[linear-gradient(135deg,#2ee6d6,#7c8cff)] px-5 text-sm font-semibold text-[#04101f] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Browse jobs
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-5 text-sm font-semibold text-ink transition hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Back to the marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}
