"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeftRight,
  BadgeCheck,
  Bookmark,
  Briefcase,
  CheckCircle2,
  CircleHelp,
  Compass,
  FilePlus2,
  Gavel,
  History,
  Inbox,
  Info,
  LayoutDashboard,
  MailOpen,
  Megaphone,
  Menu,
  Package,
  ScrollText,
  Send,
  Sparkles,
  Store,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { brand } from "@/lib/brand";
import { useAccountSession } from "@/lib/account-auth/useAccountSession";
import { useDialogFocus } from "@/lib/hooks/useDialogFocus";
import { RESOLVER_NAV, type WorkspaceMode } from "@/lib/app/resolver-workspace";
import { DASHBOARD_HREF, isDashboardNavActive, shellKind } from "@/lib/app/site-routes";
import { useWorkspace } from "@/lib/hooks/useWorkspace";
import { BrandMark } from "@/components/brand/BrandMark";
import { FloatingAssistant } from "@/components/copilot/FloatingAssistant";
import { PublicShell } from "@/components/site/PublicShell";
import { AccountControl } from "./AccountControl";
import { ClientOnly } from "./ClientOnly";
import { NetworkControl } from "./NetworkControl";
import { NotificationBell } from "./NotificationBell";
import { SoundPreference } from "./SoundPreference";
import { WalletControl } from "./WalletControl";
import { DashboardBottomNav } from "./DashboardBottomNav";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { title: string | null; items: ReadonlyArray<NavItem> };

/** Private dashboard sidebar. Every entry links to an existing route. */
const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    title: null,
    items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard }],
  },
  {
    title: "Work",
    items: [
      { href: "/marketplace/post", label: "Post a job", icon: Megaphone },
      { href: "/marketplace/gigs/new", label: "Offer a gig", icon: Sparkles },
      { href: "/marketplace/my-jobs", label: "My Jobs", icon: Briefcase },
      { href: "/marketplace/my-proposals", label: "My Proposals", icon: Send },
      { href: "/marketplace/my-gigs", label: "My Gigs", icon: Package },
      { href: "/marketplace/invitations", label: "Invitations", icon: MailOpen },
      { href: "/marketplace/saved", label: "Saved", icon: Bookmark },
    ],
  },
  {
    title: "Contracts",
    items: [
      { href: "/contracts", label: "Contracts", icon: ScrollText },
      { href: "/create", label: "Create contract", icon: FilePlus2 },
      { href: "/activity", label: "Messages & Activity", icon: Activity },
    ],
  },
  {
    title: "You",
    items: [
      { href: "/dashboard/reviews", label: "Reviews", icon: BadgeCheck },
      { href: "/marketplace/profile", label: "Profile", icon: UserRound },
    ],
  },
  {
    title: "PREMIFLOW",
    items: [
      { href: "/", label: "Marketplace", icon: Store },
      { href: "/about", label: "About", icon: Info },
      { href: "/support", label: "Help & Support", icon: CircleHelp },
    ],
  },
];

const RESOLVER_ICONS: Record<string, LucideIcon> = {
  "/resolver": Gavel,
  "/resolver/assigned": Inbox,
  "/resolver/resolved": CheckCircle2,
  "/resolver/activity": History,
  "/support": CircleHelp,
};

