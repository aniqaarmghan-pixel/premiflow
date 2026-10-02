import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { Keypair } from "@solana/web3.js";

import { jobCategory } from "@/lib/app/marketplace";
import { handoffUseLabel, isCreateHandoff } from "@/lib/app/marketplace-handoff-store";
import { JOB_SKILLS_MAX, parseCategory } from "../marketplace/catalog-validation";
import { searchJobs, searchMarketplace } from "../marketplace/catalog-service";
import { createMemoryMarketplaceStore } from "../marketplace/memory-store";
import { createJob, updateJob } from "../marketplace/service";

const MINT = "So11111111111111111111111111111111111111112";
const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const EMP = Keypair.generate().publicKey.toBase58();
type Coded = { status?: number };
const bad = (err: Coded) => err.status === 400;
const base = { sessionWallet: EMP, paymentMode: "Fixed", budgetAmount: "100", tokenMint: MINT, description: "Details." };

test("job skills/category: validated with catalog rules, optional for legacy callers", async () => {
  const store = createMemoryMarketplaceStore();
  const job = await createJob(store, { ...base, title: "Audit", skills: ["Rust", " rust ", "Anchor"], category: "web3" });
  assert.deepEqual(job.skills, ["rust", "anchor"]);
  assert.equal(job.category, "web3");
  const legacy = await createJob(store, { ...base, title: "Legacy" });
  assert.deepEqual(legacy.skills, []);
  assert.equal(legacy.category, null);
  assert.equal((await createJob(store, { ...base, title: "Blank", category: "" })).category, null);
  for (const extra of [
    { category: "crypto" },
    { category: "WEB3" },
    { skills: ["<b>"] },
    { skills: 7 },
    { skills: Array.from({ length: JOB_SKILLS_MAX + 1 }, (_, i) => `s${i}`) },
  ]) {
    await assert.rejects(createJob(store, { ...base, title: "x", ...extra }), bad, JSON.stringify(extra));
  }
  const edited = await updateJob(store, { sessionWallet: EMP, jobId: job.id, skills: "figma, ui", category: "design" });
  assert.deepEqual(edited.skills, ["figma", "ui"]);
  assert.equal(edited.category, "design");
  const cleared = await updateJob(store, { sessionWallet: EMP, jobId: job.id, category: null });
  assert.equal(cleared.category, null);
  assert.deepEqual(cleared.skills, ["figma", "ui"]);
  await assert.rejects(updateJob(store, { sessionWallet: EMP, jobId: job.id, category: "spam" }), bad);
  assert.equal(parseCategory(undefined), null);
  assert.throws(() => parseCategory("x' OR 1=1"), bad);
});

test("job search: skills column wins, keyword fallback only for legacy rows", async () => {
  const store = createMemoryMarketplaceStore();
  await createJob(store, { ...base, title: "React dashboard", skills: ["rust"] });
  await createJob(store, { ...base, title: "Legacy React app" });
  const titles = async (q: string) => (await searchJobs(store, new URLSearchParams(q))).map((j) => j.title);
  assert.deepEqual(await titles("skill=rust"), ["React dashboard"]);
  // Column-backed row does not match "react" through its title; the legacy row does.
  assert.deepEqual(await titles("skill=react"), ["Legacy React app"]);
});

test("job search: explicit category wins, keyword derivation when unset", async () => {
  const store = createMemoryMarketplaceStore();
  await createJob(store, { ...base, title: "Solana token launch plan", category: "business" });
  await createJob(store, { ...base, title: "Solana wallet integration" });
  const titles = async (q: string) => (await searchJobs(store, new URLSearchParams(q))).map((j) => j.title);
  assert.deepEqual(await titles("category=business"), ["Solana token launch plan"]);
  assert.deepEqual(await titles("category=web3"), ["Solana wallet integration"]);
  assert.deepEqual((await searchMarketplace(store, new URLSearchParams("category=business"))).jobs.map((j) => j.title), [
    "Solana token launch plan",
  ]);
  assert.equal(jobCategory({ title: "Solana wallet integration", description: "", skills: [], category: null }), "web3");
  assert.equal(jobCategory({ title: "Solana", description: "", skills: [], category: "business" }), "business");
  assert.equal(jobCategory({ title: "Misc", description: "", skills: [], category: null }), null);
});

