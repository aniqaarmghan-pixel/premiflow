"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  Briefcase,
  GitPullRequest,
  Layers,
  ShieldCheck,
  Timer,
  Wallet,
  Waves,
} from "lucide-react";

import { ContractCard } from "@/components/contracts/ContractCard";
import { WhyPremiflowTeaser } from "@/components/about/AboutPage";
import { ConnectPrompt } from "@/components/shell/ConnectPrompt";
import { PageFade } from "@/components/shell/PageFade";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { HeroFlow } from "@/components/illustrations/HeroFlow";
import { brand } from "@/lib/brand";
import { OVERVIEW_DASHBOARD_HREFS } from "@/lib/app/contracts-list-query";
import { formatUnix } from "@/lib/app/datetime";
import { formatTokenAmount } from "@/lib/app/money";
import {
  dashboardSummary,
  presentStatus,
  presentType,
} from "@/lib/app/view-model";
import { useContracts } from "@/lib/hooks/ContractsProvider";

const NAV_CARD_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

export function OverviewPage() {
  const { connected, publicKey } = useWallet();
  const { status, error, grouped, decimalsByMint, refresh } = useContracts();
  const router = useRouter();

  if (!connected || !publicKey) {
    return (
      <PageFade>
        <Hero />
        <WhyPremiflowTeaser />
        <div className="mt-6">
          <ConnectPrompt />
        </div>
      </PageFade>
    );
  }

  if (status === "loading" || status === "idle") {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-64 md:col-span-2" />
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <EmptyState
        kind="contracts"
        title="Could not load contracts"
        body={error ?? "The RPC request failed."}
        action={{ label: "Retry", onClick: () => void refresh() }}
      />
    );
  }

  const summary = dashboardSummary(publicKey, grouped);
  const mintKeys = [...new Set(grouped.all.map((c) => c.tokenMint.toBase58()))];
  const sharedDecimals =
    mintKeys.length === 1 ? decimalsByMint[mintKeys[0]] : undefined;
  const mixedMints = mintKeys.length > 1;
  const streaming = grouped.all.filter(
    (c) => c.paymentMode === "Streaming" && c.status === "Active"
  );
  const pending = grouped.all.filter((c) => c.openReviewCount > 0);
  const recent = [...grouped.all]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);

  return (
    <PageFade>
      <Hero />
      <WhyPremiflowTeaser />
      <div className="mt-5 grid gap-3 lg:grid-cols-12">
        <Card className="relative overflow-hidden p-4 sm:p-5 lg:col-span-8">
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
          <div className="flex items-center gap-2 text-accent">
            <ShieldCheck size={15} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Protected value</p>
          </div>
          <h2 className="mt-1.5 font-display text-xl sm:text-3xl">Balances that stay in motion</h2>
          <p className="mt-1.5 text-sm text-ink-faint">
            Derived from fetched contract accounts for this wallet. Not a live bank balance.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MoneyTile
              href={OVERVIEW_DASHBOARD_HREFS.availableToWithdraw}
              icon={<Wallet size={15} />}
              label="Available to withdraw"
              value={formatTokenAmount(summary.availableToWithdraw, sharedDecimals)}
              hint={
                mixedMints
                  ? "sum of base units; contracts use more than one mint"
                  : "from fetched working contracts"
              }
              tone="teal"
            />
            <MoneyTile
              href={OVERVIEW_DASHBOARD_HREFS.availableRefund}
              icon={<ShieldCheck size={15} />}
              label="Available refund"
              value={formatTokenAmount(summary.availableRefund, sharedDecimals)}
              hint={
                mixedMints
                  ? "sum of base units; contracts use more than one mint"
                  : "from fetched hiring contracts"
              }
              tone="violet"
            />
          </div>
        </Card>
        <Card className="flex flex-col justify-between overflow-hidden bg-[linear-gradient(180deg,#07111f,#0c1b2e)] p-4 sm:p-5 text-white lg:col-span-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan">Roles</p>
            <h2 className="mt-1.5 font-display text-xl sm:text-2xl">One wallet, both sides</h2>
            <p className="mt-1.5 text-sm leading-5 text-white/65">
              Hiring and working are per contract. You may employ someone and also work for someone
              else from the same address.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Stat
              label="Hiring"
              value={String(summary.hiring)}
              href="/contracts?role=hiring"
              dark
            />
            <Stat
              label="Working"
              value={String(summary.working)}
              href="/contracts?role=working"
              dark
            />
          </div>
        </Card>
        <Bento
          className="lg:col-span-3"
          href={OVERVIEW_DASHBOARD_HREFS.activeContracts}
          icon={<Layers size={15} />}
          label="Active contracts"
          value={summary.active}
          tone="teal"
        />
        <Bento
          className="lg:col-span-3"
          href={OVERVIEW_DASHBOARD_HREFS.pendingReviews}
          icon={<GitPullRequest size={15} />}
          label="Pending reviews"
          value={summary.pendingReviews}
          tone="violet"
        />
        <Bento
          className="lg:col-span-3"
          href={OVERVIEW_DASHBOARD_HREFS.liveStreams}
          icon={<Waves size={15} />}
          label="Live streams"
          value={summary.streamingActive}
          tone="blue"
        />
        <Bento
          className="lg:col-span-3"
          href={OVERVIEW_DASHBOARD_HREFS.allContracts}
          icon={<Briefcase size={15} />}
          label="All contracts"
          value={grouped.all.length}
          tone="navy"
        />
      </div>

      <section className="mt-5">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Timer size={16} className="text-accent" />
            Streaming now
          </h2>
          <Link href="/contracts" className="text-sm font-medium text-accent">
            All contracts
          </Link>
        </div>
        {streaming.length === 0 ? (
          <EmptyState
            kind="streams"
            title="No live streams"
            body="Streaming contracts appear here once they are active for this wallet."
            action={{ label: "Create a contract", onClick: () => router.push("/create") }}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {streaming.map((c) => (
              <ContractCard
                key={c.address.toBase58()}
                contract={c}
                decimals={decimalsByMint[c.tokenMint.toBase58()]}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-5 grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-display text-xl">Needs review</h2>
          {pending.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                kind="reviews"
                title="Inbox is clear"
                body="No open reviews on loaded contracts."
              />
            </div>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {pending.map((c) => (
                <li key={c.address.toBase58()}>
                  <Link
                    href={`/contracts/${c.address.toBase58()}`}
                    className="block rounded-2xl bg-paper px-3 py-2.5 transition hover:bg-accent-soft"
                  >
                    <p className="font-medium">{presentType(c.paymentMode)}</p>
                    <p className="text-xs text-ink-faint">
                      {presentStatus(c.status)} · {c.openReviewCount} in review
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="font-display text-xl">Lifecycle stamps</h2>
          <p className="mt-1 text-xs text-ink-faint">
            Only timestamps currently stored on the contract account. Not a full event history.
          </p>
          {recent.length === 0 ? (
            <p className="mt-2.5 text-sm text-ink-faint">No contracts yet.</p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {recent.map((c) => (
                <li key={c.address.toBase58()} className="text-sm">
                  <Link href={`/contracts/${c.address.toBase58()}`} className="font-medium">
                    {presentType(c.paymentMode)} · {presentStatus(c.status)}
                  </Link>
                  <p className="text-xs text-ink-faint">Created {formatUnix(c.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </PageFade>
  );
}

function Hero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,#06101c_0%,#0b1d33_48%,#102a3d_100%)] px-3.5 py-5 text-white sm:rounded-[28px] sm:px-6 sm:py-7">
      <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-cyan/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-10 h-64 w-64 rounded-full bg-violet/20 blur-3xl" />
      <div className="relative grid min-w-0 items-center gap-4 sm:gap-5 lg:grid-cols-[1.05fr_.95fr] lg:gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan">
            {brand.eyebrow}
          </p>
          <h1 className="mt-2 font-display text-[1.4rem] leading-[1.18] text-white sm:mt-2.5 sm:text-[2.35rem] lg:text-[2.75rem]">
            {brand.tagline}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/70 sm:mt-2.5 sm:text-[0.95rem]">
            {brand.description}
          </p>
          <div className="mt-3.5 flex flex-col gap-2.5 sm:mt-4 sm:flex-row sm:flex-wrap">
            <Link href="/create" className="w-full sm:w-auto">
              <Button className="w-full px-3.5 py-2.5 text-[13px] sm:w-auto sm:py-2">
                Create contract
              </Button>
            </Link>
            <Link href="/contracts" className="w-full sm:w-auto">
              <Button
                variant="secondary"
                className="w-full border-white/15 bg-white/5 px-3.5 py-2.5 text-[13px] text-white hover:bg-white/10 sm:w-auto sm:py-2"
              >
                Explore contracts
              </Button>
            </Link>
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/5 sm:rounded-2xl">
          <HeroFlow dense />
        </div>
      </div>
    </div>
  );
}

function MoneyTile({
  href,
  icon,
  label,
  value,
  hint,
  tone,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "teal" | "violet";
}) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. Open matching contracts.`}
      className={`block cursor-pointer rounded-2xl px-3.5 py-3 transition hover:brightness-[0.97] active:scale-[0.99] ${NAV_CARD_FOCUS} ${
        tone === "teal" ? "bg-accent-soft" : "bg-gold-soft"
      }`}
    >
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 font-display text-xl tracking-tight tabular-nums text-ink sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-faint">{hint}</p>
    </Link>
  );
}

function Bento({
  href,
  icon,
  label,
  value,
  tone,
  className = "",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: number;
  tone: "teal" | "violet" | "blue" | "navy";
  className?: string;
}) {
  const tones = {
    teal: "from-accent/20 to-white",
    violet: "from-violet/20 to-white",
    blue: "from-accent-2/20 to-white",
    navy: "from-ink/10 to-white",
  };
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. Open matching contracts.`}
      className={`block cursor-pointer overflow-hidden rounded-[var(--radius)] border border-line bg-gradient-to-br p-3.5 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_18px_36px_-24px_rgba(18,194,184,.45)] active:translate-y-0 sm:p-4 ${NAV_CARD_FOCUS} ${tones[tone]} ${className}`}
    >
      <p className="flex items-center gap-2 text-[11px] font-medium text-ink-faint">
        {icon}
        {label}
      </p>
      <motion.p
        key={value}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-2 font-display text-2xl sm:text-3xl"
      >
        {value}
      </motion.p>
    </Link>
  );
}

function Stat({
  label,
  value,
  href,
  dark = false,
}: {
  label: string;
  value: string;
  href: string;
  dark?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. Open matching contracts.`}
      className={`block cursor-pointer rounded-2xl px-3 py-3 transition ${NAV_CARD_FOCUS} ${
        dark
          ? "bg-white/8 hover:bg-white/14"
          : "bg-paper hover:bg-accent-soft"
      }`}
    >
      <p className={`text-[11px] ${dark ? "text-white/55" : "text-ink-faint"}`}>{label}</p>
      <p className="mt-0.5 font-display text-2xl">{value}</p>
    </Link>
  );
}
