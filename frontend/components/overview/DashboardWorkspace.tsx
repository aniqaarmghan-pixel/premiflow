"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Award, Bell, ChevronRight, Compass, FilePlus2, Megaphone, RefreshCw, Sparkles, Store } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  DASHBOARD_WORKSPACE_HREFS,
  isMarketplaceWorkspaceEmpty,
  marketplaceWorkspaceCards,
  reputationLine,
  type MarketplaceWorkspaceData,
} from "@/lib/app/dashboard-command";
import { MARKETPLACE_COPY } from "@/lib/app/marketplace";
import {
  fetchMyGigs,
  fetchMyInvitations,
  fetchMyJobs,
  fetchMyProposals,
  fetchTrustSummary,
} from "@/lib/app/marketplace-client";
import { notificationHrefPath } from "@/lib/app/notifications-ui";
import { fetchNotifications, fetchUnreadNotificationCount } from "@/lib/app/notifications-client";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

async function loadWorkspace(): Promise<MarketplaceWorkspaceData> {
  const [jobs, proposals, gigs, invitations] = await Promise.all([
    fetchMyJobs(),
    fetchMyProposals(),
    fetchMyGigs(),
    fetchMyInvitations(),
  ]);
  return { jobs: jobs.jobs, proposals: proposals.items, gigs: gigs.gigs, invitations: invitations.items };
}

