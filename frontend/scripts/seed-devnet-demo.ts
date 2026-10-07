/**
 * Devnet demo marketplace seed (manual, local use only).
 *
 *   PREMIFLOW_ALLOW_DEMO_SEED=1 npx tsx --env-file=.env.local scripts/seed-devnet-demo.ts [--dry-run | --remove]
 *
 * --dry-run  builds and validates the demo records and prints counts; opens no DB connection.
 * --remove   deletes only the deterministic demo records (demo jobs with proposals are closed instead).
 *
 * Refuses NODE_ENV=production, VERCEL_ENV=production, a non-devnet cluster or a
 * mainnet RPC. Never wired into build, start or install. Never prints env values.
 */
import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import type { MessagingDatabase } from "../lib/server/db/client";
import { createDrizzleMarketplaceStore } from "../lib/server/db/marketplace-store";
import * as schema from "../lib/server/db/schema";
import {
  applyDemoSeed,
  buildDemoSeedData,
  checkDemoSeedAllowed,
  demoSeedCounts,
  removeDemoSeed,
  type DemoSeedStore,
} from "../lib/server/marketplace/demo-seed";

const KNOWN_OPTIONS = new Set(["--dry-run", "--remove"]);

function createDemoSeedStore(db: MessagingDatabase): DemoSeedStore {
  const market = createDrizzleMarketplaceStore(db);
  return {
    getProfile: (wallet) => market.getProfile(wallet),
    upsertProfile: (row) => market.upsertProfile(row),
    getGig: (id) => market.getGig(id),
    insertGig: (row) => market.insertGig(row),
    updateGigForOwner: (id, owner, patch) => market.updateGigForOwner(id, owner, patch),
    deleteGigForOwner: (id, owner) => market.deleteGigForOwner(id, owner),
    getJob: (id) => market.getJob(id),
    insertJob: (row) => market.insertJob(row),
    updateJobIfStatus: (id, expected, patch) => market.updateJobIfStatus(id, expected, patch),
    listProposalsForJob: (jobId) => market.listProposalsForJob(jobId),
    async deleteProfile(wallet) {
      const rows = await db
        .delete(schema.marketplaceProfiles)
        .where(eq(schema.marketplaceProfiles.wallet, wallet))
        .returning({ wallet: schema.marketplaceProfiles.wallet });
      return rows.length > 0;
    },
    async deleteJobForEmployer(id, employer) {
      const rows = await db
        .delete(schema.marketplaceJobs)
        .where(and(eq(schema.marketplaceJobs.id, id), eq(schema.marketplaceJobs.employerWallet, employer)))
        .returning({ id: schema.marketplaceJobs.id });
      return rows.length > 0;
    },
  };
}

function redact(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (!KNOWN_OPTIONS.has(arg)) {
      console.error(`Unknown option: ${arg}. Use --dry-run or --remove.`);
      process.exitCode = 2;
      return;
    }
  }
  const dryRun = args.includes("--dry-run");
  const remove = args.includes("--remove");

  const verdict = checkDemoSeedAllowed({ env: process.env, dryRun });
  if (!verdict.ok) {
    console.error(`Refusing to run the Devnet demo seed: ${verdict.reason}`);
    process.exitCode = 1;
    return;
  }

  const data = buildDemoSeedData(new Date());
  const counts = demoSeedCounts(data);
  console.log(
    `Devnet demo seed: ${counts.profiles} profiles, ${counts.gigs} gigs, ${counts.jobs} jobs (${remove ? "remove" : "seed"}).`
  );
  if (dryRun) {
    console.log("Dry run: records validated; no database connection was opened and nothing was written.");
    return;
  }

  const db = drizzle(neon(process.env.DATABASE_URL!.trim()), { schema }) as MessagingDatabase;
  const store = createDemoSeedStore(db);
  if (remove) {
    const r = await removeDemoSeed(store, data);
    console.log(
      `Removed ${r.profiles} profiles, ${r.gigs} gigs, ${r.jobsDeleted} jobs; closed ${r.jobsClosed} jobs that had proposals.`
    );
    return;
  }
  const r = await applyDemoSeed(store, data);
  console.log(
    `Profiles: ${r.profiles.created} created, ${r.profiles.updated} updated. ` +
      `Gigs: ${r.gigs.created} created, ${r.gigs.updated} updated, ${r.gigs.skipped} skipped. ` +
      `Jobs: ${r.jobs.created} created, ${r.jobs.updated} updated, ${r.jobs.skipped} skipped.`
  );
}

main().catch((err: unknown) => {
  console.error(`Devnet demo seed failed: ${redact(err instanceof Error ? err.message : "unknown error")}`);
  process.exitCode = 1;
});
