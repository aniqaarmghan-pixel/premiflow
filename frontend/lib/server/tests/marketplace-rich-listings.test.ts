import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { gigCategory, gigDeliveryLabel, gigPriceLabel, splitLines } from "@/lib/app/marketplace";
import { isCreateHandoff } from "@/lib/app/marketplace-handoff-store";
import {
  GIG_MEDIA_LIMITS,
  parseDeliveryDays,
  parseGigMedia,
  parsePackages,
  parseVideoUrl,
  validateGigInput,
} from "../marketplace/catalog-validation";
import { createGig, getGigHandoff, searchGigs, updateGig } from "../marketplace/catalog-service";
import { FAVORITES_LIMIT, listSaved, saveListing, unsaveListing } from "../marketplace/favorites-service";
import { createMemoryMarketplaceStore } from "../marketplace/memory-store";
import { closeJob, createJob } from "../marketplace/service";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const OTHER = WALLET_C.toBase58();
const MINT = "So11111111111111111111111111111111111111112";
const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const status =
  (code: number, name?: string) =>
  (err: { status?: number; code?: string }) =>
    err.status === code && (name === undefined || err.code === name);

const pkg = (tier: string, priceAmount: string, extra: Record<string, unknown> = {}) => ({
  tier,
  title: "",
  description: `${tier} scope`,
  priceAmount,
  deliveryDays: 3,
  revisions: 1,
  ...extra,
});

function body(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Brand kit",
    description: "Logo, colors and type.",
    skills: ["figma"],
    paymentMode: "Fixed",
    priceAmount: "100",
    ...extra,
  };
}

test("rich gig validation: media URLs, video, gallery limit, delivery bounds", () => {
  const v = validateGigInput(
    body({
      category: "design",
      coverUrl: "https://cdn.example.com/cover.png",
      media: ["https://cdn.example.com/1.png", " https://cdn.example.com/2.png "],
      videoUrl: "https://cdn.example.com/intro.mp4",
      deliveryDays: 5,
    })
  );
  assert.equal(v.category, "design");
  assert.equal(v.coverUrl, "https://cdn.example.com/cover.png");
  assert.deepEqual(v.media, ["https://cdn.example.com/1.png", "https://cdn.example.com/2.png"]);
  assert.equal(v.videoUrl, "https://cdn.example.com/intro.mp4");
  assert.equal(v.deliveryDays, 5);
  for (const extra of [
    { coverUrl: "http://cdn.example.com/a.png" },
    { coverUrl: "javascript:alert(1)" },
    { media: ["ftp://x/y.png"] },
    { media: "https://x.example/a.png" },
    { media: Array.from({ length: GIG_MEDIA_LIMITS.images + 1 }, (_, i) => `https://x.example/${i}.png`) },
    { videoUrl: "http://cdn.example.com/a.mp4" },
    { videoUrl: "https://www.youtube.com/watch?v=abc" },
    { deliveryDays: 0 },
    { deliveryDays: 366 },
    { deliveryDays: 2.5 },
    { deliveryDays: "abc" },
    { category: "crypto" },
  ]) {
    assert.throws(() => validateGigInput(body(extra)), status(400), JSON.stringify(extra));
  }
  assert.deepEqual(parseGigMedia(undefined), []);
  assert.equal(parseVideoUrl(""), null);
  assert.equal(parseVideoUrl("https://cdn.example.com/clip.webm?x=1"), "https://cdn.example.com/clip.webm?x=1");
  assert.equal(parseDeliveryDays(null), null);
  assert.equal(parseDeliveryDays("7"), 7);
});

