"use client";

import { useEmployerProposals } from "@/lib/hooks/useEmployerProposals";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import {
  Briefcase,
  ClipboardCheck,
  GitPullRequest,
  Handshake,
  Layers,
  Send,
  ShieldCheck,
  Timer,
  Wallet,
  Waves,
} from "lucide-react";

import { ContractCard } from "@/components/contracts/ContractCard";
import { WhyPremiflowTeaser } from "@/components/about/AboutPage";
import { PageFade } from "@/components/shell/PageFade";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { OVERVIEW_DASHBOARD_HREFS } from "@/lib/app/contracts-list-query";
import {
  ACTION_REQUIRED_COPY,
  OFFER_SECTIONS_COPY,
  ROLE_TOTAL_LABELS,
  actionRequiredItemsForWallets,
  liveStreamContracts,
  offerItemCopy,
  offerSectionsForWallets,
  roleAwareStatusLabelForWallets,
  type ActionRequiredItem,
  type OfferListItem,
} from "@/lib/app/dashboard-offers";
import { formatUnix } from "@/lib/app/datetime";
import { formatTokenAmount } from "@/lib/app/money";
import { dashboardSummaryForWallets, presentType } from "@/lib/app/view-model";
import { useContracts } from "@/lib/hooks/ContractsProvider";
import { useResolverCases } from "@/lib/hooks/useResolverCases";
import { AssignedDisputesSection } from "@/components/contracts/AssignedDisputesSection";
import { useNow } from "@/lib/hooks/useNow";
import { shortenAddress } from "@/lib/network";
import { useAccountSession } from "@/lib/account-auth/useAccountSession";
import { greetingName, upcomingDeadlines, type DeadlineItem } from "@/lib/app/dashboard-command";
import {
  ActivityPanel,
  MarketplaceWorkspacePanel,
  PanelCard,
  QUICK_ACTIONS,
  ReputationPanel,
  useDashboardWorkspace,
  useReviewPrompts,
  useUnreadNotificationCount,
} from "@/components/overview/DashboardWorkspace";
import { CountUp, ProgressBar } from "@/components/overview/DashboardVisuals";
import {
  attentionQueue,
  contractProgressItems,
  dashboardRoleContext,
  freelancerPipeline,
  hiringPipeline,
  portfolioTotals,
  statusDistribution,
  type AttentionItem,
  type ContractProgressItem,
  type PipelineStep,
  type RoleContext,
  type StatusBucket,
} from "@/lib/app/dashboard-insights";
import { AlertCircle, BarChart3, CalendarClock, Gauge, Users } from "lucide-react";

const NAV_CARD_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

