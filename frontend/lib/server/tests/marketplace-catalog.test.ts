import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  GIG_LIMITS,
  PROFILE_LIMITS,
  SEARCH_LIMITS,
  escapeLike,
  parseSearchParams,
  validateProfileInput,
} from "../marketplace/catalog-validation";
import {
  createGig,
  deleteGig,
  getGigDetail,
  getGigHandoff,
  getMyProfile,
  getProfilePage,
  listMyGigs,
  saveMyProfile,
  searchGigs,
  searchJobs,
  updateGig,
} from "../marketplace/catalog-service";
import { createMemoryMarketplaceStore } from "../marketplace/memory-store";
import { createJob } from "../marketplace/service";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const OTHER = WALLET_C.toBase58();
const MINT = "So11111111111111111111111111111111111111112";
const T0 = new Date("2026-10-01T00:00:00Z");
const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

type Coded = { status?: number; code?: string };
const status = (s: number, c?: string) => (err: Coded) => err.status === s && (!c || err.code === c);

function gigBody(overrides: Record<string, unknown> = {}) {
  return {
    title: " Logo design ",
    description: "Three logo concepts and revisions.",
    skills: ["Design", " logo ", "design"],
    paymentMode: "Fixed",
    priceAmount: "150000000",
    ...overrides,
  };
}

async function setupGig() {
  const store = createMemoryMarketplaceStore();
  const gig = await createGig(store, { sessionWallet: FREELANCER, body: gigBody(), tokenMint: MINT }, T0);
  return { store, gig };
}

/* ---------------- profile validation ---------------- */

test("catalog profile: valid input is cleaned; skills normalized and deduped", () => {
  const p = validateProfileInput({
    displayName: "  Ana  ",
    avatarUrl: "https://cdn.example.com/a.png",
    headline: "Designer",
    bio: "Hello",
    skills: ["React", " react ", "UI Design"],
    rateAmount: "25000000",
    availability: "limited",
    portfolio: [{ title: "Site", url: "https://example.com/work", description: "A site" }],
  });
  assert.equal(p.displayName, "Ana");
  assert.equal(p.avatarUrl, "https://cdn.example.com/a.png");
  assert.equal(p.skills.length, 2);
  assert.equal(p.rateAmount, "25000000");
  assert.equal(p.availability, "limited");
  assert.equal(p.portfolio.length, 1);
  const empty = validateProfileInput({});
  assert.equal(empty.avatarUrl, null);
  assert.equal(empty.rateAmount, null);
  assert.equal(empty.availability, "available");
  assert.deepEqual(empty.portfolio, []);
});

test("catalog profile: avatar and portfolio URLs must be https with a real host", () => {
  const bad = [
    "http://example.com/a.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "https://user:pass@example.com/a.png",
    "https://localhost/a.png",
    "https://intranet/a.png",
    "//example.com/a.png",
    "https://exa mple.com/a.png",
    "https://example.com/" + "a".repeat(PROFILE_LIMITS.url),
  ];
  for (const url of bad) {
    assert.throws(() => validateProfileInput({ avatarUrl: url }), status(400), url);
    assert.throws(
      () => validateProfileInput({ portfolio: [{ title: "x", url, description: "" }] }),
      status(400),
      url
    );
  }
});

test("catalog profile: lengths, skills, portfolio, availability and rate are bounded", () => {
  const over = (n: number) => "x".repeat(n + 1);
  assert.throws(() => validateProfileInput({ displayName: over(PROFILE_LIMITS.displayName) }), status(400));
  assert.throws(() => validateProfileInput({ headline: over(PROFILE_LIMITS.headline) }), status(400));
  assert.throws(() => validateProfileInput({ bio: over(PROFILE_LIMITS.bio) }), status(400));
  const manySkills = Array.from({ length: PROFILE_LIMITS.skills + 1 }, (_, i) => `skill${i}`);
  assert.throws(() => validateProfileInput({ skills: manySkills }), status(400));
  assert.throws(() => validateProfileInput({ skills: 42 }), status(400));
  assert.throws(() => validateProfileInput({ skills: ["<script>"] }), status(400));
  assert.deepEqual(validateProfileInput({ skills: "React, node" }).skills, ["react", "node"]);
  const item = { title: "t", url: "https://example.com", description: "" };
  assert.throws(
    () => validateProfileInput({ portfolio: Array.from({ length: PROFILE_LIMITS.portfolio + 1 }, () => item) }),
    status(400)
  );
  assert.throws(() => validateProfileInput({ portfolio: [{ ...item, title: "" }] }), status(400));
  assert.throws(() => validateProfileInput({ availability: "busy" }), status(400));
  for (const rate of ["-1", "1.5", "abc", "18446744073709551616"]) {
    assert.throws(() => validateProfileInput({ rateAmount: rate }), status(400), rate);
  }
});

