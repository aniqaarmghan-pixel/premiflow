import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  DASHBOARD_NAV_HREFS,
  POST_SIGN_IN_HREF,
  PUBLIC_NAV,
  SITE_REDIRECTS,
  isDashboardNavActive,
  isPublicNavActive,
  normalizePath,
  shellKind,
} from "@/lib/app/site-routes";
import { MARKETPLACE_DISCOVER_NAV, isMarketplaceNavActive } from "@/lib/app/marketplace";

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");
const exists = (rel: string) => existsSync(new URL(`../../../${rel}`, import.meta.url));

test("shellKind: marketplace discovery is public, owner pages stay in the dashboard", () => {
  for (const path of [
    "/",
    "/about",
    "/marketplace/jobs",
    "/marketplace/jobs/abc",
    "/marketplace/gigs",
    "/marketplace/gigs/g1",
    "/marketplace/freelancers",
    "/marketplace/profiles/Wa11et",
    "/marketplace/search",
    "/marketplace/jobs/",
  ]) {
    assert.equal(shellKind(path), "public", path);
  }
  for (const path of [
    "/dashboard",
    "/dashboard/reviews",
    "/contracts",
    "/contracts/abc",
    "/create",
    "/activity",
    "/support",
    "/resolver",
    "/resolver/assigned",
    "/marketplace/post",
    "/marketplace/my-jobs",
    "/marketplace/my-proposals",
    "/marketplace/my-gigs",
    "/marketplace/saved",
    "/marketplace/invitations",
    "/marketplace/profile",
    "/marketplace/gigs/new",
    "/marketplace/gigs/g1/edit",
    "/marketplace/jobs/j1/edit",
  ]) {
    assert.equal(shellKind(path), "app", path);
  }
  for (const path of ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"]) {
    assert.equal(shellKind(path), "auth", path);
  }
  assert.equal(shellKind(null), "public");
  assert.equal(normalizePath("/marketplace/jobs/?q=1"), "/marketplace/jobs");
});

