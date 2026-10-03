import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { shellKind } from "@/lib/app/site-routes";

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");
const exists = (rel: string) => existsSync(new URL(`../../../${rel}`, import.meta.url));

test("public navbar and hero: Sign in / Join / Dashboard, no prominent Connect Wallet", () => {
  const shell = read("components/site/PublicShell.tsx");
  assert.doesNotMatch(shell, /WalletControl|useWallet|useWalletModal|Connect wallet/i);
  for (const label of ["Sign in", "Join PREMIFLOW", "Dashboard"]) assert.ok(shell.includes(label), label);
  const home = read("components/marketplace/MarketplaceHome.tsx");
  assert.doesNotMatch(home, /WalletControl|useWallet|useWalletModal|Connect wallet/i);
  for (const page of ["MarketplaceBrowse", "MarketplaceGigBrowse", "MarketplaceFreelancers", "MarketplaceSearch"]) {
    assert.doesNotMatch(read(`components/marketplace/${page}.tsx`), /WalletControl|useWalletModal|Connect wallet/i, page);
  }
  // The dashboard keeps its wallet controls.
  assert.match(read("components/shell/AppShell.tsx"), /<WalletControl \/>/);
});

test("wallet is requested only next to hire / apply actions, on click", () => {
  const prompt = read("components/site/WalletActionPrompt.tsx");
  assert.match(prompt, /onClick=\{\(\) => setVisible\(true\)\}/);
  assert.doesNotMatch(prompt, /useEffect|connect\(\)|select\(/);
  assert.match(read("components/marketplace/MarketplaceGigDetail.tsx"), /<WalletActionPrompt message=\{MARKETPLACE_COPY\.connectWallet\} action="Connect wallet to hire" \/>/);
  assert.match(read("components/marketplace/MarketplaceJobDetail.tsx"), /<WalletActionPrompt message=\{MARKETPLACE_COPY\.connectWallet\} action="Connect wallet to apply" \/>/);
});

test("hero media: aurora fallback, optional owned video/poster, config stays null", () => {
  assert.match(read("lib/app/marketplace-media.ts"), /MARKETPLACE_HERO_VIDEO: HeroVideoConfig \| null = null;/);
  const home = read("components/marketplace/MarketplaceHome.tsx");
  assert.match(home, /<Aurora className="-z-10" \/>/);
  assert.ok(home.indexOf("<Aurora") < home.indexOf("<MarketplaceHeroVideo />"));
  const video = read("components/marketplace/MarketplaceHeroVideo.tsx");
  assert.match(video, /if \(!video\.poster\) return null;/);
  assert.match(video, /src=\{video\.poster\}/);
  assert.match(read("components/site/Aurora.tsx"), /aria-hidden="true"/);
});

test("category art is original inline SVG with no external assets", () => {
  const art = read("components/site/CategoryArt.tsx");
  assert.match(art, /<svg/);
  assert.doesNotMatch(art, /https?:|<image|xlinkHref|href=|lucide|import .* from "(?!react")/);
  for (const slug of ["development", "web3", "design", "ai", "video", "marketing", "writing", "business"]) {
    assert.ok(art.includes(`case "${slug}"`), slug);
  }
  assert.match(read("components/marketplace/MarketplaceHome.tsx"), /<CategoryArt slug=\{c\.slug\}/);
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  assert.match(parts, /<CategoryArt slug=\{primary\}/);
  assert.match(parts, /pf-play/);
});

test("discovery pages share the homepage hero band", () => {
  for (const page of ["MarketplaceBrowse", "MarketplaceGigBrowse", "MarketplaceFreelancers", "MarketplaceSearch"]) {
    assert.match(read(`components/marketplace/${page}.tsx`), /<MarketplaceHeader\s+hero\s/, page);
  }
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  assert.match(parts, /if \(hero\) \{/);
  assert.match(parts, /<Aurora /);
  assert.match(parts, /<MarketplaceNav className="mt-6" \/>/);
});

test("reduced motion: aurora and play affordance are static; dashboard surface is calm", () => {
  const css = read("app/globals.css");
  const reduce = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
  for (const sel of [".pf-aurora > span", ".pf-play", ".pf-hero-in", ".pf-reveal", ".pf-zoom", ".pf-search", ".pf-pop", ".pf-flow-track"]) {
    assert.ok(reduce.includes(sel), sel);
  }
  assert.match(css, /\.pf-aurora > span:nth-child\(1\) \{[^}]*animation: pf-aurora-a 26s/);
  assert.match(css, /\.pf-dashboard \{\s*background: var\(--paper\);/);
  assert.match(read("components/shell/AppShell.tsx"), /className="pf-dashboard /);
});

test("routes preserved and public/private split unchanged", () => {
  for (const route of ["", "dashboard", "dashboard/reviews", "contracts", "create", "activity", "support", "resolver", "marketplace/jobs", "marketplace/gigs", "marketplace/freelancers", "marketplace/search", "marketplace/post", "marketplace/my-jobs", "marketplace/gigs/new", "marketplace/profile"]) {
    assert.ok(exists(`app/${route ? `${route}/` : ""}page.tsx`), route || "/");
  }
  assert.equal(shellKind("/marketplace/gigs/abc"), "public");
  assert.equal(shellKind("/marketplace/post"), "app");
  assert.equal(shellKind("/create"), "app");
});

test("safety: polish files are UI-only", () => {
  for (const file of [
    "components/site/CategoryArt.tsx",
    "components/site/Aurora.tsx",
    "components/site/WalletActionPrompt.tsx",
    "components/site/PublicShell.tsx",
    "components/marketplace/MarketplaceHome.tsx",
    "components/marketplace/MarketplaceParts.tsx",
    "components/marketplace/MarketplaceHeroVideo.tsx",
  ]) {
    assert.doesNotMatch(
      read(file),
      /sendTransaction|signTransaction|createContract\(|useStreamPayClient|streampay-v2\/(send|instructions)|saveCreateDraft|fetch\(/,
      file
    );
  }
});

test("public pages show discovery nav only; management lives in the dashboard sidebar", () => {
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  assert.match(parts, /\{shellKind\(pathname\) === "app" \? \(\s*<nav aria-label="Manage marketplace"/);
  assert.equal(shellKind("/marketplace/jobs"), "public");
  assert.equal(shellKind("/marketplace/profiles/w"), "public");
  assert.equal(shellKind("/marketplace/my-jobs"), "app");
  const shell = read("components/shell/AppShell.tsx");
  for (const href of ["/marketplace/post", "/marketplace/gigs/new", "/marketplace/my-jobs", "/marketplace/my-proposals", "/marketplace/my-gigs", "/marketplace/profile", "/marketplace/saved", "/marketplace/invitations"]) {
    assert.ok(shell.includes(`href: "${href}"`), href);
  }
});
