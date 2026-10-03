"use client";

import Link from "next/link";

import { CreateWizard } from "@/components/create/CreateWizard";
import { PageFade } from "@/components/shell/PageFade";
import { useAccountSession } from "@/lib/account-auth/useAccountSession";
import { brand } from "@/lib/brand";

export default function CreatePage() {
  const { data: session, isPending } = useAccountSession();
  const user = session?.user ?? null;

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
        {isPending ? (
          <div className="rounded-2xl border border-line bg-card p-5 text-sm text-ink-soft">
            Checking your PREMIFLOW account…
          </div>
        ) : !user ? (
          <div className="rounded-2xl border border-line bg-card p-5 sm:p-6">
            <h2 className="font-display text-lg text-ink">
              Sign in to create a contract
            </h2>

            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">
              Your PREMIFLOW account manages your contract setup. You can prepare
              and review the terms without connecting a wallet. A Solana wallet
              is requested only when an on-chain action needs your approval.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/sign-in"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Sign in
              </Link>

              <Link
                href="/sign-up"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-paper px-5 text-sm font-semibold text-ink transition hover:bg-paper-2"
              >
                Create account
              </Link>
            </div>
          </div>
        ) : (
          <CreateWizard />
        )}
      </div>
    </PageFade>
  );
}
