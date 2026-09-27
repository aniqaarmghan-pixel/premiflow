"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CircleHelp,
  FilePlus2,
  Info,
  LayoutDashboard,
  Menu,
  ScrollText,
  X,
} from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { brand } from "@/lib/brand";
import { BrandMark } from "@/components/brand/BrandMark";
import { FloatingAssistant } from "@/components/copilot/FloatingAssistant";
import { ClientOnly } from "./ClientOnly";
import { NetworkControl } from "./NetworkControl";
import { NotificationBell } from "./NotificationBell";
import { SoundPreference } from "./SoundPreference";
import { WalletControl } from "./WalletControl";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/contracts", label: "Contracts", icon: ScrollText },
  { href: "/create", label: "Create contract", icon: FilePlus2 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/about", label: "About", icon: Info },
  { href: "/support", label: "Help & Support", icon: CircleHelp },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen min-w-0 lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden bg-navy px-4 py-6 text-white lg:flex lg:flex-col">
        <Link href="/" className="px-2">
          <BrandMark light size={56} />
          <p
            className="mt-4"
            style={{
              fontSize: 14.5,
              fontWeight: 500,
              lineHeight: 1.45,
              color: "rgba(233, 238, 242, 0.82)",
            }}
          >
            {brand.tagline}
          </p>
        </Link>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm transition ${
                  active ? "text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="pf-nav-pill"
                    className="absolute inset-0 rounded-2xl bg-white/10 shadow-[inset_0_0_0_1px_rgba(46,230,214,.4)]"
                    transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
                <Icon size={16} className={`relative z-10 ${active ? "text-cyan" : ""}`} />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 rounded-2xl bg-white/5 px-3 py-3 text-[11px] leading-5 text-white/50">
          <p>Value stays in the contract until work is verified.</p>
          <ClientOnly>
            <SoundPreference compact />
          </ClientOnly>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex min-w-0 items-center justify-between gap-2 border-b border-line/80 bg-[color-mix(in_srgb,var(--paper)_82%,white)] px-3 py-2.5 backdrop-blur-md sm:gap-3 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 lg:hidden">
            <button
              type="button"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-paper-2"
              aria-label="Open navigation"
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
              <WalletControl />
            </div>
          </ClientOnly>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-hidden px-3 pb-28 pt-5 sm:px-6 sm:pb-24 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-6">
          {children}
        </main>
        <ClientOnly>
          <FloatingAssistant />
        </ClientOnly>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[10000] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} />
            <motion.nav
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -12, opacity: 0 }}
              className="relative flex h-full w-[min(18rem,88vw)] flex-col overflow-y-auto bg-navy p-5 text-white shadow-xl"
            >
              <div className="mb-6 flex items-center justify-between gap-3">
                <BrandMark light size={30} />
                <button
                  type="button"
                  aria-label="Close navigation"
                  className="inline-flex size-10 items-center justify-center rounded-full hover:bg-white/10"
                  onClick={() => setOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="mb-1 flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white"
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              ))}
              <div className="mt-6 border-t border-white/10 pt-4">
                <ClientOnly>
                  <SoundPreference compact />
                </ClientOnly>
              </div>
            </motion.nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