test("public navbar: marketplace-first items, active states, search and dashboard entry", () => {
  assert.deepEqual(
    PUBLIC_NAV.map((n) => n.label),
    ["Find Work", "Hire Talent", "Gigs", "Freelancers", "How it works"]
  );
  assert.equal(isPublicNavActive("/marketplace/jobs", "/marketplace/jobs/abc"), true);
  assert.equal(isPublicNavActive("/marketplace/freelancers", "/marketplace/profiles/x"), true);
  assert.equal(isPublicNavActive("/marketplace/gigs", "/marketplace/jobs"), false);
  assert.equal(isPublicNavActive("/#how-it-works", "/"), false);
  const shell = read("components/site/PublicShell.tsx");
  for (const needle of ["PUBLIC_NAV", "PUBLIC_SEARCH_HREF", "DASHBOARD_HREF", "SIGN_IN_HREF", 'aria-label="PREMIFLOW marketplace home"', "<SiteFooter />"]) {
    assert.ok(shell.includes(needle), needle);
  }
  assert.match(shell, /href="\/"/);
  // No sidebar, no sign-in redirect and no wallet prompt on public pages.
  assert.doesNotMatch(shell, /<aside|router\.replace|setVisible\(true\)|useWalletModal|ensure\(\)/);
  assert.match(shell, /signedIn \? \(/);
  assert.match(read("components/marketplace/MarketplaceHome.tsx"), /id="how-it-works"/);
});

test("app shell: public pages skip the account gate; dashboard sidebar holds the workspace", () => {
  const shell = read("components/shell/AppShell.tsx");
  assert.match(shell, /const kind = shellKind\(pathname\);/);
  assert.match(shell, /if \(isPending \|\| isPublicAuthPage \|\| isPublicSite \|\| user\) return;/);
  assert.match(shell, /<PublicShell signedIn=\{Boolean\(user\)\} pending=\{isPending\}>/);
  assert.ok(shell.indexOf("if (isPublicSite)") < shell.indexOf("if (isPending || !user)"), "public shell renders before the gate");
  for (const label of ["Overview", "My Jobs", "My Proposals", "My Gigs", "Invitations", "Saved", "Contracts", "Messages & Activity", "Reviews", "Profile"]) {
    assert.ok(shell.includes(`label: "${label}"`), label);
  }
  for (const href of DASHBOARD_NAV_HREFS) {
    assert.ok(shell.includes(`href: "${href}"`), href);
  }
  assert.match(shell, /router\.push\(next === "resolver" \? "\/resolver" : DASHBOARD_HREF\)/);
  assert.equal(isDashboardNavActive("/dashboard", "/dashboard"), true);
  assert.equal(isDashboardNavActive("/dashboard", "/dashboard/reviews"), false);
  assert.equal(isDashboardNavActive("/", "/dashboard"), false);
  assert.equal(isDashboardNavActive("/contracts", "/contracts/abc"), true);
  assert.equal(isDashboardNavActive("/create", "/created"), false);
  assert.equal(isDashboardNavActive("/resolver", "/resolver/assigned"), false);
});

test("routes: / is the marketplace, /dashboard is the overview, moved routes redirect", () => {
  assert.match(read("app/page.tsx"), /<MarketplaceHome \/>/);
  assert.match(read("app/dashboard/page.tsx"), /<OverviewPage \/>/);
  assert.match(read("app/dashboard/reviews/page.tsx"), /MarketplaceTrustSummary/);
  const froms = SITE_REDIRECTS.map((r) => r.from);
  assert.equal(new Set(froms).size, froms.length);
  assert.deepEqual(SITE_REDIRECTS[0], { from: "/marketplace", to: "/" });
  for (const { from, to } of SITE_REDIRECTS) {
    const page = read(`app${from}/page.tsx`);
    assert.match(page, /import \{ redirect \} from "next\/navigation";/, from);
    assert.ok(page.includes(`redirect("${to}");`), `${from} -> ${to}`);
    assert.ok(to === "/" || exists(`app${to}/page.tsx`), `target exists: ${to}`);
  }
  // Every pre-existing page route still resolves.
  for (const route of [
    "about", "activity", "contracts", "contracts/[address]", "create", "support", "resolver", "resolver/assigned",
    "resolver/resolved", "resolver/activity", "sign-in", "sign-up", "forgot-password", "reset-password",
    "marketplace/jobs", "marketplace/jobs/[id]", "marketplace/jobs/[id]/edit", "marketplace/gigs", "marketplace/gigs/[id]",
    "marketplace/gigs/[id]/edit", "marketplace/gigs/new", "marketplace/freelancers", "marketplace/profiles/[wallet]",
    "marketplace/search", "marketplace/post", "marketplace/my-jobs", "marketplace/my-proposals", "marketplace/my-gigs",
    "marketplace/saved", "marketplace/invitations", "marketplace/profile",
  ]) {
    assert.ok(exists(`app/${route}/page.tsx`), route);
  }
  assert.equal(POST_SIGN_IN_HREF, "/dashboard");
  for (const page of ["app/sign-in/page.tsx", "app/sign-up/page.tsx"]) {
    const src = read(page);
    assert.match(src, /callbackURL: POST_SIGN_IN_HREF,/);
    assert.match(src, /router\.push\(POST_SIGN_IN_HREF\);/);
  }
  assert.equal(MARKETPLACE_DISCOVER_NAV[0].href, "/");
  assert.equal(isMarketplaceNavActive("/", "/"), true);
  assert.equal(isMarketplaceNavActive("/", "/marketplace/jobs"), false);
});

test("browse without a wallet: discovery views never require or prompt for one", () => {
  for (const file of [
    "components/marketplace/MarketplaceHome.tsx",
    "components/marketplace/MarketplaceBrowse.tsx",
    "components/marketplace/MarketplaceGigBrowse.tsx",
    "components/marketplace/MarketplaceFreelancers.tsx",
    "components/marketplace/MarketplaceSearch.tsx",
    "components/site/PublicShell.tsx",
    "components/site/SiteFooter.tsx",
    "components/site/Reveal.tsx",
  ]) {
    const src = read(file);
    assert.doesNotMatch(src, /useMarketplaceSession|useWalletModal|setVisible|signMessage|ensureMessagingSession/, file);
  }
  for (const file of [
    "components/marketplace/MarketplaceHome.tsx",
    "components/marketplace/MarketplaceBrowse.tsx",
    "components/marketplace/MarketplaceGigBrowse.tsx",
    "components/marketplace/MarketplaceFreelancers.tsx",
    "components/marketplace/MarketplaceSearch.tsx",
  ]) {
    assert.match(read(file), /<ErrorState title="[^"]+" error=\{\w+\.error\} onRetry=\{\w+\.reload\} \/>/, file);
  }
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  assert.match(parts, /export function ErrorState\(/);
  assert.match(parts, /Try again/);
});

test("reduced motion: every new animation is disabled and reveal content stays visible", () => {
  const css = read("app/globals.css");
  const reduceBlocks = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
  for (const cls of [".pf-hero-in", ".pf-page", ".pf-pop", ".pf-fill", ".pf-escrow-breathe", ".pf-reveal", ".pf-card", ".pf-zoom", ".pf-chip", ".pf-search", ".pf-flow-track", ".pf-flow-dot"]) {
    assert.ok(css.includes(`${cls} {`) || css.includes(`${cls}[`) || css.includes(`${cls},`), `defined: ${cls}`);
    assert.ok(reduceBlocks.includes(cls), `reduced-motion override: ${cls}`);
  }
  assert.match(css, /\.pf-reveal,\s*\.pf-reveal\[data-revealed="true"\] \{\s*opacity: 1;\s*transform: none;\s*transition: none;/);
  // No constant motion: the escrow glow runs a few times, then stops.
  assert.match(css, /\.pf-escrow-breathe \{\s*animation: pf-escrow-breathe 4\.8s ease-in-out 3;/);
  const reveal = read("components/site/Reveal.tsx");
  assert.match(reveal, /prefers-reduced-motion: reduce/);
  assert.match(reveal, /IntersectionObserver/);
  assert.match(reveal, /typeof IntersectionObserver === "undefined"/);
  assert.match(reveal, /observer\.disconnect\(\)/);
  const video = read("components/marketplace/MarketplaceHeroVideo.tsx");
  assert.match(video, /motion-reduce:hidden/);
});

test("safety: redesign files stay UI-only (no transactions, escrow math or program calls)", () => {
  const files = [
    "lib/app/site-routes.ts",
    "components/site/PublicShell.tsx",
    "components/site/SiteFooter.tsx",
    "components/site/Reveal.tsx",
    "components/marketplace/MarketplaceHome.tsx",
    "components/marketplace/MarketplaceParts.tsx",
    "components/shell/AppShell.tsx",
    "app/dashboard/page.tsx",
    "app/dashboard/reviews/page.tsx",
    ...readdirSync(new URL("../../../app/dashboard", import.meta.url), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "reviews")
      .map((d) => `app/dashboard/${d.name}/page.tsx`),
  ];
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(
      src,
      /sendTransaction|signTransaction|createContract\(|useStreamPayClient|streampay-v2\/(send|instructions)|lockedCreatePayment|uiAmountToBaseUnits|saveCreateDraft/,
      file
    );
  }
  // The optional hero video stays off unless an owned source is configured.
  assert.match(read("lib/app/marketplace-media.ts"), /export const MARKETPLACE_HERO_VIDEO: HeroVideoConfig \| null = null;/);
});