export function OverviewPage() {
  const {
    status,
    error,
    grouped,
    decimalsByMint,
    accountWallets,
    refresh,
  } = useContracts();
  const resolverCases = useResolverCases();
  const { now } = useNow(30_000);
  const router = useRouter();
  const ws = useDashboardWorkspace();
  const employerProposals = useEmployerProposals(ws.data?.jobs);
  const unreadNotifications = useUnreadNotificationCount();
  const reviewPrompts = useReviewPrompts(
    [...grouped.all]
      .filter((c) => c.status === "Completed")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((c) => c.address.toBase58())
  );

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
      <PageFade>
        <CommandHeader context={null} />
        <div className="mt-5">
          <EmptyState
            kind="contracts"
            title="Contracts are temporarily unavailable"
            body={`${error ?? "The RPC request failed."} Your contracts are safe on-chain; this only affects loading them here.`}
            action={{ label: "Retry", onClick: () => void refresh() }}
          />
        </div>
        <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-2">
          <MarketplaceWorkspacePanel ws={ws} />
          <ActivityPanel />
        </div>
      </PageFade>
    );
  }

  const summary = dashboardSummaryForWallets(accountWallets, grouped);
  const mintKeys = [...new Set(grouped.all.map((c) => c.tokenMint.toBase58()))];
  const sharedDecimals =
    mintKeys.length === 1 ? decimalsByMint[mintKeys[0]] : undefined;
  const mixedMints = mintKeys.length > 1;
  const streaming = liveStreamContracts(grouped.all, now);
  // Direct wallet vs contract.freelancer / contract.employer on each contract;
  // PendingAcceptance only, all four modes. Freelancer wins when both.
  const offers = offerSectionsForWallets(accountWallets, grouped.all, now);
  const actionItems = actionRequiredItemsForWallets(accountWallets, grouped.all, now);
  const pending = grouped.all.filter((c) => c.openReviewCount > 0);
  const recent = [...grouped.all]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);
  const roleContext = dashboardRoleContext(summary);
  const totals = portfolioTotals(grouped.all);
  const progressItems = contractProgressItems(grouped.all, now);
  const distribution = statusDistribution(grouped.all);
  const attention = attentionQueue({
    actionItems,
    offersToAnswer: offers.awaitingYourResponse,
    reviewContracts: pending,
    unreadMessages: unreadNotifications,
    pendingInvitations: ws.data ? ws.data.invitations.filter((i) => i.invitation.status === "pending").length : 0,
    reviewPrompts,
    proposals: employerProposals.items,
  });
  const hiringSteps = hiringPipeline({
    hiring: grouped.hiring,
    offersWaiting: offers.waitingForFreelancer.length,
    workspace: ws.data,
  });
  const workingSteps = freelancerPipeline({
    working: grouped.working,
    offersToAnswer: offers.awaitingYourResponse.length,
    workspace: ws.data,
  });

  return (
    <PageFade>
      <CommandHeader context={roleContext} />
      <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <AttentionPanel items={attention} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <DeadlinesPanel items={upcomingDeadlines(offers)} />
        </div>
      </div>
      <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-12">
        <Card className="relative overflow-hidden p-4 sm:p-5 lg:col-span-8">
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
          <div className="flex items-center gap-2 text-accent">
            <ShieldCheck size={15} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Protected value</p>
          </div>
          <h2 className="mt-1.5 font-display text-xl sm:text-2xl">Balances that stay in motion</h2>
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
          {grouped.all.length > 0 && !mixedMints ? (
            <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-3">
              <PortfolioFigure label="In escrow (live contracts)" value={formatTokenAmount(totals.inEscrow, sharedDecimals)} />
              <PortfolioFigure label="Released to date" value={formatTokenAmount(totals.released, sharedDecimals)} />
              <PortfolioFigure label={`Live contract value (${totals.liveCount})`} value={formatTokenAmount(totals.liveValue, sharedDecimals)} />
            </dl>
          ) : null}
        </Card>
        <Card className="flex flex-col justify-between overflow-hidden bg-[linear-gradient(180deg,#07111f,#0c1b2e)] p-4 sm:p-5 text-white lg:col-span-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan">Roles</p>
            <h2 className="mt-1.5 font-display text-xl sm:text-2xl">One wallet, both sides</h2>
            <p className="mt-1.5 text-sm leading-5 text-white/65">
              Hiring and working are per contract. You may employ someone and also work for someone
              else from the same address. {ROLE_TOTAL_LABELS.note}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Stat
              label={ROLE_TOTAL_LABELS.hiring}
              value={String(summary.hiring)}
              href="/contracts?role=hiring"
              dark
            />
            <Stat
              label={ROLE_TOTAL_LABELS.working}
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

      <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <ContractProgressPanel items={progressItems} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <StatusChartPanel buckets={distribution} />
        </div>
        <div className="min-w-0 lg:col-span-6">
          <PipelinePanel title="Hiring pipeline" steps={hiringSteps} tone="aqua" />
        </div>
        <div className="min-w-0 lg:col-span-6">
          <PipelinePanel title="Freelancer pipeline" steps={workingSteps} tone="violet" />
        </div>
        <div className="min-w-0 lg:col-span-12">
          <MarketplaceWorkspacePanel ws={ws} />
        </div>
        <div className="min-w-0 lg:col-span-7">
          <ActivityPanel />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <ReputationPanel />
        </div>
      </div>
      {actionItems.length > 0 ? <ActionRequiredSection items={actionItems} /> : null}

      {resolverCases.cases.length > 0 ? (
        <AssignedDisputesSection
          cases={resolverCases.cases}
          decimalsByMint={resolverCases.decimalsByMint}
        />
      ) : null}

      {offers.awaitingYourResponse.length > 0 ? (
        <OfferSection
          title={OFFER_SECTIONS_COPY.awaitingTitle}
          body={OFFER_SECTIONS_COPY.awaitingBody}
          icon={<Handshake size={16} className="text-accent" />}
          items={offers.awaitingYourResponse}
          decimalsByMint={decimalsByMint}
          primary
        />
      ) : null}

      {offers.waitingForFreelancer.length > 0 ? (
        <OfferSection
          title={OFFER_SECTIONS_COPY.waitingTitle}
          body={OFFER_SECTIONS_COPY.waitingBody}
          icon={<Send size={16} className="text-accent" />}
          items={offers.waitingForFreelancer}
          decimalsByMint={decimalsByMint}
        />
      ) : null}

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
                      {roleAwareStatusLabelForWallets(accountWallets, c, now)} · {c.openReviewCount} in review
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
                    {presentType(c.paymentMode)} · {roleAwareStatusLabelForWallets(accountWallets, c, now)}
                  </Link>
                  <p className="text-xs text-ink-faint">Created {formatUnix(c.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
      <div className="mt-6">
        <WhyPremiflowTeaser />
      </div>
    </PageFade>
  );
}

function OfferSection({
  title,
  body,
  icon,
  items,
  decimalsByMint,
  primary = false,
}: {
  title: string;
  body: string;
  icon: ReactNode;
  items: OfferListItem[];
  decimalsByMint: Readonly<Record<string, number | undefined>>;
  primary?: boolean;
}) {
  return (
    <section className="mt-5" aria-label={title}>
      <div className="mb-2.5">
        <h2 className="flex items-center gap-2 font-display text-xl">
          {icon}
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">{body}</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const copy = offerItemCopy(item);
          return (
            <li key={item.address}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{presentType(item.mode)}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      item.deadlinePassed ? "bg-gold-soft font-medium text-gold" : "bg-paper text-ink-soft"
                    }`}
                  >
                    {copy.statusLabel}
                  </span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink-faint">{copy.counterpartyLabel}</dt>
                  <dd className="font-mono text-xs leading-5" title={item.counterpartyAddress}>
                    {shortenAddress(item.counterpartyAddress)}
                  </dd>
                  <dt className="text-ink-faint">{OFFER_SECTIONS_COPY.amountLabel}</dt>
                  <dd>{formatTokenAmount(item.totalAmount, decimalsByMint[item.tokenMint])}</dd>
                  <dt className="text-ink-faint">{OFFER_SECTIONS_COPY.deadlineLabel}</dt>
                  <dd>{copy.deadlineText}</dd>
                </dl>
                <p
                  className={`text-xs ${
                    item.deadlinePassed ? "font-medium text-ink" : "text-ink-soft"
                  }`}
                >
                  {copy.deadlineNote}
                </p>
                <Link
                  href={item.href}
                  className={`mt-auto inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition ${
                    primary
                      ? "bg-accent text-white hover:opacity-90"
                      : "border border-line text-accent hover:bg-accent-soft"
                  } ${NAV_CARD_FOCUS}`}
                >
                  {copy.actionLabel}
                </Link>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ActionRequiredSection({ items }: { items: ActionRequiredItem[] }) {
  return (
    <section className="mt-5" aria-label={ACTION_REQUIRED_COPY.title}>
      <div className="mb-2.5">
        <h2 className="flex items-center gap-2 font-display text-xl">
          <ClipboardCheck size={16} className="text-accent" />
          {ACTION_REQUIRED_COPY.title}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">{ACTION_REQUIRED_COPY.body}</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.address}>
            <Card className="flex h-full flex-col gap-3 p-4">
              <p className="font-medium">{presentType(item.mode)}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-ink-faint">{OFFER_SECTIONS_COPY.freelancerLabel}</dt>
                <dd className="font-mono text-xs leading-5" title={item.freelancerAddress}>
                  {shortenAddress(item.freelancerAddress)}
                </dd>
              </dl>
              <p className="text-sm font-medium text-ink">{item.note}</p>
              <Link
                href={item.href}
                className={`mt-auto inline-flex min-h-10 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 ${NAV_CARD_FOCUS}`}
              >
                {item.actionLabel}
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommandHeader({ context }: { context: RoleContext | null }) {
  const { user } = useAccountSession();
  const name = greetingName(user);
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,#050b18_0%,#0a1830_45%,#121a3d_75%,#1d1546_100%)] px-4 py-5 text-white shadow-[0_30px_60px_-40px_rgba(46,230,214,.45)] sm:rounded-[28px] sm:px-6 sm:py-6">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-20 h-64 w-64 rounded-full bg-cyan/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -bottom-24 h-64 w-64 rounded-full bg-violet/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(46,230,214,.6),rgba(167,139,250,.6),transparent)]" />
      <div className="relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan">Command center</p>
            {context ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/90"
                title={context.detail}
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${
                    context.mode === "both"
                      ? "bg-[linear-gradient(90deg,#2ee6d6,#a78bfa)]"
                      : context.mode === "working"
                        ? "bg-violet"
                        : context.mode === "hiring"
                          ? "bg-cyan"
                          : "bg-white/50"
                  }`}
                />
                {context.label}
                <span className="sr-only">: {context.detail}</span>
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 break-words font-display text-[1.45rem] leading-tight sm:text-[1.9rem] [overflow-wrap:anywhere]">
            {name ? `Welcome back, ${name}` : "Welcome back"}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-white/65">
            {context && context.mode !== "new"
              ? `${context.detail}. Everything below is loaded from your contracts and marketplace activity.`
              : "Everything below is loaded from your contracts and marketplace activity. Nothing is estimated."}
          </p>
        </div>
        <nav aria-label="Quick actions" className="min-w-0">
          <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {QUICK_ACTIONS.map(({ href, label, icon: Icon }, i) => (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold transition ${NAV_CARD_FOCUS} ${
                    i === 0
                      ? "bg-[linear-gradient(135deg,#2ee6d6,#7c8cff)] text-[#04101f] shadow-[0_12px_30px_-14px_rgba(46,230,214,.9)] hover:brightness-105"
                      : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  <Icon size={15} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <PanelCard title="Needs your attention" icon={<AlertCircle size={15} aria-hidden="true" />}>
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">
          You are all caught up. Offers, reviews, setup steps and unread updates will appear here.
        </p>
      ) : (
        <ol className="space-y-2" aria-label="Today">
          {items.map((entry) => (
            <li key={entry.id} className="min-w-0">
              <Link
                href={entry.href}
                className={`flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border px-3 py-2.5 transition hover:border-accent/40 hover:bg-accent-soft/60 ${NAV_CARD_FOCUS} ${
                  entry.overdue
                    ? "border-gold/40 bg-gold-soft/60"
                    : entry.kind === "proposal"
                      ? "border-accent/50 bg-accent-soft/50"
                      : "border-line bg-paper/70"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${entry.overdue ? "bg-gold" : entry.kind === "proposal" ? "bg-accent" : entry.kind === "offer" ? "bg-cyan" : entry.kind === "messages" ? "bg-violet" : entry.kind === "feedback" ? "bg-gold" : "bg-accent"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{entry.title}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {entry.detail}
                    {entry.due ? ` - ${entry.overdue ? "was due" : "due"} ${formatUnix(entry.due)}` : ""}
                  </span>
                </span>
                {entry.cta ? (
                  <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                    {entry.cta}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </PanelCard>
  );
}
function PortfolioFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-paper/60 px-3 py-2.5">
      <dt className="truncate text-[11px] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 truncate font-display text-lg tabular-nums text-ink">{value}</dd>
    </div>
  );
}
function ContractProgressPanel({ items }: { items: ContractProgressItem[] }) {
  return (
    <PanelCard title="Contract progress" icon={<Gauge size={15} aria-hidden="true" />}>
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">No active contracts right now. Progress appears once a contract is live.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((entry) => (
            <li key={entry.address} className="min-w-0">
              <Link href={entry.href} className={`block min-w-0 rounded-2xl px-1 py-1 ${NAV_CARD_FOCUS}`}>
                <span className="flex min-w-0 items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-ink">
                    {entry.title}
                    {entry.status === "Disputed" ? <span className="ml-2 text-xs text-gold">In dispute</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">{shortenAddress(entry.address)}</span>
                </span>
                <span className="mt-2 block">
                  <ProgressBar value={entry.releasedPct} label={`${entry.title}: ${Math.round(entry.releasedPct)}% released`} />
                </span>
                <span className="mt-1 flex min-w-0 flex-wrap justify-between gap-x-3 text-xs text-ink-faint">
                  <span>{Math.round(entry.releasedPct)}% of value released</span>
                  {entry.stepLabel ? <span>{entry.stepLabel}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
function StatusChartPanel({ buckets }: { buckets: StatusBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((n, b) => n + b.count, 0);
  return (
    <PanelCard title="Contracts by stage" icon={<BarChart3 size={15} aria-hidden="true" />}>
      {total === 0 ? (
        <p className="text-sm text-ink-soft">No contracts loaded for your wallets yet.</p>
      ) : (
        <ul className="space-y-2.5" aria-label={`${total} contracts by stage`}>
          {buckets.map((b) => (
            <li key={b.key} className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs">
              <span className="truncate text-ink-soft">{b.label}</span>
              <ProgressBar value={(b.count / max) * 100} label={`${b.label}: ${b.count}`} tone={b.key === "active" ? "aqua" : "violet"} />
              <span className="text-right font-semibold tabular-nums text-ink">{b.count}</span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
function PipelinePanel({ title, steps, tone }: { title: string; steps: PipelineStep[]; tone: "aqua" | "violet" }) {
  return (
    <PanelCard title={title} icon={<Users size={15} aria-hidden="true" />}>
      <ol className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {steps.map((step, i) => (
          <li key={`${step.label}-${i}`} className="min-w-0">
            <Link
              href={step.href}
              aria-label={`${step.label}: ${step.value}`}
              className={`flex h-full min-h-[76px] min-w-0 flex-col justify-between rounded-2xl border border-line px-3 py-2.5 transition hover:border-accent/40 ${NAV_CARD_FOCUS} ${
                tone === "aqua" ? "bg-[linear-gradient(180deg,rgba(46,230,214,.08),transparent)]" : "bg-[linear-gradient(180deg,rgba(167,139,250,.10),transparent)]"
              }`}
            >
              <span className="text-[11px] leading-4 text-ink-faint">{step.label}</span>
              <span className="mt-1 font-display text-xl text-ink">
                <CountUp value={step.value} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </PanelCard>
  );
}

function DeadlinesPanel({ items }: { items: DeadlineItem[] }) {
  return (
    <PanelCard title="Deadlines" icon={<CalendarClock size={15} aria-hidden="true" />}>
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">No acceptance deadlines pending on loaded contracts.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li key={d.address} className="min-w-0">
              <Link
                href={d.href}
                className={`flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-2xl bg-paper px-3 py-2.5 transition hover:bg-accent-soft ${NAV_CARD_FOCUS}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{d.title}</span>
                  <span className="block text-xs text-ink-faint">
                    {d.passed ? "Passed " : "Due "}
                    {formatUnix(d.deadline)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint" title={d.address}>
                  {shortenAddress(d.address)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
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
  const reduceMotion = useReducedMotion();
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. Open matching contracts.`}
      className={`block cursor-pointer overflow-hidden rounded-[var(--radius)] border border-line bg-gradient-to-br p-3.5 shadow-[var(--shadow)] transition motion-safe:hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_18px_36px_-24px_rgba(18,194,184,.45)] active:translate-y-0 sm:p-4 ${NAV_CARD_FOCUS} ${tones[tone]} ${className}`}
    >
      <p className="flex items-center gap-2 text-[11px] font-medium text-ink-faint">
        {icon}
        {label}
      </p>
      <motion.p
        key={value}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-2 font-display text-2xl sm:text-3xl"
      >
        <CountUp value={value} />
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
