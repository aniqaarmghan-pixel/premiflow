import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { Keypair } from "@solana/web3.js";

import { isMarketplaceNavActive, searchFormFromParams, buildSearchQuery, EMPTY_SEARCH, HOW_IT_WORKS } from "@/lib/app/marketplace";
import {
  CATEGORY_SLUGS,
  MARKETPLACE_CATEGORIES,
  categorizeText,
  categoryPattern,
  isCategorySlug,
  matchesCategory,
} from "@/lib/app/marketplace-categories";
import {
  HERO_VIDEO_MEDIA_QUERY,
  MARKETPLACE_HERO_VIDEO,
  isSafeHeroMediaSrc,
  resolveHeroVideo,
} from "@/lib/app/marketplace-media";
import { parseSearchParams } from "../marketplace/catalog-validation";
import {
  UNIFIED_SECTION_LIMIT,
  createGig,
  saveMyProfile,
  searchFreelancers,
  searchGigs,
  searchJobs,
  searchMarketplace,
  updateGig,
} from "../marketplace/catalog-service";
import { createMemoryMarketplaceStore } from "../marketplace/memory-store";
import { createJob } from "../marketplace/service";

const MINT = "So11111111111111111111111111111111111111112";
const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const wallet = () => Keypair.generate().publicKey.toBase58();
type Coded = { status?: number };
const bad = (err: Coded) => err.status === 400;
const qs = (value: string) => new URLSearchParams(value);

async function seed() {
  const store = createMemoryMarketplaceStore();
  const [w1, w2, w3, emp] = [wallet(), wallet(), wallet(), wallet()];
  const t = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, n));
  await saveMyProfile(
    store,
    {
      sessionWallet: w1,
      body: {
        displayName: "Ana",
        headline: "Solana smart contract engineer",
        bio: "Anchor programs and audits.",
        skills: ["rust", "anchor"],
        rateAmount: "90000000",
        portfolio: [{ title: "Vault", url: "https://example.com/vault", description: "x" }],
      },
    },
    t(1)
  );
  await saveMyProfile(
    store,
    { sessionWallet: w2, body: { displayName: "Bo", headline: "Brand designer", bio: "Logos", skills: ["figma"], rateAmount: "40000000" } },
    t(2)
  );
  // Incomplete: no headline or skills, no rate.
  await saveMyProfile(store, { sessionWallet: w3, body: { displayName: "Cy" } }, t(3));
  const g1 = await createGig(
    store,
    { sessionWallet: w1, body: { title: "Solana program audit", description: "Review your Anchor code.", skills: ["rust"], paymentMode: "Milestone", priceAmount: "500000000" }, tokenMint: MINT },
    t(4)
  );
  const g2 = await createGig(
    store,
    { sessionWallet: w2, body: { title: "Logo design", description: "Three concepts.", skills: ["figma"], paymentMode: "Fixed", priceAmount: "150000000" }, tokenMint: MINT },
    t(5)
  );
  const g3 = await createGig(
    store,
    { sessionWallet: w2, body: { title: "Email newsletter build", description: "Templates for your list.", skills: [], paymentMode: "Fixed", priceAmount: "80000000" }, tokenMint: MINT },
    t(6)
  );
  await createJob(store, { sessionWallet: emp, title: "Need an AI chatbot", description: "LLM support bot.", paymentMode: "Hourly", budgetAmount: "30000000", tokenMint: MINT }, t(7));
  await createJob(store, { sessionWallet: emp, title: "Website redesign", description: "Figma to Next.js.", paymentMode: "Fixed", budgetAmount: "900000000", tokenMint: MINT }, t(8));
  return { store, w1, w2, w3, g1, g2, g3 };
}

/* ---------------- validation ---------------- */

test("discovery search params: category and sort are strict, default newest", () => {
  const def = parseSearchParams(qs(""));
  assert.equal(def.sort, "newest");
  assert.equal(def.category, null);
  assert.equal(parseSearchParams(qs("category=web3&sort=amount_desc")).category, "web3");
  assert.equal(parseSearchParams(qs("sort=amount_asc")).sort, "amount_asc");
  for (const value of ["category=crypto%27--", "category=WEB3", "sort=rating", "sort=random()", "sort=amount_asc;drop"]) {
    assert.throws(() => parseSearchParams(qs(value)), bad, value);
  }
});

