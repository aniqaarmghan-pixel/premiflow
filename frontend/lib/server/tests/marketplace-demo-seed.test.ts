import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { JOB_PAYMENT_MODES, type MarketplaceGigRecord, type MarketplaceJobRecord, type MarketplaceProfileRecord, type MarketplaceProposalRecord } from "../marketplace/store";
import { isWalletAddress, validateGigInput, validateProfileInput } from "../marketplace/catalog-validation";
import { MARKETPLACE_CATEGORIES } from "@/lib/app/marketplace-categories";
import { DEVNET_CLUSTER } from "@/lib/cluster";
import {
  DEMO_SEED_FLAG,
  DEMO_SKILL_TAG,
  applyDemoSeed,
  buildDemoSeedData,
  checkDemoSeedAllowed,
  demoSeedCounts,
  removeDemoSeed,
  type DemoSeedStore,
} from "../marketplace/demo-seed";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const NOW = new Date("2026-10-07T00:00:00Z");
const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Calls = Record<string, number>;

function fakeStore() {
  const profiles = new Map<string, MarketplaceProfileRecord>();
  const gigs = new Map<string, MarketplaceGigRecord>();
  const jobs = new Map<string, MarketplaceJobRecord>();
  const proposals: MarketplaceProposalRecord[] = [];
  const calls: Calls = {};
  const hit = (name: string) => (calls[name] = (calls[name] ?? 0) + 1);
  const store: DemoSeedStore = {
    async getProfile(wallet) { hit("getProfile"); return profiles.get(wallet) ?? null; },
    async upsertProfile(row) {
      hit("upsertProfile");
      const prev = profiles.get(row.wallet);
      const saved = { ...row, createdAt: prev?.createdAt ?? row.createdAt };
      profiles.set(row.wallet, saved);
      return saved;
    },
    async getGig(id) { hit("getGig"); return gigs.get(id) ?? null; },
    async insertGig(row) {
      hit("insertGig");
      if (gigs.has(row.id)) throw new Error("duplicate gig id");
      gigs.set(row.id, row);
      return row;
    },
    async updateGigForOwner(id, owner, patch) {
      hit("updateGigForOwner");
      const g = gigs.get(id);
      if (!g || g.freelancerWallet !== owner) return null;
      const next = { ...g, ...patch };
      gigs.set(id, next);
      return next;
    },
    async deleteGigForOwner(id, owner) {
      hit("deleteGigForOwner");
      const g = gigs.get(id);
      if (!g || g.freelancerWallet !== owner) return false;
      return gigs.delete(id);
    },
    async getJob(id) { hit("getJob"); return jobs.get(id) ?? null; },
    async insertJob(row) {
      hit("insertJob");
      if (jobs.has(row.id)) throw new Error("duplicate job id");
      jobs.set(row.id, row);
      return row;
    },
    async updateJobIfStatus(id, expected, patch) {
      hit("updateJobIfStatus");
      const j = jobs.get(id);
      if (!j || j.status !== expected) return null;
      const next = { ...j, ...patch };
      jobs.set(id, next);
      return next;
    },
    async listProposalsForJob(jobId) { hit("listProposalsForJob"); return proposals.filter((p) => p.jobId === jobId); },
    async deleteProfile(wallet) { hit("deleteProfile"); return profiles.delete(wallet); },
    async deleteJobForEmployer(id, employer) {
      hit("deleteJobForEmployer");
      const j = jobs.get(id);
      if (!j || j.employerWallet !== employer) return false;
      return jobs.delete(id);
    },
  };
  return { store, profiles, gigs, jobs, proposals, calls };
}

function allText(data: ReturnType<typeof buildDemoSeedData>): string[] {
  return [
    ...data.profiles.flatMap((p) => [p.displayName, p.headline, p.bio, ...p.skills]),
    ...data.gigs.flatMap((g) => [g.title, g.description, ...g.skills, ...g.packages.flatMap((p) => [p.title, p.description])]),
    ...data.jobs.flatMap((j) => [j.title, j.description, ...j.skills]),
  ];
}

