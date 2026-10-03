"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, LogIn, Menu, Search, X } from "lucide-react";

import { BrandMark } from "@/components/brand/BrandMark";
import {
  DASHBOARD_HREF,
  PUBLIC_NAV,
  PUBLIC_SEARCH_HREF,
  SIGN_IN_HREF,
  isPublicNavActive,
} from "@/lib/app/site-routes";

import { SiteFooter } from "./SiteFooter";

/**
 * Public marketplace shell: premium top navbar, no dashboard sidebar and no
 * sign-in gate. Browsing never needs a wallet, so the navbar offers Sign in /
 * Join / Dashboard only; a wallet is requested next to post, hire or contract
 * actions (WalletActionPrompt) and inside the dashboard.
 */
export function PublicShell({
  children,
  signedIn,
  pending,
}: {
  children: React.ReactNode;
  signedIn: boolean;
  pending: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isHome = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const solid = scrolled || !isHome || open;

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-paper">
      <a
        href="#pf-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-300 ${
          !isHome
            ? "border-b border-white/10 bg-[var(--midnight)]"
            : solid
            ? "pf-glass border-b border-white/10 shadow-[0_12px_40px_-24px_rgba(0,0,0,.7)]"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-8">
          <Link href="/" aria-label="PREMIFLOW marketplace home" className="shrink-0">
            {/* ~8% larger on phones (no overflow at 360px), ~35% larger from sm up. */}
            <span className="inline-flex sm:hidden">
              <BrandMark light size={34} wordmarkFontSize="1.3rem" />
            </span>
            <span className="hidden sm:inline-flex">
              <BrandMark light size={44} wordmarkFontSize="1.64rem" />
            </span>
          </Link>

          <nav aria-label="Marketplace" className="ml-6 hidden min-w-0 items-center gap-0.5 lg:flex xl:ml-10 xl:gap-1">
            {PUBLIC_NAV.map((item) => {
              const active = isPublicNavActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`pf-chip rounded-full border px-3 py-2 text-[0.9rem] font-medium tracking-[-0.01em] xl:px-4 ${
                    active ? "border-aqua/60 text-white" : "border-transparent text-white/70 hover:text-white"
                  }`}
                >
                  <span className={active ? "text-white" : ""}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
            <Link
              href={PUBLIC_SEARCH_HREF}
              aria-label="Search the marketplace"
              aria-current={isPublicNavActive(PUBLIC_SEARCH_HREF, pathname) ? "page" : undefined}
              className="pf-chip inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-3 text-sm text-white/80 hover:border-white/30 hover:text-white"
            >
              <Search size={16} aria-hidden="true" />
              <span className="hidden xl:inline">Search</span>
            </Link>
            {pending ? (
              <span className="hidden h-10 w-28 rounded-full border border-white/10 bg-white/5 sm:block" aria-hidden="true" />
            ) : signedIn ? (
              <>
                <Link
                  href={DASHBOARD_HREF}
                  className="hidden h-10 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#12c2b8,#4f8cff_60%,#8b7bff)] px-4 text-sm font-semibold shadow-[0_14px_30px_-16px_rgba(46,230,214,.8)] transition hover:brightness-110 sm:inline-flex"
                >
                  <LayoutDashboard size={16} aria-hidden="true" className="text-white" />
                  <span className="text-white">Dashboard</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={SIGN_IN_HREF}
                  className="hidden h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-white/85 hover:text-white sm:inline-flex"
                >
                  <LogIn size={16} aria-hidden="true" />
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="hidden h-10 items-center rounded-full bg-white px-4 text-sm font-semibold transition hover:bg-white/90 sm:inline-flex"
                >
                  <span className="text-ink">Join PREMIFLOW</span>
                </Link>
              </>
            )}
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10 lg:hidden"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="pf-public-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {open ? (
          <div id="pf-public-menu" className="pf-page border-t border-white/10 px-4 pb-5 pt-3 lg:hidden">
            <nav aria-label="Marketplace mobile" className="flex flex-col gap-1">
              {PUBLIC_NAV.map((item) => {
                const active = isPublicNavActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center rounded-2xl px-3 text-base font-medium ${
                      active ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {signedIn ? (
                <Link
                  href={DASHBOARD_HREF}
                  onClick={() => setOpen(false)}
                  className="col-span-2 flex min-h-11 items-center justify-center rounded-full bg-white text-sm font-semibold"
                >
                  <span className="text-ink">Open dashboard</span>
                </Link>
              ) : (
                <>
                  <Link
                    href={SIGN_IN_HREF}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-white"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/sign-up"
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center justify-center rounded-full bg-white text-sm font-semibold"
                  >
                    <span className="text-ink">Join</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <main
        id="pf-main"
        key={pathname}
        className={`pf-page min-w-0 flex-1 ${
          isHome ? "" : "mx-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8 lg:pt-[104px] 2xl:max-w-7xl"
        }`}
      >
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