test("discovery categories: eight fixed slugs, whole-word mapping, constant pattern", () => {
  assert.deepEqual([...CATEGORY_SLUGS], ["development", "web3", "design", "ai", "video", "marketing", "writing", "business"]);
  assert.deepEqual(MARKETPLACE_CATEGORIES.map((c) => c.label), ["Development", "Web3", "Design", "AI", "Video", "Marketing", "Writing", "Business"]);
  assert.ok(categorizeText("Solana smart contract audit").includes("web3"));
  assert.ok(categorizeText("UI design in Figma").includes("design"));
  assert.ok(categorizeText("Need an AI chatbot").includes("ai"));
  assert.ok(categorizeText("Figma to Next.js").includes("development"));
  // Whole words only: "email" does not mean AI, "build" does not mean UI design.
  assert.equal(matchesCategory("Email newsletter build", "ai"), false);
  assert.equal(matchesCategory("Email newsletter build", "design"), false);
  assert.equal(matchesCategory("nextxjs", "development"), false);
  assert.equal(isCategorySlug("web3"), true);
  assert.equal(isCategorySlug("Web3"), false);
  for (const slug of CATEGORY_SLUGS) {
    const pattern = categoryPattern(slug);
    assert.doesNotThrow(() => new RegExp(pattern, "i"));
    assert.match(pattern, /^\(\^\|\[\^a-z0-9\]\)\(.+\)\(\[\^a-z0-9\]\|\$\)$/);
  }
});

/* ---------------- search + sort ---------------- */

test("discovery search: category filter and price sorting for gigs and jobs", async () => {
  const { store } = await seed();
  const titles = async (q: string) => (await searchGigs(store, qs(q))).map((g) => g.title);
  assert.deepEqual(await titles("category=web3"), ["Solana program audit"]);
  assert.deepEqual(await titles("category=design"), ["Logo design"]);
  assert.deepEqual(await titles("sort=amount_asc"), ["Email newsletter build", "Logo design", "Solana program audit"]);
  assert.deepEqual(await titles("sort=amount_desc"), ["Solana program audit", "Logo design", "Email newsletter build"]);
  assert.deepEqual(await titles(""), ["Email newsletter build", "Logo design", "Solana program audit"]);
  const jobs = async (q: string) => (await searchJobs(store, qs(q))).map((j) => j.title);
  assert.deepEqual(await jobs("category=ai"), ["Need an AI chatbot"]);
  assert.deepEqual(await jobs("sort=amount_desc"), ["Website redesign", "Need an AI chatbot"]);
  assert.deepEqual(await jobs("sort=amount_asc&limit=1"), ["Need an AI chatbot"]);
});

test("discovery gig cards carry the seller's public summary only", async () => {
  const { store, w1 } = await seed();
  const [card] = await searchGigs(store, qs("category=web3"));
  assert.deepEqual(card.seller, { wallet: w1, displayName: "Ana", avatarUrl: null, headline: "Solana smart contract engineer" });
});

test("discovery freelancers: safe fields, featured = complete profiles, rate sort nulls last", async () => {
  const { store, w1, w2, w3 } = await seed();
  const all = await searchFreelancers(store, qs(""));
  assert.deepEqual(all.map((f) => f.wallet), [w3, w2, w1]);
  for (const card of all) {
    assert.deepEqual(Object.keys(card).sort(), ["availability", "avatarUrl", "displayName", "headline", "rateAmount", "skills", "updatedAt", "wallet"]);
    assert.ok(!("bio" in card) && !("portfolio" in card) && !("createdAt" in card));
  }
  assert.deepEqual((await searchFreelancers(store, qs("featured=1"))).map((f) => f.wallet), [w2, w1]);
  assert.deepEqual((await searchFreelancers(store, qs("sort=amount_asc"))).map((f) => f.wallet), [w2, w1, w3]);
  assert.deepEqual((await searchFreelancers(store, qs("sort=amount_desc"))).map((f) => f.wallet), [w1, w2, w3]);
  assert.deepEqual((await searchFreelancers(store, qs("category=web3"))).map((f) => f.wallet), [w1]);
  assert.deepEqual((await searchFreelancers(store, qs("min=50000000"))).map((f) => f.wallet), [w1]);
  assert.deepEqual((await searchFreelancers(store, qs("q=designer"))).map((f) => f.wallet), [w2]);
  await assert.rejects(searchFreelancers(store, qs("featured=yes")), bad);
  await assert.rejects(searchFreelancers(store, qs("sort=best")), bad);
});