test("catalog profile: owner-only by session wallet; body wallet is ignored", async () => {
  const store = createMemoryMarketplaceStore();
  await assert.rejects(saveMyProfile(store, { sessionWallet: null, body: {} }), status(401));
  await assert.rejects(getMyProfile(store, { sessionWallet: null }), status(401));
  const saved = await saveMyProfile(
    store,
    { sessionWallet: FREELANCER, body: { wallet: OTHER, displayName: "Bo", headline: "Dev" } },
    T0
  );
  assert.equal(saved.wallet, FREELANCER);
  assert.equal((await getMyProfile(store, { sessionWallet: OTHER })), null);
  const page = await getProfilePage(store, { wallet: FREELANCER });
  assert.equal(page.profile?.displayName, "Bo");
  await assert.rejects(getProfilePage(store, { wallet: "not-a-wallet" }), status(404));
  await assert.rejects(getProfilePage(store, { wallet: "' OR 1=1 --" }), status(404));
  // Update keeps createdAt, changes updatedAt.
  const later = new Date("2026-10-02T00:00:00Z");
  const again = await saveMyProfile(store, { sessionWallet: FREELANCER, body: { displayName: "Bob" } }, later);
  assert.equal(again.createdAt, saved.createdAt);
  assert.equal(again.updatedAt, later.toISOString());
});

test("catalog profile: no rating or reputation fields anywhere", async () => {
  const store = createMemoryMarketplaceStore();
  const saved = await saveMyProfile(store, { sessionWallet: FREELANCER, body: { rating: 5, reputation: 99 } });
  assert.ok(!("rating" in saved) && !("reputation" in saved));
  const files = [
    "lib/server/db/schema.ts",
    "drizzle/0009_marketplace_profiles_gigs.sql",
    "lib/server/marketplace/store.ts",
    "lib/server/marketplace/catalog-service.ts",
    "lib/server/marketplace/catalog-validation.ts",
    "components/marketplace/MarketplaceProfileView.tsx",
    "components/marketplace/MarketplaceProfileForm.tsx",
  ];
  const forbidden = /\b(rating|ratings|reputation|review_score|stars)\b/i;
  for (const file of files) {
    let src = read(file);
    if (file.endsWith("schema.ts")) src = src.slice(src.indexOf("export const marketplaceProfiles"));
    // Comments may state the policy ("no ratings"); only code is checked.
    src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(--|\/\/).*$/gm, "");
    assert.ok(src.length > 0, file);
    assert.doesNotMatch(src, forbidden, file);
  }
});

/* ---------------- gigs ---------------- */

test("catalog gigs: created from session wallet with locked mint; validated", async () => {
  const { store, gig } = await setupGig();
  assert.equal(gig.freelancerWallet, FREELANCER);
  assert.equal(gig.title, "Logo design");
  assert.equal(gig.tokenMint, MINT);
  assert.equal(gig.status, "active");
  assert.deepEqual(gig.skills.length, 2);
  await assert.rejects(createGig(store, { sessionWallet: null, body: gigBody(), tokenMint: MINT }), status(401));
  for (const bad of [
    { title: "" },
    { title: "x".repeat(GIG_LIMITS.title + 1) },
    { paymentMode: "Barter" },
    { priceAmount: "0" },
    { priceAmount: "1.5" },
    { skills: Array.from({ length: GIG_LIMITS.skills + 1 }, (_, i) => `s${i}`) },
  ]) {
    await assert.rejects(
      createGig(store, { sessionWallet: FREELANCER, body: gigBody(bad), tokenMint: MINT }),
      status(400),
      JSON.stringify(bad)
    );
  }
  const injected = await createGig(
    store,
    { sessionWallet: OTHER, body: gigBody({ freelancerWallet: EMPLOYER, tokenMint: "Evil", status: "paused" }), tokenMint: MINT }
  );
  assert.equal(injected.freelancerWallet, OTHER);
  assert.equal(injected.tokenMint, MINT);
  assert.equal(injected.status, "active");
});

test("catalog gigs: per-freelancer limit", async () => {
  const store = createMemoryMarketplaceStore();
  for (let i = 0; i < GIG_LIMITS.perFreelancer; i += 1) {
    await createGig(store, { sessionWallet: FREELANCER, body: gigBody({ title: `Gig ${i}` }), tokenMint: MINT });
  }
  await assert.rejects(
    createGig(store, { sessionWallet: FREELANCER, body: gigBody(), tokenMint: MINT }),
    status(409, "gig_limit")
  );
});