test("job skills SQL: parameterized, legacy fallback and explicit category in the Drizzle store", () => {
  const db = read("lib/server/db/marketplace-store.ts");
  assert.doesNotMatch(db, /sql\.raw/);
  assert.match(db, /jsonb_array_length\(\$\{cols\.skills\}\) = 0/);
  assert.match(db, /or\(eq\(cols\.category, filter\.category\), and\(isNull\(cols\.category\), derived\)\)/);
  assert.match(db, /skills: marketplaceJobs\.skills,\s*category: marketplaceJobs\.category,\s*skillFallback: true/);
  const routes = read("app/api/marketplace/jobs/route.ts") + read("app/api/marketplace/jobs/[id]/route.ts");
  assert.equal(routes.match(/skills: body\.skills/g)?.length, 2);
  assert.equal(routes.match(/category: body\.category/g)?.length, 2);
});

test("migration 0010: additive job columns, journaled, not applied", () => {
  const sql = read("drizzle/0010_marketplace_job_skills_category.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "skills" jsonb DEFAULT '\[\]'::jsonb NOT NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "category" text;/);
  assert.match(sql, /marketplace_jobs_category_enum/);
  assert.match(sql, /'development', 'web3', 'design', 'ai', 'video', 'marketing', 'writing', 'business'/);
  const statements = sql.replace(/^--.*$/gm, "");
  assert.doesNotMatch(statements, /\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME)\b|ALTER COLUMN|ALTER TABLE "(?!marketplace_jobs")/i);
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: { idx: number; tag: string }[] };
  assert.deepEqual(journal.entries.map((e) => e.idx).slice(-2), [9, 10]);
  assert.equal(journal.entries.at(-1)?.tag, "0010_marketplace_job_skills_category");
  const schema = read("lib/server/db/schema.ts");
  assert.match(schema, /skills: jsonb\("skills"\)\.\$type<string\[\]>\(\)\.notNull\(\)\.default\(sql`'\[\]'::jsonb`\)/);
  assert.match(schema, /category: text\("category"\),/);
});

test("handoff wording is source-aware; CreateWizard only swaps the label", () => {
  assert.equal(handoffUseLabel({ source: "gig" }), "Use selected gig");
  assert.equal(handoffUseLabel({ source: "job" }), "Use selected proposal");
  assert.equal(handoffUseLabel({}), "Use selected proposal");
  assert.equal(isCreateHandoff({ source: "gig" }), false);
  const wizard = read("components/create/CreateWizard.tsx");
  assert.match(wizard, /onClick=\{\(\) => chooseHandoff\("import"\)\}>\s*\{handoffUseLabel\(pendingHandoff\.handoff\)\}/);
  assert.doesNotMatch(wizard, />\s*Use selected proposal\s*</);
  const form = read("components/marketplace/MarketplaceJobForm.tsx");
  assert.match(form, /skills: splitSkills\(current\.skills\)/);
  assert.match(form, /category: current\.category/);
  assert.match(read("components/marketplace/MarketplaceJobDetail.tsx"), /<JobTags job=\{job\} \/>/);
});

test("app shell nav: active item marked on desktop and mobile drawer", () => {
  const shell = read("components/shell/AppShell.tsx");
  assert.equal(shell.match(/aria-current=\{active \? "page" : undefined\}/g)?.length, 2);
  assert.match(shell, /active\s*\?\s*"bg-white\/10 text-white/);
  assert.match(read("app/globals.css"), /@layer base \{\s*a \{\s*color: inherit;/);
});