test("packages: tiers, duplicates, limits, ordering, lowest price wins", () => {
  const sorted = parsePackages([pkg("premium", "900"), pkg("basic", "100"), pkg("standard", "400")]);
  assert.deepEqual(
    sorted.map((p) => p.tier),
    ["basic", "standard", "premium"]
  );
  assert.equal(parsePackages([pkg("basic", "100", { revisions: undefined })])[0].revisions, 0);
  for (const bad of [
    "basic",
    [pkg("gold", "100")],
    [pkg("basic", "100"), pkg("basic", "200")],
    [pkg("basic", "0")],
    [pkg("basic", "-5")],
    [pkg("basic", "1.5")],
    [pkg("basic", "100", { description: "" })],
    [pkg("basic", "100", { deliveryDays: 0 })],
    [pkg("basic", "100", { revisions: GIG_MEDIA_LIMITS.revisionsMax + 1 })],
    [pkg("basic", "1"), pkg("standard", "2"), pkg("premium", "3"), pkg("basic", "4")],
  ]) {
    assert.throws(() => parsePackages(bad), status(400), JSON.stringify(bad));
  }
  const v = validateGigInput(
    body({ priceAmount: undefined, packages: [pkg("standard", "400", { deliveryDays: 2 }), pkg("basic", "250")] })
  );
  assert.equal(v.priceAmount, "250");
  assert.equal(v.deliveryDays, 2);
  // Legacy single price still required without packages.
  assert.throws(() => validateGigInput(body({ priceAmount: undefined })), status(400));
  assert.equal(validateGigInput(body()).priceAmount, "100");
  assert.deepEqual(validateGigInput(body()).packages, []);
});

test("package handoff: amount and tier come from the stored package", async () => {
  const store = createMemoryMarketplaceStore();
  const gig = await createGig(store, {
    sessionWallet: FREELANCER,
    tokenMint: MINT,
    body: body({ packages: [pkg("basic", "250"), pkg("premium", "900", { title: "Full", revisions: 3, deliveryDays: 10 })] }),
  });
  assert.equal(gig.priceAmount, "250");
  const first = await getGigHandoff(store, { sessionWallet: EMPLOYER, gigId: gig.id });
  assert.equal(first.amount, "250");
  assert.equal(first.packageTier, "basic");
  const premium = await getGigHandoff(store, { sessionWallet: EMPLOYER, gigId: gig.id, tier: "premium" });
  assert.equal(premium.amount, "900");
  assert.equal(premium.packageTier, "premium");
  assert.equal(premium.title, "Brand kit - Premium package");
  assert.match(premium.description, /Premium package \(Full\): premium scope/);
  assert.match(premium.description, /Delivery: 10 days\. 3 revisions\./);
  assert.equal(premium.freelancerWallet, FREELANCER);
  assert.equal("tokenMint" in premium, false);
  assert.ok(isCreateHandoff(premium));
  assert.equal(isCreateHandoff({ ...premium, packageTier: "gold" }), false);
  await assert.rejects(getGigHandoff(store, { sessionWallet: EMPLOYER, gigId: gig.id, tier: "gold" }), status(400));
  await assert.rejects(
    getGigHandoff(store, { sessionWallet: EMPLOYER, gigId: gig.id, tier: "standard" }),
    status(404, "package_not_found")
  );
  await assert.rejects(getGigHandoff(store, { sessionWallet: null, gigId: gig.id, tier: "basic" }), status(401));
});