test("catalog gigs: only the owner edits, pauses, resumes or deletes", async () => {
  const { store, gig } = await setupGig();
  await assert.rejects(updateGig(store, { sessionWallet: null, gigId: gig.id, body: { action: "pause" } }), status(401));
  await assert.rejects(updateGig(store, { sessionWallet: OTHER, gigId: gig.id, body: { action: "pause" } }), status(403));
  await assert.rejects(updateGig(store, { sessionWallet: OTHER, gigId: gig.id, body: gigBody({ title: "Mine" }) }), status(403));
  await assert.rejects(deleteGig(store, { sessionWallet: OTHER, gigId: gig.id }), status(403));
  await assert.rejects(updateGig(store, { sessionWallet: FREELANCER, gigId: gig.id, body: { action: "nuke" } }), status(400));
  await assert.rejects(updateGig(store, { sessionWallet: FREELANCER, gigId: "not-a-uuid", body: { action: "pause" } }), status(404));
  const edited = await updateGig(store, { sessionWallet: FREELANCER, gigId: gig.id, body: gigBody({ title: "Logo pack" }) });
  assert.equal(edited.title, "Logo pack");
  const paused = await updateGig(store, { sessionWallet: FREELANCER, gigId: gig.id, body: { action: "pause" } });
  assert.equal(paused.status, "paused");
  // Non-owners cannot even learn a paused gig exists.
  await assert.rejects(updateGig(store, { sessionWallet: OTHER, gigId: gig.id, body: { action: "resume" } }), status(404));
  await assert.rejects(deleteGig(store, { sessionWallet: OTHER, gigId: gig.id }), status(404));
  const resumed = await updateGig(store, { sessionWallet: FREELANCER, gigId: gig.id, body: { action: "resume" } });
  assert.equal(resumed.status, "active");
  assert.deepEqual(await deleteGig(store, { sessionWallet: FREELANCER, gigId: gig.id }), { deleted: true });
  await assert.rejects(getGigDetail(store, { sessionWallet: FREELANCER, gigId: gig.id }), status(404));
  assert.deepEqual(await listMyGigs(store, { sessionWallet: FREELANCER }), []);
});

test("catalog gigs: paused gigs are hidden from public detail, search and profile", async () => {
  const { store, gig } = await setupGig();
  await updateGig(store, { sessionWallet: FREELANCER, gigId: gig.id, body: { action: "pause" } });
  await assert.rejects(getGigDetail(store, { sessionWallet: null, gigId: gig.id }), status(404));
  await assert.rejects(getGigDetail(store, { sessionWallet: OTHER, gigId: gig.id }), status(404));
  const own = await getGigDetail(store, { sessionWallet: FREELANCER, gigId: gig.id });
  assert.equal(own.viewerRole, "owner");
  assert.deepEqual(await searchGigs(store, new URLSearchParams()), []);
  assert.deepEqual((await getProfilePage(store, { wallet: FREELANCER })).gigs, []);
  assert.equal((await listMyGigs(store, { sessionWallet: FREELANCER })).length, 1);
  await assert.rejects(getGigHandoff(store, { sessionWallet: EMPLOYER, gigId: gig.id }), status(404));
});

test("catalog gigs: handoff carries only gig terms with the owner as freelancer", async () => {
  const { store, gig } = await setupGig();
  await assert.rejects(getGigHandoff(store, { sessionWallet: null, gigId: gig.id }), status(401));
  await assert.rejects(getGigHandoff(store, { sessionWallet: FREELANCER, gigId: gig.id }), status(403, "own_gig"));
  const handoff = await getGigHandoff(store, { sessionWallet: EMPLOYER, gigId: gig.id });
  assert.deepEqual(handoff, {
    source: "gig",
    gigId: gig.id,
    jobId: "",
    proposalId: "",
    title: "Logo design",
    description: "Three logo concepts and revisions.",
    paymentMode: "Fixed",
    amount: "150000000",
    freelancerWallet: FREELANCER,
  });
  const keys = Object.keys(handoff).join(",");
  assert.doesNotMatch(keys, /mint|resolver|decimals|employer/i);
});

/* ---------------- search ---------------- */

test("catalog search: sanitized, bounded, strict params", () => {
  assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
  const long = parseSearchParams(new URLSearchParams({ q: "a".repeat(500) }));
  assert.equal(long.text?.length, SEARCH_LIMITS.text);
  const ctrl = parseSearchParams(new URLSearchParams({ q: "lo\u0000go\u0007" }));
  assert.equal(ctrl.text, "logo");
  const skills = parseSearchParams(new URLSearchParams({ skill: "React, ,Node,a,b,c,d,e" }));
  assert.ok(skills.skills.length <= SEARCH_LIMITS.skills);
  assert.equal(parseSearchParams(new URLSearchParams({ limit: "100000" })).limit, SEARCH_LIMITS.maxLimit);
  assert.equal(parseSearchParams(new URLSearchParams({ limit: "-5" })).limit, 1);
  assert.equal(parseSearchParams(new URLSearchParams()).limit, SEARCH_LIMITS.maxLimit);
  const badParams: Record<string, string>[] = [{ mode: "Barter" }, { min: "1e5" }, { max: "-1" }, { min: "10", max: "5" }];
  for (const bad of badParams) {
    assert.throws(() => parseSearchParams(new URLSearchParams(bad)), status(400), JSON.stringify(bad));
  }
});

