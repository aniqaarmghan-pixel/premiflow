import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { formatMarketplaceAmount, gigPriceLabel } from "@/lib/app/marketplace";
import {
  DEMO_BADGE_LABEL,
  DEMO_SKILL_TAG,
  DEMO_TOKEN_LABEL,
  DEVNET_DEMO_NOTICE,
  isDemoListing,
  showDevnetDemoNotice,
  withoutDemoTag,
} from "@/lib/app/marketplace-demo";
import { lockedCreatePayment, paymentTokenLabel } from "@/lib/app/premiflow";
import { buildDemoSeedData } from "@/lib/server/marketplace/demo-seed";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const NOW = new Date("2026-10-07T00:00:00Z");
const parts = () => read("components/marketplace/MarketplaceParts.tsx");
const between = (src: string, start: string, end: string) => {
  const from = src.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = src.indexOf(end, from + start.length);
  assert.ok(to > from, `missing ${end}`);
  return src.slice(from, to);
};

test("devnet notice: exact copy, rendered once from the marketplace hero header", () => {
  assert.equal(DEVNET_DEMO_NOTICE, "Devnet demo marketplace \u2014 sample listings and profiles.");
  assert.equal(showDevnetDemoNotice("devnet"), true);
  assert.equal(showDevnetDemoNotice("mainnet-beta"), false);
  const src = parts();
  const hero = between(src, "if (hero) {", "<MarketplaceNav className=\"mt-6\" />");
  assert.match(hero, /showDevnetDemoNotice\(\) \? <DevnetDemoNotice/);
  assert.equal(src.match(/<DevnetDemoNotice\b/g)?.length, 1, "rendered from exactly one place");
  assert.match(between(src, "export function DevnetDemoNotice", "export function DemoBadge"), /role="note"[\s\S]*\{DEVNET_DEMO_NOTICE\}/);
});

test("demo badge: seed records detected by the demo tag; tag chip replaced by a Demo badge", () => {
  const data = buildDemoSeedData(NOW);
  for (const item of [...data.profiles, ...data.gigs, ...data.jobs]) {
    assert.ok(isDemoListing(item));
    assert.ok(!withoutDemoTag(item.skills).includes(DEMO_SKILL_TAG));
  }
  assert.equal(isDemoListing({ skills: ["rust", "anchor"] }), false);
  assert.equal(isDemoListing({ skills: ["Devnet Demo"] }), true);
  assert.equal(DEMO_BADGE_LABEL, "Demo");

  const src = parts();
  assert.match(between(src, "export function DemoBadge", "export function StatusPill"), /\{DEMO_BADGE_LABEL\}/);
  const job = between(src, "export function JobSummaryCard", "export function JobTags");
  const gig = between(src, "export function GigSummaryCard", "export function FreelancerSummaryCard");
  const freelancer = between(src, "export function FreelancerSummaryCard", "export function SkeletonGrid");
  for (const [name, card] of [["job", job], ["gig", gig], ["freelancer", freelancer]] as const) {
    assert.match(card, /const demo = isDemoListing\(/, name);
    assert.match(card, /\{demo \? <DemoBadge/, name);
  }
  assert.match(job, /<JobTags job=\{job\} className="mt-3" showDemoBadge=\{false\} \/>/);
  assert.match(gig, /<SkillList skills=\{withoutDemoTag\(gig\.skills\)\.slice\(0, 4\)\} \/>/);
  assert.match(freelancer, /<SkillList skills=\{withoutDemoTag\(freelancer\.skills\)\.slice\(0, 5\)\} \/>/);
  // Raw "devnet demo" chips never render; detail pages get the badge through SkillList / JobTags.
  assert.match(between(src, "export function SkillList", "const COVER_GRADIENTS"), /withoutDemoTag\(skills\)[\s\S]*<DemoBadge/);
  assert.match(between(src, "export function JobTags", "export function NoticeText"), /withoutDemoTag\(job\.skills\)[\s\S]*<DemoBadge/);
  // Card design kept: reputation summary still preloaded.
  assert.match(freelancer, /<VerifiedReputationBadge wallet=\{freelancer\.wallet\} summary=\{freelancer\.reputation\}/);
});

test("demo token label: short Devnet label on demo cards; mint and default label unchanged", () => {
  const locked = lockedCreatePayment();
  const base = (1200n * 10n ** BigInt(locked.decimals)).toString();
  assert.equal(DEMO_TOKEN_LABEL, "Devnet test token");
  assert.equal(formatMarketplaceAmount(base, { demo: true }), `1200 ${DEMO_TOKEN_LABEL}`);
  assert.equal(formatMarketplaceAmount(base), `1200 ${locked.tokenName}`);
  assert.doesNotMatch(formatMarketplaceAmount(base, { demo: true }), /PREMIFLOW Test Token|USDC/);
  assert.match(gigPriceLabel({ paymentMode: "Fixed", priceAmount: base, packages: [] }, { demo: true }), /Devnet test token$/);
  assert.equal(paymentTokenLabel(locked.mint), "PREMIFLOW Test Token");

  const src = parts();
  assert.match(src, /formatMarketplaceAmount\(job\.budgetAmount, \{ demo \}\)/);
  assert.match(src, /gigPriceLabel\(gig, \{ demo \}\)/);
  assert.match(src, /formatMarketplaceAmount\(freelancer\.rateAmount, \{ demo \}\)/);
});

test("demo seed presentation: no (demo) names; previews start with real content", () => {
  const data = buildDemoSeedData(NOW);
  for (const p of data.profiles) {
    assert.doesNotMatch(p.displayName, /\(demo\)|\bdemo\b/i, p.displayName);
    assert.doesNotMatch(p.headline, /devnet demo/i);
  }
  const texts = [...data.profiles.map((p) => p.bio), ...data.gigs.map((g) => g.description), ...data.jobs.map((j) => j.description)];
  for (const text of texts) {
    // Card previews (line-clamp) show the first paragraph; the short note trails at the end.
    const preview = text.split("\n\n")[0];
    assert.doesNotMatch(preview, /devnet demo|fictional/i, preview);
    assert.match(text, /\n\nDevnet demo (profile|gig|job): fictional, not a real person\.$|\n\nDevnet demo (gig|job): fictional sample, not a real (offer|client)\.$/);
  }
});

test("sticky header: anchor targets clear the fixed public navbar at every breakpoint", () => {
  const shell = read("components/site/PublicShell.tsx");
  assert.match(shell, /fixed inset-x-0 top-0/);
  assert.match(shell, /h-16 [^"]*sm:h-\[72px\] [^"]*lg:h-\[76px\] [^"]*xl:h-20/);
  assert.match(shell, /id="pf-main"/);
  const css = read("app/globals.css");
  assert.match(css, /--pf-public-nav-h: 64px;/);
  assert.match(css, /@media \(min-width: 40rem\) \{\s*:root \{\s*--pf-public-nav-h: 72px;/);
  assert.match(css, /@media \(min-width: 64rem\) \{\s*:root \{\s*--pf-public-nav-h: 76px;/);
  assert.match(css, /@media \(min-width: 80rem\) \{\s*:root \{\s*--pf-public-nav-h: 80px;/);
  assert.match(css, /@layer base \{\s*#pf-main \[id\] \{\s*scroll-margin-top: calc\(var\(--pf-public-nav-h\) \+ 16px\);/);
});