test("demo seed: exactly 10 profiles, 10 gigs and 10 jobs", () => {
  const data = buildDemoSeedData(NOW);
  assert.deepEqual(demoSeedCounts(data), { profiles: 10, gigs: 10, jobs: 10 });
});

test("demo seed: ids and wallets are unique, deterministic and well-formed", () => {
  const a = buildDemoSeedData(NOW);
  const b = buildDemoSeedData(new Date("2027-01-01T00:00:00Z"));
  const ids = [...a.gigs.map((g) => g.id), ...a.jobs.map((j) => j.id)];
  assert.equal(new Set(ids).size, 20);
  for (const id of ids) assert.match(id, UUID_V5);
  assert.deepEqual(ids, [...b.gigs.map((g) => g.id), ...b.jobs.map((j) => j.id)]);

  const freelancers = a.profiles.map((p) => p.wallet);
  assert.equal(new Set(freelancers).size, 10);
  assert.deepEqual(freelancers, b.profiles.map((p) => p.wallet));
  assert.deepEqual(a.employerWallets, b.employerWallets);
  for (const w of [...freelancers, ...a.employerWallets]) assert.ok(isWalletAddress(w), w);
  assert.ok(a.employerWallets.every((w) => !freelancers.includes(w)));
  // Each gig belongs to a demo freelancer; each job to a demo employer.
  assert.equal(new Set(a.gigs.map((g) => g.freelancerWallet)).size, 10);
  assert.ok(a.gigs.every((g) => freelancers.includes(g.freelancerWallet)));
  assert.ok(a.jobs.every((j) => a.employerWallets.includes(j.employerWallet)));
});

test("demo seed: every record is disclosed (demo tag + short trailing note); names stay clean", () => {
  const data = buildDemoSeedData(NOW);
  for (const p of data.profiles) {
    assert.doesNotMatch(p.displayName, /\(demo\)/i, p.displayName);
    assert.doesNotMatch(p.bio, /^Devnet demo/);
    assert.match(p.bio, /\n\nDevnet demo profile: fictional, not a real person\.$/);
    assert.equal(p.skills[0], DEMO_SKILL_TAG);
  }
  for (const g of data.gigs) {
    assert.doesNotMatch(g.description, /^Devnet demo/);
    assert.match(g.description, /\n\nDevnet demo gig: fictional sample, not a real offer\.$/);
    assert.equal(g.skills[0], DEMO_SKILL_TAG);
  }
  for (const j of data.jobs) {
    assert.doesNotMatch(j.description, /^Devnet demo/);
    assert.match(j.description, /\n\nDevnet demo job: fictional sample, not a real client\.$/);
    assert.equal(j.skills[0], DEMO_SKILL_TAG);
  }
});