test("catalog search: jobs and gigs filter by text, skills, mode and amount range", async () => {
  const { store } = await setupGig();
  await createGig(
    store,
    { sessionWallet: OTHER, body: gigBody({ title: "Rust audit", description: "Smart contract review.", skills: ["rust"], paymentMode: "Hourly", priceAmount: "90000000" }), tokenMint: MINT }
  );
  await createJob(store, {
    sessionWallet: EMPLOYER,
    title: "Need a React dashboard",
    description: "Charts and tables.",
    paymentMode: "Milestone",
    budgetAmount: "500000000",
    tokenMint: MINT,
  });
  const titles = async (qs: string) => (await searchGigs(store, new URLSearchParams(qs))).map((g) => g.title);
  assert.deepEqual(await titles("q=logo"), ["Logo design"]);
  assert.deepEqual(await titles("q=LOGO%25"), []);
  assert.deepEqual(await titles("skill=rust"), ["Rust audit"]);
  assert.deepEqual(await titles("mode=Hourly"), ["Rust audit"]);
  assert.deepEqual(await titles("min=100000000"), ["Logo design"]);
  assert.deepEqual(await titles("max=100000000"), ["Rust audit"]);
  assert.equal((await titles("limit=1")).length, 1);
  const jobs = async (qs: string) => (await searchJobs(store, new URLSearchParams(qs))).map((j) => j.title);
  assert.deepEqual(await jobs("q=dashboard"), ["Need a React dashboard"]);
  assert.deepEqual(await jobs("skill=react"), ["Need a React dashboard"]);
  assert.deepEqual(await jobs("mode=Fixed"), []);
  assert.deepEqual(await jobs("min=600000000"), []);
});

/* ---------------- source checks ---------------- */

test("catalog store and routes: parameterized queries, session wallet, origin-checked writes", () => {
  const db = read("lib/server/db/marketplace-store.ts");
  assert.doesNotMatch(db, /sql\.raw/);
  assert.match(db, /escapeLike/);
  const routes = [
    "app/api/marketplace/gigs/route.ts",
    "app/api/marketplace/gigs/[id]/route.ts",
    "app/api/marketplace/gigs/[id]/handoff/route.ts",
    "app/api/marketplace/gigs/mine/route.ts",
    "app/api/marketplace/profiles/me/route.ts",
    "app/api/marketplace/profiles/[wallet]/route.ts",
  ];
  for (const route of routes) {
    const src = read(route);
    assert.doesNotMatch(src, /searchParams\.get\(["']wallet["']\)/, route);
  }
  for (const route of ["app/api/marketplace/gigs/route.ts", "app/api/marketplace/gigs/[id]/route.ts", "app/api/marketplace/profiles/me/route.ts"]) {
    assert.match(read(route), /[Oo]rigin/, route);
  }
});

test("catalog migration 0009: additive, journaled, not applied by tests", () => {
  const sql = read("drizzle/0009_marketplace_profiles_gigs.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "marketplace_profiles"|CREATE TABLE "marketplace_profiles"/);
  assert.match(sql, /"marketplace_gigs"/);
  assert.doesNotMatch(sql, /DROP|ALTER TABLE "marketplace_jobs"|ALTER TABLE "marketplace_proposals"|DELETE|TRUNCATE/i);
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: { idx: number; tag: string }[] };
  const entry = journal.entries.find((e) => e.idx === 9);
  assert.equal(entry?.tag, "0009_marketplace_profiles_gigs");
});

test("marketplace UI: active tab label color is on an inner span (global a color override)", () => {
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  assert.match(parts, /<span className=\{active \? "text-white" : "text-ink-soft"\}>\{item\.label\}<\/span>/);
  assert.match(read("components/marketplace/MarketplaceJobDetail.tsx"), /ProfileLink wallet=\{job\.employerWallet\}/);
  assert.match(read("components/marketplace/MarketplaceJobDetail.tsx"), /ProfileLink wallet=\{p\.freelancerWallet\}/);
  assert.match(read("components/marketplace/MarketplaceGigDetail.tsx"), /stashCreateHandoff/);
});
