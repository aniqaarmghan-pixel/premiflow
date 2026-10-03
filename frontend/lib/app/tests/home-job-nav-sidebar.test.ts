import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("homepage order: hero, categories, latest jobs, gigs, freelancers, then the rest", () => {
  const home = read("components/marketplace/MarketplaceHome.tsx");
  const at = (marker: string) => {
    const i = home.indexOf(marker);
    assert.ok(i > 0, marker);
    return i;
  };
  const order = [
    at("{/* Hero:"),
    at("{/* Light: categories */}"),
    at('title="Latest jobs"'),
    at('title="Latest gigs"'),
    at('title="Featured freelancers"'),
    at("{/* Media:"),
    at('id="how-it-works"'),
    at("{/* Dark: escrow and security */}"),
    at("{/* Premium CTA */}"),
  ];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(home, /href="\/marketplace\/jobs"\s+cta="All jobs"/);
  assert.match(home, /<JobSummaryCard job=\{job\} wholeCardLink \/>/);
});

test("latest job card: whole-card Link overlay, keyboard, pointer/focus ring, inner stopPropagation", () => {
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  const card = parts.slice(parts.indexOf("export function JobSummaryCard"), parts.indexOf("export function JobTags"));
  assert.match(card, /href=\{`\/marketplace\/jobs\/\$\{job\.id\}`\}/);
  assert.match(card, /after:absolute after:inset-0/);
  assert.match(card, /cursor-pointer/);
  assert.match(card, /focus-within:ring-2 focus-within:ring-accent/);
  assert.match(card, /event\.key === " "/);
  assert.match(card, /event\.currentTarget\.click\(\)/);
  assert.match(card, /event\.stopPropagation\(\)/);
  assert.match(card, /relative z-\[2\][^"]*" onClick=\{stopInner\}[\s\S]*<ProfileLink/);
  assert.match(card, /<div className="relative z-\[2\]" onClick=\{stopInner\} onKeyDown=\{stopInner\}>\s*\{footer\}/);
});

test("desktop sidebar: full 100dvh height, internal nav scroll, hidden scrollbar, bottom padding", () => {
  const shell = read("components/shell/AppShell.tsx");
  const aside = shell.slice(shell.indexOf("<aside"), shell.indexOf("</aside>"));
  assert.match(aside, /lg:sticky lg:top-0 lg:flex lg:h-\[100dvh\] lg:flex-col/);
  assert.match(aside, /lg:overflow-hidden/);
  assert.match(aside, /pf-rail [^"]*min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain/);
  assert.match(aside, /pb-\[calc\(6rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.ok(aside.indexOf('aria-label="Dashboard sections"') > aside.indexOf("overflow-y-auto"));
  assert.match(shell, /label: "Profile"/);
  const css = read("app/globals.css");
  assert.match(css, /\.pf-sidebar \{\s*height: 100vh;\s*height: 100dvh;/);
  assert.match(css, /\.pf-rail::-webkit-scrollbar \{\s*display: none;/);
});
