import Link from "next/link";

import { BrandMark } from "@/components/brand/BrandMark";

const COLUMNS = [
  {
    title: "Discover",
    links: [
      { href: "/marketplace/jobs", label: "Find work" },
      { href: "/marketplace/gigs", label: "Gigs" },
      { href: "/marketplace/freelancers", label: "Freelancers" },
      { href: "/marketplace/search", label: "Search" },
    ],
  },
  {
    title: "Hire and earn",
    links: [
      { href: "/marketplace/post", label: "Post a job" },
      { href: "/marketplace/gigs/new", label: "Offer a gig" },
      { href: "/create", label: "Create contract" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "PREMIFLOW",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/about", label: "About" },
      { href: "/support", label: "Help & Support" },
      { href: "/contracts", label: "Contracts" },
    ],
  },
] as const;

/** Premium public footer (static links only). */
export function SiteFooter() {
  return (
    <footer className="pf-midnight relative overflow-hidden border-t border-white/10">
      <div aria-hidden="true" className="pf-grid-fade pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.3fr_2fr] lg:px-8">
        <div className="max-w-sm">
          <BrandMark light size={36} />
          <p className="mt-4 text-sm leading-6 text-white/65">
            A marketplace where every agreement becomes an on-chain contract. Funds sit in escrow until the work is
            delivered and approved.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aqua">{col.title}</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-white/70 transition hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <p className="mx-auto w-full max-w-7xl px-4 py-5 text-xs text-white/45 sm:px-6 lg:px-8">
          Marketplace listings are off-chain. Contracts, escrow and payments run on the PREMIFLOW Solana program.
        </p>
      </div>
    </footer>
  );
}