test("legacy gigs: defaults, unchanged handoff, keyword fallback, explicit category wins", async () => {
  const store = createMemoryMarketplaceStore();
  const legacy = await createGig(store, {
    sessionWallet: FREELANCER,
    tokenMint: MINT,
    body: { title: "React landing page", description: "Fast site.", paymentMode: "Fixed", priceAmount: "500" },
  });
  assert.equal(legacy.category, null);
  assert.equal(legacy.coverUrl, null);
  assert.deepEqual(legacy.media, []);
  assert.equal(legacy.videoUrl, null);
  assert.equal(legacy.deliveryDays, null);
  assert.deepEqual(legacy.packages, []);
  const h = await getGigHandoff(store, { sessionWallet: EMPLOYER, gigId: legacy.id });
  assert.equal(h.amount, "500");
  assert.equal(h.title, "React landing page");
  assert.equal("packageTier" in h, false);
  await assert.rejects(getGigHandoff(store, { sessionWallet: EMPLOYER, gigId: legacy.id, tier: "basic" }), status(400));
  await createGig(store, {
    sessionWallet: OTHER,
    tokenMint: MINT,
    body: body({ title: "React audit video", skills: ["rust"], category: "video" }),
  });
  const titles = async (q: string) => (await searchGigs(store, new URLSearchParams(q))).map((g) => g.title).sort();
  assert.deepEqual(await titles("skill=react"), ["React landing page"]);
  assert.deepEqual(await titles("category=video"), ["React audit video"]);
  assert.equal(gigCategory({ ...legacy, category: null }), "development");
  assert.equal(gigCategory({ ...legacy, category: "writing" }), "writing");
  // Edit adds rich fields to a legacy gig.
  const edited = await updateGig(store, {
    sessionWallet: FREELANCER,
    gigId: legacy.id,
    body: body({ coverUrl: "https://cdn.example.com/c.png", deliveryDays: 4 }),
  });
  assert.equal(edited.coverUrl, "https://cdn.example.com/c.png");
  assert.equal(edited.deliveryDays, 4);
  assert.equal(gigDeliveryLabel(4), "4-day delivery");
  assert.equal(gigDeliveryLabel(null), null);
  assert.match(gigPriceLabel({ paymentMode: "Fixed", priceAmount: "1", packages: [] }), /^Fixed price|^Price|^Budget|\S/);
  assert.match(
    gigPriceLabel({ paymentMode: "Fixed", priceAmount: "1", packages: [pkg("basic", "1"), pkg("standard", "2")] as never }),
    /^From /
  );
  assert.deepEqual(splitLines(" a \n\n b\r\n"), ["a", "b"]);
});

test("favorites: session auth, idempotent unique saves, visibility, limit, unavailable items", async () => {
  const store = createMemoryMarketplaceStore();
  const gig = await createGig(store, { sessionWallet: FREELANCER, tokenMint: MINT, body: body() });
  const job = await createJob(store, {
    sessionWallet: EMPLOYER,
    title: "Audit",
    description: "Details.",
    paymentMode: "Fixed",
    budgetAmount: "100",
    tokenMint: MINT,
  });
  await assert.rejects(saveListing(store, { sessionWallet: null, targetType: "gig", targetId: gig.id }), status(401));
  await assert.rejects(listSaved(store, { sessionWallet: null }), status(401));
  await assert.rejects(unsaveListing(store, { sessionWallet: null, targetType: "gig", targetId: gig.id }), status(401));
  await assert.rejects(saveListing(store, { sessionWallet: OTHER, targetType: "profile", targetId: gig.id }), status(400));
  await assert.rejects(saveListing(store, { sessionWallet: OTHER, targetType: "gig", targetId: "1 OR 1=1" }), status(400));
  await assert.rejects(
    saveListing(store, { sessionWallet: OTHER, targetType: "gig", targetId: randomUUID() }),
    status(404)
  );
  assert.deepEqual(await saveListing(store, { sessionWallet: OTHER, targetType: "gig", targetId: gig.id }), {
    saved: true,
    created: true,
  });
  assert.deepEqual(await saveListing(store, { sessionWallet: OTHER, targetType: "gig", targetId: gig.id }), {
    saved: true,
    created: false,
  });
  await saveListing(store, { sessionWallet: OTHER, targetType: "job", targetId: job.id });
  assert.equal(await store.countFavorites(OTHER), 2);
  // Another wallet's list is separate.
  assert.deepEqual(await listSaved(store, { sessionWallet: EMPLOYER }), []);
  let items = await listSaved(store, { sessionWallet: OTHER });
  assert.equal(items.length, 2);
  assert.equal(items.find((i) => i.targetType === "gig")?.gig?.id, gig.id);
  assert.equal(items.find((i) => i.targetType === "job")?.job?.id, job.id);
  // Paused gig / closed job: hidden from others, kept as unavailable entries.
  await updateGig(store, { sessionWallet: FREELANCER, gigId: gig.id, body: { action: "pause" } });
  await closeJob(store, { sessionWallet: EMPLOYER, jobId: job.id });
  items = await listSaved(store, { sessionWallet: OTHER });
  assert.deepEqual(
    items.map((i) => [i.targetType, i.gig, i.job]),
    items.map((i) => [i.targetType, null, null])
  );
  await assert.rejects(saveListing(store, { sessionWallet: EMPLOYER, targetType: "gig", targetId: gig.id }), status(404));
  // Owners may still save their own paused gig.
  assert.equal((await saveListing(store, { sessionWallet: FREELANCER, targetType: "gig", targetId: gig.id })).saved, true);
  assert.deepEqual(await unsaveListing(store, { sessionWallet: OTHER, targetType: "gig", targetId: gig.id }), {
    saved: false,
    removed: true,
  });
  assert.deepEqual(await unsaveListing(store, { sessionWallet: OTHER, targetType: "gig", targetId: gig.id }), {
    saved: false,
    removed: false,
  });
  assert.equal(await store.countFavorites(FREELANCER), 1);
  // Per-wallet cap.
  const capped = await createGig(store, { sessionWallet: OTHER, tokenMint: MINT, body: body() });
  for (let i = 0; i < FAVORITES_LIMIT; i += 1) {
    await store.addFavorite({ wallet: EMPLOYER, targetType: "job", targetId: randomUUID(), createdAt: new Date() });
  }
  await assert.rejects(
    saveListing(store, { sessionWallet: EMPLOYER, targetType: "gig", targetId: capped.id }),
    status(409, "favorites_limit")
  );
});