const RESOLVER_NAV_ITEMS = RESOLVER_NAV.map((item) => ({
  href: item.href as string,
  label: item.label as string,
  icon: RESOLVER_ICONS[item.href] ?? CircleHelp,
}));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const {
    data: session,
    isPending,
    status: sessionStatus,
    reconnecting,
    exhausted: sessionExhausted,
    retry: retrySession,
  } = useAccountSession();
  const drawerRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, drawerRef, () => setOpen(false));
  const workspace = useWorkspace();

  const user = session?.user ?? null;
  const kind = shellKind(pathname);
  const isPublicAuthPage = kind === "auth";
  // Marketplace discovery is public: no account gate and no wallet needed.
  const isPublicSite = kind === "public";

  useEffect(() => {
    // Only a confirmed "no session" (or a genuine 401) signs the tab out;
    // transient Neon/network failures keep the user and retry instead.
    if (isPending || isPublicAuthPage || isPublicSite || user || sessionStatus !== "unauthenticated") return;

    router.replace("/sign-in");
  }, [isPending, isPublicAuthPage, isPublicSite, router, sessionStatus, user]);

  // Authentication and password-recovery pages are intentionally outside the authenticated
  // application shell. Visitors should not see workspace navigation,
  // notifications or wallet controls before entering PREMIFLOW.
  if (isPublicAuthPage) {
    return (
      <div className="min-h-screen bg-paper">
        <header className="border-b border-line/80 bg-card/80 px-5 py-4 backdrop-blur-md sm:px-8">
          <div className="mx-auto flex w-full max-w-6xl items-center">
            <BrandMark size={34} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          {children}
        </main>
      </div>
    );
  }

  if (isPublicSite) {
    return (
      <PublicShell signedIn={Boolean(user)} pending={isPending}>
        {children}
      </PublicShell>
    );
  }

  // While Better Auth checks the existing PREMIFLOW session, show an
  // intentional entry state instead of rendering an empty dashboard.
  if (!user && reconnecting && sessionExhausted) {
    return <SessionUnavailable onRetry={retrySession} />;
  }

  if (isPending || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-6">
        <div className="text-center">
          <div className="flex justify-center">
            <BrandMark size={48} />
          </div>

          <p className="mt-5 text-sm font-semibold text-ink">
            Opening PREMIFLOW…
          </p>

          <p className="mt-2 text-sm text-ink-soft">
            {reconnecting ? "Reconnecting to your account. You have not been signed out." : "Checking your account session."}
          </p>

          <div
            className="mx-auto mt-5 h-1.5 w-40 overflow-hidden rounded-full bg-paper-2"
            aria-hidden="true"
          >
            <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan" />
          </div>
        </div>
      </div>
    );
  }
  const navGroups: ReadonlyArray<NavGroup> =
    workspace.mode === "resolver" ? [{ title: null, items: RESOLVER_NAV_ITEMS }] : NAV_GROUPS;
  const switchWorkspace = () => {
    const next = workspace.toggle();
    router.push(next === "resolver" ? "/resolver" : DASHBOARD_HREF);
  };

  return (
    <div className="pf-dashboard min-h-screen min-w-0 lg:grid lg:grid-cols-[216px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="pf-sidebar hidden bg-navy px-3.5 pt-5 text-white lg:px-3 lg:pt-4 lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col lg:self-start lg:overflow-hidden">
        <Link href={DASHBOARD_HREF} className="shrink-0 px-2">
          <BrandMark light size={44} />
          <p
            className="mt-3"
            style={{
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.45,
              color: "rgba(233, 238, 242, 0.82)",
            }}
          >
            {brand.tagline}
          </p>
        </Link>
        <div className="shrink-0">
          {workspace.canSwitch ? (
            <WorkspaceSwitch mode={workspace.mode} onToggle={switchWorkspace} />
          ) : null}
          {workspace.mode !== "resolver" ? <ExploreMarketplaceLink /> : null}
        </div>
        {/* Only this region scrolls; brand/switch/Explore stay pinned above it. */}
        <div className="pf-rail -mx-1 mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <nav aria-label="Dashboard sections" className="mt-2 flex shrink-0 flex-col gap-0.5">
          {navGroups.flatMap((group) => [
            group.title ? (
              <p
                key={`g-${group.title}`}
                className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35 lg:pt-3"
              >
                {group.title}
              </p>
            ) : null,
            ...group.items.map((item) => {
            const active = isDashboardNavActive(item.href, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                  active ? "text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="pf-nav-pill"
                    className="absolute inset-0 rounded-xl bg-white/10 shadow-[inset_0_0_0_1px_rgba(46,230,214,.4)]"
                    transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
                {active ? (
                  <span aria-hidden="true" className="absolute left-0 top-1/2 z-10 h-5 w-[3px] -translate-y-1/2 rounded-full bg-cyan" />
                ) : null}
                <Icon size={16} className={`relative z-10 ${active ? "text-cyan" : ""}`} />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
            }),
          ])}
        </nav>
        <div className="mt-auto shrink-0 space-y-3 rounded-2xl bg-white/5 px-3 py-3 lg:space-y-2 lg:py-2.5 text-[11px] leading-5 text-white/50">
          <p>Value stays in the contract until work is verified.</p>
          <ClientOnly>
            <SoundPreference compact />
          </ClientOnly>
        </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex min-w-0 items-center justify-between gap-2 border-b border-line/80 bg-[color-mix(in_srgb,var(--paper)_82%,white)] px-3 py-2.5 backdrop-blur-md sm:gap-3 sm:px-4 sm:py-3 lg:py-2">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 lg:hidden">
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-paper-2"
              aria-label="Open navigation"
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={() => setOpen(true)}
            >
              <Menu size={18} />
            </button>
            <BrandMark size={28} wordmark={false} />
            <span className="truncate font-extrabold tracking-[-0.06em] text-sm sm:text-base">
              {brand.name}
            </span>
          </div>
          <div className="hidden text-sm text-ink-faint lg:block">
            Protected freelance payments
          </div>
          <ClientOnly
            fallback={
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <div className="size-11 rounded-full border border-line bg-card sm:size-9" />
                <div className="h-10 w-16 rounded-full border border-line bg-card sm:w-20" />
                <div className="h-10 w-28 rounded-full border border-line bg-card sm:w-36" />
              </div>
            }
          >
            <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
              <NotificationBell />
              <NetworkControl />
              <AccountControl />
              <WalletControl />
            </div>
          </ClientOnly>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-hidden px-3 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pt-6 lg:px-6 lg:pb-8 lg:pt-4 2xl:max-w-7xl xl:px-8 2xl:max-w-7xl">
          {reconnecting ? (
            <div
              role="status"
              className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card px-4 py-2.5 text-sm text-ink-soft"
            >
              <span>
                {sessionExhausted
                  ? "PREMIFLOW is having trouble reaching your account. You are still signed in."
                  : "Reconnecting to PREMIFLOW. You are still signed in."}
              </span>
              {sessionExhausted ? (
                <button
                  type="button"
                  onClick={retrySession}
                  className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:bg-paper-2"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
          {children}
        </main>
        <ClientOnly>
          <FloatingAssistant />
        </ClientOnly>
        {workspace.mode !== "resolver" ? (
          <DashboardBottomNav pathname={pathname} moreOpen={open} onMore={() => setOpen(true)} />
        ) : null}
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[10000] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              tabIndex={-1}
              data-focus-skip
              aria-label="Close navigation"
              className="absolute inset-0 bg-navy/60 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
            />
            <motion.div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Dashboard navigation"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -12, opacity: 0 }}
              className="pf-rail relative flex h-full w-[min(19rem,88vw)] flex-col overflow-y-auto bg-navy p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-xl"
            >
              <div className="mb-6 flex items-center justify-between gap-3">
                <BrandMark light size={30} />
                <button
                  type="button"
                  aria-label="Close navigation"
                  data-autofocus
                  className="inline-flex size-11 items-center justify-center rounded-full hover:bg-white/10"
                  onClick={() => setOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              {workspace.canSwitch ? (
                <WorkspaceSwitch
                  mode={workspace.mode}
                  onToggle={() => {
                    setOpen(false);
                    switchWorkspace();
                  }}
                />
              ) : null}
              {workspace.mode !== "resolver" ? <ExploreMarketplaceLink onNavigate={() => setOpen(false)} /> : null}
              <nav aria-label="Dashboard" className="mt-2 flex flex-col">
              {navGroups.flatMap((group) => [
                group.title ? (
                  <p
                    key={`dg-${group.title}`}
                    className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40"
                  >
                    {group.title}
                  </p>
                ) : null,
                ...group.items.map((item) => {
                const active = isDashboardNavActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`mb-1 flex min-h-11 items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm ${
                      active
                        ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(46,230,214,.4)]"
                        : "text-white/75 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <item.icon size={17} className={active ? "text-cyan" : ""} />
                    {item.label}
                  </Link>
                );
                }),
              ])}
              </nav>
              <div className="mt-6 border-t border-white/10 pt-4">
                <ClientOnly>
                  <SoundPreference compact />
                </ClientOnly>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function WorkspaceSwitch({ mode, onToggle }: { mode: WorkspaceMode; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-2 mt-3 inline-flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/15 px-3 py-1.5 text-left text-xs text-white/75 transition hover:bg-white/10 hover:text-white"
    >
      <ArrowLeftRight size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">
        {mode === "resolver" ? "Switch to contracts workspace" : "Switch to resolver workspace"}
      </span>
    </button>
  );
}

function SessionUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div role="alert" className="max-w-sm text-center">
        <div className="flex justify-center">
          <BrandMark size={48} />
        </div>
        <p className="mt-5 text-sm font-semibold text-ink">PREMIFLOW is temporarily unavailable</p>
        <p className="mt-2 text-sm text-ink-soft">
          We could not reach your account service. You have not been signed out; this is usually brief.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 min-h-11 rounded-full bg-ink px-6 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

/** First, most prominent dashboard action: the public marketplace. */
function ExploreMarketplaceLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="group mt-4 flex min-h-12 min-w-0 items-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#2ee6d6,#7c8cff)] px-3.5 py-2.5 text-sm font-semibold text-[#04101f] shadow-[0_14px_30px_-16px_rgba(46,230,214,.9)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/35">
        <Compass size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate">Explore Marketplace</span>
        <span className="block truncate text-[11px] font-medium text-[#04101f]/70">Jobs, gigs and freelancers</span>
      </span>
    </Link>
  );
}