test("demo seed: no superiority, exclusivity or traction claims", () => {
  const banned =
    /\b(first|only|best|leading|#1|number one|top[- ]rated|world[- ]class|award[- ]winning|guaranteed?|trusted by|thousands|millions|testimonials?)\b|\b\d[\d,]*\+?\s*(clients|customers|users|reviews|projects completed)\b/i;
  for (const text of allText(buildDemoSeedData(NOW))) assert.doesNotMatch(text, banned, text);
});

test("demo seed: realistic, complete and valid against the API validators", () => {
  const data = buildDemoSeedData(NOW);
  for (const p of data.profiles) {
    const v = validateProfileInput({ ...p });
    assert.deepEqual(v.skills, p.skills);
    assert.ok(p.displayName && p.headline && p.bio && p.skills.length >= 5, p.displayName);
    assert.match(p.bio, /\nLocation: .+/);
    assert.equal(p.avatarUrl, null); // initials fallback; no fake photos
    assert.deepEqual(p.portfolio, []); // no invented links
    assert.match(p.rateAmount ?? "", /^[1-9]\d{6,}$/);
  }
  for (const g of data.gigs) {
    const v = validateGigInput({ ...g });
    assert.equal(v.priceAmount, g.priceAmount);
    assert.equal(g.tokenMint, DEVNET_CLUSTER.paymentMint);
    assert.equal(g.status, "active");
    assert.ok(g.category);
  }
  for (const j of data.jobs) {
    assert.ok(j.title.length <= 120 && j.description.length <= 4000);
    assert.match(j.budgetAmount, /^[1-9]\d{6,}$/);
    assert.equal(j.tokenMint, DEVNET_CLUSTER.paymentMint);
    assert.equal(j.status, "open");
    assert.match(j.description, /\nLocation: .+/);
  }
  for (const mode of JOB_PAYMENT_MODES) {
    assert.ok(data.jobs.some((j) => j.paymentMode === mode), `job ${mode}`);
    assert.ok(data.gigs.some((g) => g.paymentMode === mode), `gig ${mode}`);
  }
  const used = new Set([...data.jobs, ...data.gigs].map((r) => r.category));
  for (const c of MARKETPLACE_CATEGORIES) assert.ok(used.has(c.slug), c.slug);
});

test("demo seed: creates no reviews, contracts, transactions or keypairs", () => {
  const { store, calls } = fakeStore();
  const allowed = new Set(Object.keys(store));
  assert.ok(![...allowed].some((k) => /review|trust|contract|transaction/i.test(k)));
  const mod = read("lib/server/marketplace/demo-seed.ts");
  const script = read("scripts/seed-devnet-demo.ts");
  for (const src of [mod, script]) {
    assert.doesNotMatch(src, /trust-store|marketplaceReviews|insertReview|createReview/);
    assert.doesNotMatch(src, /Keypair|secretKey|privateKey|fromSecretKey|writeFileSync|sendTransaction/);
  }
  void calls;
});

test("demo seed guard: refuses production and non-devnet, requires explicit flag for writes", () => {
  const base = { [DEMO_SEED_FLAG]: "1", DATABASE_URL: "postgres://example.invalid/db" };
  assert.deepEqual(checkDemoSeedAllowed({ env: base, dryRun: false }), { ok: true });
  assert.deepEqual(checkDemoSeedAllowed({ env: {}, dryRun: true }), { ok: true });

  const refuse = (env: Record<string, string | undefined>, dryRun: boolean, clusterId?: string) => {
    const v = checkDemoSeedAllowed({ env, dryRun, clusterId });
    assert.equal(v.ok, false);
    if (!v.ok) assert.doesNotMatch(v.reason, /example\.invalid/);
  };
  refuse({ ...base, NODE_ENV: "production" }, false);
  refuse({ ...base, NODE_ENV: "production" }, true);
  refuse({ ...base, VERCEL_ENV: "production" }, false);
  refuse(base, false, "mainnet-beta");
  refuse({ ...base, SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com" }, false);
  refuse({ DATABASE_URL: base.DATABASE_URL }, false); // flag missing
  refuse({ ...base, [DEMO_SEED_FLAG]: "true" }, false); // must be exactly 1
  refuse({ [DEMO_SEED_FLAG]: "1" }, false); // no DB configured
});

test("demo seed: running twice never duplicates and keeps createdAt", async () => {
  const fake = fakeStore();
  const data = buildDemoSeedData(NOW);
  const first = await applyDemoSeed(fake.store, data, NOW);
  assert.deepEqual(first, {
    profiles: { created: 10, updated: 0 },
    gigs: { created: 10, updated: 0, skipped: 0 },
    jobs: { created: 10, updated: 0, skipped: 0 },
  });
  const created = fake.profiles.get(data.profiles[0].wallet)!.createdAt;

  const later = new Date(NOW.getTime() + 86_400_000);
  const second = await applyDemoSeed(fake.store, buildDemoSeedData(later), later);
  assert.deepEqual(second, {
    profiles: { created: 0, updated: 10 },
    gigs: { created: 0, updated: 10, skipped: 0 },
    jobs: { created: 0, updated: 10, skipped: 0 },
  });
  assert.equal(fake.profiles.size, 10);
  assert.equal(fake.gigs.size, 10);
  assert.equal(fake.jobs.size, 10);
  assert.equal(fake.calls.insertGig, 10);
  assert.equal(fake.calls.insertJob, 10);
  assert.equal(fake.profiles.get(data.profiles[0].wallet)!.createdAt.getTime(), created.getTime());
});

test("demo seed: closed demo jobs are not reopened; remove deletes only demo ids", async () => {
  const fake = fakeStore();
  const data = buildDemoSeedData(NOW);
  await applyDemoSeed(fake.store, data, NOW);
  const [closedJob, proposedJob] = data.jobs;
  await fake.store.updateJobIfStatus(closedJob.id, "open", { status: "closed", closedAt: NOW });
  const again = await applyDemoSeed(fake.store, data, NOW);
  assert.equal(again.jobs.skipped, 1);
  assert.equal(fake.jobs.get(closedJob.id)!.status, "closed");

  // An unrelated real listing must survive --remove.
  const realGig = { ...data.gigs[0], id: "00000000-0000-4000-8000-000000000001", freelancerWallet: "11111111111111111111111111111111" };
  fake.gigs.set(realGig.id, realGig);
  fake.proposals.push({
    id: "00000000-0000-4000-8000-000000000002",
    jobId: proposedJob.id,
    freelancerWallet: "11111111111111111111111111111111",
    message: "hello",
    proposedAmount: "1",
    status: "submitted",
    createdAt: NOW,
    updatedAt: NOW,
  });

  const removed = await removeDemoSeed(fake.store, data, NOW);
  assert.deepEqual(removed, { profiles: 10, gigs: 10, jobsDeleted: 9, jobsClosed: 1 });
  assert.equal(fake.profiles.size, 0);
  assert.deepEqual([...fake.gigs.keys()], [realGig.id]);
  assert.deepEqual([...fake.jobs.keys()], [proposedJob.id]);
  assert.equal(fake.jobs.get(proposedJob.id)!.status, "closed");
});

test("demo seed: manual npm script only; never runs on build, start or install", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["seed:demo"], "tsx scripts/seed-devnet-demo.ts");
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    if (name === "seed:demo") continue;
    assert.doesNotMatch(cmd, /seed/i, name);
  }
  const script = read("scripts/seed-devnet-demo.ts");
  assert.match(script, /checkDemoSeedAllowed\(\{ env: process\.env, dryRun \}\)/);
  assert.match(script, /process\.env\.DATABASE_URL/);
  assert.doesNotMatch(script, /console\.\w+\([^;]*DATABASE_URL/);
  assert.doesNotMatch(script, /loadEnvFile|dotenv/);
});

test("demo seed: re-running updates legacy '(demo)' names and long leading notes in place", async () => {
  const { store } = fakeStore();
  const data = buildDemoSeedData(NOW);
  const legacy = data.profiles[0];
  await store.upsertProfile({
    ...legacy,
    displayName: `${legacy.displayName} (demo)`,
    bio: `Devnet demo profile: a fictional freelancer created to explore PREMIFLOW on Solana Devnet.\n\n${legacy.bio}`,
  });
  const report = await applyDemoSeed(store, data, NOW);
  assert.deepEqual(report.profiles, { created: 9, updated: 1 });
  const saved = await store.getProfile(legacy.wallet);
  assert.equal(saved?.displayName, legacy.displayName);
  assert.doesNotMatch(saved?.displayName ?? "", /\(demo\)/);
  assert.equal(saved?.bio, legacy.bio);
});