test("migration 0011: additive, journaled, favorites unique key", () => {
  const sql = read("drizzle/0011_marketplace_rich_listings.sql");
  assert.doesNotMatch(sql, /\b(DROP|DELETE|UPDATE|TRUNCATE|RENAME)\b/i);
  for (const col of ["category", "cover_url", "media", "video_url", "delivery_days", "packages"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`));
  }
  assert.match(sql, /"media" jsonb DEFAULT '\[\]'::jsonb NOT NULL/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "marketplace_favorites"/);
  assert.match(sql, /PRIMARY KEY\("wallet","target_type","target_id"\)/);
  assert.match(sql, /--> statement-breakpoint/);
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as {
    entries: { idx: number; tag: string; when: number }[];
  };
  const last = journal.entries.at(-1)!;
  assert.deepEqual([last.idx, last.tag], [11, "0011_marketplace_rich_listings"]);
  assert.ok(last.when > journal.entries.at(-2)!.when);
  const schema = read("lib/server/db/schema.ts");
  assert.match(schema, /marketplace_favorites_pk/);
});

test("gig media markup: lazy images, no autoplay, muted controls, preload none", () => {
  const media = read("components/marketplace/MarketplaceGigMedia.tsx");
  assert.match(media, /preload="(none|metadata)"/);
  assert.match(media, /\bmuted\b/);
  assert.match(media, /\bcontrols\b/);
  assert.match(media, /playsInline/);
  assert.doesNotMatch(media, /autoPlay|autoplay=/i);
  assert.equal((media.match(/loading="lazy"/g) ?? []).length, 2);
  assert.equal((media.match(/referrerPolicy="no-referrer"/g) ?? []).length, 2);
  const detail = read("components/marketplace/MarketplaceGigDetail.tsx");
  assert.match(detail, /fetchGigHandoff\(gigId, selected\)/);
  assert.match(detail, /stashCreateHandoff/);
  const route = read("app/api/marketplace/saved/route.ts");
  assert.match(route, /requireMutatingOrigin/);
  assert.match(route, /limitMarketplaceWrites/);
  assert.doesNotMatch(route, /body\.wallet/);
});