test("discovery unified search: typed, bounded sections, paused gigs excluded", async () => {
  const { store, w2, g2 } = await seed();
  const all = await searchMarketplace(store, qs("q=design"));
  assert.equal(all.type, "all");
  assert.deepEqual(all.gigs.map((g) => g.title), ["Logo design"]);
  assert.deepEqual(all.freelancers.map((f) => f.displayName), ["Bo"]);
  // Free text is a substring match ("redesign"); categories are whole-word.
  assert.deepEqual(all.jobs.map((j) => j.title), ["Website redesign"]);
  const onlyGigs = await searchMarketplace(store, qs("type=gigs"));
  assert.equal(onlyGigs.gigs.length, 3);
  assert.deepEqual(onlyGigs.jobs, []);
  assert.deepEqual(onlyGigs.freelancers, []);
  await assert.rejects(searchMarketplace(store, qs("type=users")), bad);
  await assert.rejects(searchMarketplace(store, qs("sort=hot")), bad);
  for (let i = 0; i < UNIFIED_SECTION_LIMIT + 3; i += 1) {
    await createGig(store, { sessionWallet: wallet(), body: { title: `Bulk ${i}`, description: "d", paymentMode: "Fixed", priceAmount: "1" }, tokenMint: MINT });
  }
  assert.equal((await searchMarketplace(store, qs(""))).gigs.length, UNIFIED_SECTION_LIMIT);
  assert.equal((await searchMarketplace(store, qs("limit=50"))).gigs.length, UNIFIED_SECTION_LIMIT);
  assert.equal((await searchMarketplace(store, qs("limit=2"))).gigs.length, 2);
  await updateGig(store, { sessionWallet: w2, gigId: g2.id, body: { action: "pause" } });
  assert.deepEqual((await searchMarketplace(store, qs("q=logo"))).gigs, []);
});

test("discovery SQL: parameterized category/sort, bounded wallet batch, no raw SQL", () => {
  const db = read("lib/server/db/marketplace-store.ts");
  assert.doesNotMatch(db, /sql\.raw/);
  assert.match(db, /~\* \$\{pattern\}/);
  assert.match(db, /numeric asc nulls last/);
  assert.match(db, /numeric desc nulls last/);
  assert.match(db, /\.slice\(0, 50\)/);
  for (const route of ["app/api/marketplace/freelancers/route.ts", "app/api/marketplace/search/route.ts"]) {
    const src = read(route);
    assert.match(src, /export async function GET/);
    assert.doesNotMatch(src, /export async function (POST|PATCH|PUT|DELETE)/);
  }
});

/* ---------------- client helpers ---------------- */

test("discovery client: search form round-trip, unknown URL values dropped", () => {
  const form = searchFormFromParams(qs("q=logo&category=design&sort=amount_desc&mode=Fixed&min=1500000&skill=figma"), 6, isCategorySlug);
  assert.deepEqual(form, { q: "logo", skills: "figma", mode: "Fixed", minUi: "1.5", maxUi: "", category: "design", sort: "amount_desc" });
  const dropped = searchFormFromParams(qs("category=evil&sort=evil&mode=Barter&min=abc"), 6, isCategorySlug);
  assert.deepEqual(dropped, EMPTY_SEARCH);
  const built = buildSearchQuery({ ...EMPTY_SEARCH, category: "web3", sort: "amount_asc" }, 6);
  assert.deepEqual(built, { ok: true, qs: "?category=web3&sort=amount_asc" });
  assert.deepEqual(buildSearchQuery({ ...EMPTY_SEARCH, sort: "newest" }, 6), { ok: true, qs: "" });
});