/** Section frame shared by the command-center panels. */
export function PanelCard({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 font-display text-lg">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            {icon}
          </span>
          <span className="min-w-0 truncate">{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function RetryButton({ onClick, label = "Try again" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-accent transition hover:bg-accent-soft ${FOCUS}`}
    >
      <RefreshCw size={14} aria-hidden="true" />
      {label}
    </button>
  );
}

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-2xl bg-paper motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-medium text-accent ${FOCUS}`}
    >
      {label}
      <ChevronRight size={14} aria-hidden="true" />
    </Link>
  );
}

/** One shared load of the wallet's marketplace listings for every dashboard panel. */
export function useDashboardWorkspace() {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(session.wallet ? `dash-workspace:${session.wallet}` : null, loadWorkspace);
  const [verifying, setVerifying] = useState(false);
  async function verify() {
    setVerifying(true);
    try {
      await session.ensure();
      query.reload();
    } catch {
      // Keep the verify prompt.
    } finally {
      setVerifying(false);
    }
  }
  const data = query.status === "ready" ? query.data : null;
  return { session, query, verify, verifying, data };
}
export type DashboardWorkspaceState = ReturnType<typeof useDashboardWorkspace>;

/** Unread notification count (same endpoint as the bell); null when unavailable. */
export function useUnreadNotificationCount(): number | null {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(session.wallet ? `dash-unread:${session.wallet}` : "dash-unread", fetchUnreadNotificationCount);
  return query.status === "ready" ? query.data.unreadCount : null;
}

/** Jobs, proposals, gigs and invitations for the connected wallet (marketplace APIs). */
export function MarketplaceWorkspacePanel({ ws }: { ws: DashboardWorkspaceState }) {
  const { session, query, verify, verifying } = ws;
  let body: ReactNode;
  if (!session.wallet) {
    body = <p className="text-sm text-ink-soft">{MARKETPLACE_COPY.connectWallet} Your jobs, proposals and gigs appear here.</p>;
  } else if (query.status === "error" && query.error.status === 401) {
    body = (
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-soft">{MARKETPLACE_COPY.verifyWalletNote}</p>
        <button
          type="button"
          onClick={() => void verify()}
          disabled={verifying}
          className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 ${FOCUS}`}
        >
          {MARKETPLACE_COPY.verifyWallet}
        </button>
      </div>
    );
  } else if (query.status === "error") {
    body = (
      <div role="alert" className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-soft">Marketplace activity is temporarily unavailable. {query.error.message}</p>
        <RetryButton onClick={query.reload} />
      </div>
    );
  } else if (query.status !== "ready") {
    body = <PanelSkeleton rows={2} />;
  } else if (isMarketplaceWorkspaceEmpty(query.data)) {
    body = (
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-soft">
          Nothing here yet. Post a job, publish a gig or send a proposal to get started.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/marketplace/post" className={`inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white ${FOCUS}`}>
            Post a job
          </Link>
          <Link href="/marketplace/jobs" className={`inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-accent ${FOCUS}`}>
            Find work
          </Link>
        </div>
      </div>
    );
  } else {
    body = (
      <ul className="grid min-w-0 grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 xl:grid-cols-4">
        {marketplaceWorkspaceCards(query.data).map((card) => (
          <li key={card.key} className="min-w-0">
            <Link
              href={card.href}
              aria-label={`${card.label}: ${card.value}. ${card.detail}.`}
              className={`pf-card flex h-full min-h-[96px] min-w-0 flex-col justify-between rounded-2xl border border-line bg-paper/70 p-3.5 transition hover:border-accent/40 hover:bg-accent-soft/60 ${FOCUS}`}
            >
              <span className="text-xs font-medium text-ink-faint">{card.label}</span>
              <span className="mt-1 font-display text-2xl tabular-nums text-ink">{card.value}</span>
              <span className="mt-1 break-words text-xs text-ink-faint [overflow-wrap:anywhere]">{card.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <PanelCard title="Marketplace" icon={<Store size={15} aria-hidden="true" />} action={<SeeAll href={DASHBOARD_WORKSPACE_HREFS.jobs} label="Manage" />}>
      {body}
    </PanelCard>
  );
}

/** Reputation computed server-side from verified reviews only. */
export function ReputationPanel() {
  const session = useMarketplaceSession();
  const wallet = session.wallet;
  const query = useMarketplaceQuery(wallet ? `dash-trust:${wallet}` : null, () => fetchTrustSummary(wallet ?? ""));
  let body: ReactNode;
  if (!wallet) {
    body = <p className="text-sm text-ink-soft">Connect your wallet to see reputation from verified reviews.</p>;
  } else if (query.status === "error") {
    body = (
      <div role="alert" className="space-y-3">
        <p className="text-sm text-ink-soft">Could not load verified reviews right now.</p>
        <RetryButton onClick={query.reload} />
      </div>
    );
  } else if (query.status !== "ready") {
    body = <PanelSkeleton rows={1} />;
  } else {
    const summary = query.data.summary;
    body = (
      <div className="space-y-2">
        <p className="text-sm leading-6 text-ink">{reputationLine(summary)}</p>
        {summary.reviewCount > 0 ? (
          <p className="text-xs text-ink-faint">
            As freelancer: {summary.asFreelancerCount} - As employer: {summary.asEmployerCount}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <PanelCard title="Reputation" icon={<Award size={15} aria-hidden="true" />} action={<SeeAll href={DASHBOARD_WORKSPACE_HREFS.reviews} label="Reviews" />}>
      {body}
    </PanelCard>
  );
}

/** Latest notifications (messages, offers, lifecycle) from the same feed as the bell. */
export function ActivityPanel() {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(session.wallet ? `dash-activity:${session.wallet}` : "dash-activity", () =>
    fetchNotifications({ limit: 5 })
  );
  let body: ReactNode;
  if (query.status === "error" && query.error.status === 401) {
    body = (
      <p className="text-sm text-ink-soft">
        Verify your wallet from the bell to load messages and activity. Verification signs a message, not a transaction.
      </p>
    );
  } else if (query.status === "error") {
    body = (
      <div role="alert" className="space-y-3">
        <p className="text-sm text-ink-soft">Activity is temporarily unavailable.</p>
        <RetryButton onClick={query.reload} />
      </div>
    );
  } else if (query.status !== "ready") {
    body = <PanelSkeleton rows={3} />;
  } else if (query.data.notifications.length === 0) {
    body = <p className="text-sm text-ink-soft">No activity yet. Messages, offers and contract updates will appear here.</p>;
  } else {
    body = (
      <ul className="divide-y divide-line">
        {query.data.notifications.map((item) => {
          const path = notificationHrefPath(item.href) ?? DASHBOARD_WORKSPACE_HREFS.activity;
          const unread = !item.readAt;
          return (
            <li key={item.id} className="min-w-0">
              <Link href={path} className={`flex min-h-11 min-w-0 items-start gap-2.5 rounded-xl py-2.5 ${FOCUS}`}>
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? "bg-accent" : "bg-line"}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {item.title}
                    {unread ? <span className="sr-only"> (unread)</span> : null}
                  </span>
                  <span className="block truncate text-xs text-ink-faint">{item.body}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <PanelCard
      title="Messages & activity"
      icon={<Bell size={15} aria-hidden="true" />}
      action={<SeeAll href={DASHBOARD_WORKSPACE_HREFS.activity} label="All activity" />}
    >
      {body}
    </PanelCard>
  );
}

/** Command-center quick actions; Explore Marketplace always comes first. */
export const QUICK_ACTIONS = [
  { href: "/", label: "Explore Marketplace", icon: Compass },
  { href: "/marketplace/post", label: "Post Job", icon: Megaphone },
  { href: "/marketplace/gigs/new", label: "Offer Gig", icon: Sparkles },
  { href: "/create", label: "Create Protected Contract", icon: FilePlus2 },
] as const;
