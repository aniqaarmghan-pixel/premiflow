"use client";
import Link from "next/link";
import { Compass, LayoutDashboard, MessagesSquare, MoreHorizontal, ScrollText, type LucideIcon } from "lucide-react";
import { isDashboardNavActive } from "@/lib/app/site-routes";

/** Mobile/tablet bottom navigation for the dashboard; every link is an existing route. */
export const BOTTOM_NAV_ITEMS: ReadonlyArray<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/", label: "Explore", icon: Compass },
  { href: "/contracts", label: "Contracts", icon: ScrollText },
  { href: "/activity", label: "Messages", icon: MessagesSquare },
];

export function DashboardBottomNav({
  pathname,
  onMore,
  moreOpen,
}: {
  pathname: string | null;
  onMore: () => void;
  moreOpen: boolean;
}) {
  return (
    <nav
      aria-label="Dashboard quick navigation"
      className="pf-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[rgba(5,11,24,.94)] pb-[env(safe-area-inset-bottom)] text-white backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {BOTTOM_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          // "/" is the public marketplace, so it is never the current dashboard page.
          const isCurrent = href !== "/" && isDashboardNavActive(href, pathname);
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={isCurrent ? "page" : undefined}
                className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan ${
                  isCurrent ? "text-cyan" : "text-white/70 hover:text-white"
                }`}
              >
                <Icon size={20} aria-hidden="true" />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <button
            type="button"
            onClick={onMore}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className="flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan"
          >
            <MoreHorizontal size={20} aria-hidden="true" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