test("discovery nav: one active discovery tab, management pages exact", () => {
  assert.equal(isMarketplaceNavActive("/marketplace", "/marketplace"), true);
  assert.equal(isMarketplaceNavActive("/marketplace", "/marketplace/jobs"), false);
  assert.equal(isMarketplaceNavActive("/marketplace/jobs", "/marketplace/jobs/abc"), true);
  assert.equal(isMarketplaceNavActive("/marketplace/gigs", "/marketplace/gigs/abc"), true);
  assert.equal(isMarketplaceNavActive("/marketplace/gigs", "/marketplace/gigs/new"), false);
  assert.equal(isMarketplaceNavActive("/marketplace/gigs/new", "/marketplace/gigs/new"), true);
  assert.equal(isMarketplaceNavActive("/marketplace/freelancers", "/marketplace/profiles/xyz"), true);
  assert.equal(isMarketplaceNavActive("/marketplace/profile", "/marketplace/profiles/xyz"), false);
  assert.equal(isMarketplaceNavActive("/marketplace/my-jobs", "/marketplace/my-jobs/"), true);
  assert.equal(isMarketplaceNavActive("/marketplace/jobs", null), false);
  for (const page of ["jobs", "gigs", "freelancers", "search", "my-jobs", "my-proposals", "my-gigs", "profile", "post", "gigs/new"]) {
    assert.ok(existsSync(path.join(ROOT, `app/marketplace/${page}/page.tsx`)), page);
  }
});

test("discovery hero video: optional, safe sources, reduced motion and mobile skip it", () => {
  assert.equal(MARKETPLACE_HERO_VIDEO, null);
  assert.match(HERO_VIDEO_MEDIA_QUERY, /min-width: 768px/);
  assert.match(HERO_VIDEO_MEDIA_QUERY, /prefers-reduced-motion: no-preference/);
  for (const src of ["/media/hero.mp4", "https://cdn.example.com/hero.mp4"]) assert.equal(isSafeHeroMediaSrc(src), true, src);
  for (const src of ["http://x.com/a.mp4", "//evil.com/a.mp4", "javascript:alert(1)", "data:video/mp4;base64,AA", "", "https://u:p@x.com/a.mp4"]) {
    assert.equal(isSafeHeroMediaSrc(src), false, src);
  }
  assert.equal(resolveHeroVideo({ src: "http://x.com/a.mp4" }), null);
  assert.deepEqual(resolveHeroVideo({ src: "/a.mp4", poster: "javascript:x" }), { src: "/a.mp4", type: undefined });
  const video = read("components/marketplace/MarketplaceHeroVideo.tsx");
  for (const attr of [/\bmuted\b/, /\bautoPlay\b/, /\bloop\b/, /\bplaysInline\b/, /preload="metadata"/, /aria-hidden="true"/, /motion-reduce:hidden/, /\bhidden\b[^"]*md:block/, /useSyncExternalStore/, /const serverAllows = \(\) => false/]) {
    assert.match(video, attr);
  }
  assert.doesNotMatch(video, /preload="auto"/);
  const css = read("app/globals.css");
  assert.match(css, /@layer base \{\s*a \{\s*color: inherit;/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.pf-lift,\s*\.pf-lift:hover \{\s*transform: none;\s*transition: none;/);
  assert.match(read("components/marketplace/MarketplaceParts.tsx"), /animate-pulse[^"]*motion-reduce:animate-none/);
});

test("discovery home: honest sections, no fake social proof, five workflow steps", () => {
  const home = read("components/marketplace/MarketplaceHome.tsx");
  assert.deepEqual(HOW_IT_WORKS.map((s) => s.title), ["Discover", "Agree", "Escrow", "Deliver", "Get paid"]);
  for (const section of ["Latest gigs", "Latest jobs", "Featured freelancers", "How PREMIFLOW works", "Escrow and security"]) {
    assert.ok(home.includes(section), section);
  }
  assert.match(home, /FEATURED_NOTE/);
  assert.match(read("components/site/SiteFooter.tsx"), /<footer/);
  assert.match(read("components/site/PublicShell.tsx"), /<SiteFooter \/>/);
  const marketplace = read("lib/app/marketplace.ts");
  assert.match(marketplace, /Not ranked, reviewed or endorsed/);
  for (const src of [home, marketplace, read("components/marketplace/MarketplaceParts.tsx")]) {
    assert.doesNotMatch(src, /\b(rating|ratings|reviews?:|stars|testimonial|trusted by|guaranteed payment|audited)\b/i);
  }
  assert.doesNotMatch(home, /<video/);
  assert.doesNotMatch(read("components/marketplace/MarketplaceHeroVideo.tsx"), /\.(mp4|webm)"/);
});
