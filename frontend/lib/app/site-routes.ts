/**
 * Site map for the marketplace-first layout. Pure data + helpers (no React,
 * no wallet, no network) so routing rules are unit-testable.
 *
 * - "public": marketplace discovery. Top navbar, no sidebar, no sign-in gate,
 *   no wallet needed to browse.
 * - "auth": sign-in / sign-up / password recovery.
 * - "app": the signed-in dashboard (sidebar shell, Better Auth session gate).
 */
export type ShellKind = "public" | "auth" | "app";

export const AUTH_PATHS: readonly string[] = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];

/** Discovery list pages that anyone can open. */
const PUBLIC_EXACT: readonly string[] = [
  "/",
  "/about",
  "/marketplace",
  "/marketplace/jobs",
  "/marketplace/gigs",
  "/marketplace/freelancers",
  "/marketplace/search",
];

/** Detail segments that are public, except the owner-only sub-pages below. */
const PUBLIC_DETAIL_PREFIXES: readonly string[] = ["/marketplace/jobs/", "/marketplace/gigs/", "/marketplace/profiles/"];

/** Owner/author pages under public prefixes that stay inside the dashboard. */
const PRIVATE_DETAIL_SEGMENTS: readonly string[] = ["new", "edit"];

export function normalizePath(pathname: string | null | undefined): string {
  if (!pathname) return "/";
  const path = pathname.split(/[?#]/)[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

export function shellKind(pathname: string | null | undefined): ShellKind {
  const path = normalizePath(pathname);
  if (AUTH_PATHS.includes(path)) return "auth";
  if (PUBLIC_EXACT.includes(path)) return "public";
  for (const prefix of PUBLIC_DETAIL_PREFIXES) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length).split("/").filter(Boolean);
    if (rest.length === 0) return "public";
    if (rest.some((segment) => PRIVATE_DETAIL_SEGMENTS.includes(segment))) return "app";
    return rest.length === 1 ? "public" : "app";
  }
  return "app";
}

/** Premium public navbar (marketplace-first). */
export const PUBLIC_NAV = [
  { href: "/marketplace/jobs", label: "Find Work" },
  { href: "/marketplace/post", label: "Hire Talent" },
  { href: "/marketplace/gigs", label: "Gigs" },
  { href: "/marketplace/freelancers", label: "Freelancers" },
  { href: "/#how-it-works", label: "How it works" },
] as const;

export const PUBLIC_SEARCH_HREF = "/marketplace/search";
export const DASHBOARD_HREF = "/dashboard";
export const SIGN_IN_HREF = "/sign-in";

/** Public navbar active state: detail pages light up their list tab. */
export function isPublicNavActive(href: string, pathname: string | null | undefined): boolean {
  if (href.includes("#")) return false;
  const path = normalizePath(pathname);
  if (path === href) return true;
  if (href === "/marketplace/freelancers") return path.startsWith("/marketplace/profiles/");
  return path.startsWith(`${href}/`);
}

/** Dashboard sidebar destinations (existing pages; no route was removed). */
export const DASHBOARD_NAV_HREFS = [
  "/dashboard",
  "/contracts",
  "/create",
  "/activity",
  "/marketplace/my-jobs",
  "/marketplace/my-proposals",
  "/marketplace/my-gigs",
  "/marketplace/invitations",
  "/marketplace/saved",
  "/dashboard/reviews",
  "/marketplace/profile",
  "/",
  "/about",
  "/support",
] as const;

/** Sidebar active state: roots match exactly, sections match by segment. */
export function isDashboardNavActive(href: string, pathname: string | null | undefined): boolean {
  const path = normalizePath(pathname);
  if (href === "/" || href === "/dashboard" || href === "/resolver") return path === href;
  return path === href || path.startsWith(`${href}/`);
}

/**
 * Moved/alias routes. Each source has a tiny server page that calls
 * redirect(); the old marketplace home now lives at "/".
 */
export const SITE_REDIRECTS = [
  { from: "/marketplace", to: "/" },
  { from: "/dashboard/jobs", to: "/marketplace/my-jobs" },
  { from: "/dashboard/proposals", to: "/marketplace/my-proposals" },
  { from: "/dashboard/gigs", to: "/marketplace/my-gigs" },
  { from: "/dashboard/invitations", to: "/marketplace/invitations" },
  { from: "/dashboard/saved", to: "/marketplace/saved" },
  { from: "/dashboard/profile", to: "/marketplace/profile" },
  { from: "/dashboard/contracts", to: "/contracts" },
  { from: "/dashboard/messages", to: "/activity" },
  { from: "/dashboard/activity", to: "/activity" },
] as const;

/** Where a signed-in account lands after sign-in / sign-up. */
export const POST_SIGN_IN_HREF = DASHBOARD_HREF;
