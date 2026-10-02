import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createMemoryMarketplaceStore } from "../marketplace/memory-store";
import {
  closeJob,
  createJob,
  getCreateHandoff,
  getJobDetail,
  listMyJobs,
  listMyProposals,
  listOpenJobs,
  selectProposal,
  submitProposal,
  updateJob,
  withdrawProposal,
} from "../marketplace/service";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const OTHER = WALLET_C.toBase58();
const MINT = "So11111111111111111111111111111111111111112";
const T0 = new Date("2026-10-01T00:00:00Z");

type Coded = { status?: number; code?: string };
const code = (status: number, value: string) => (err: Coded) =>
  err.status === status && err.code === value;

async function setup() {
  const store = createMemoryMarketplaceStore();
  const job = await createJob(
    store,
    {
      sessionWallet: EMPLOYER,
      title: "  Landing page build ",
      description: "Build a responsive landing page.",
      paymentMode: "Fixed",
      budgetAmount: "250000000",
      tokenMint: MINT,
    },
    T0
  );
  return { store, job };
}

test("marketplace: job is created from the session wallet only, trimmed and open", async () => {
  const { store, job } = await setup();
  assert.equal(job.employerWallet, EMPLOYER);
  assert.equal(job.title, "Landing page build");
  assert.equal(job.status, "open");
  assert.equal(job.selectedProposalId, null);
  assert.deepEqual((await listOpenJobs(store)).map((j) => j.id), [job.id]);
  assert.deepEqual((await listMyJobs(store, { sessionWallet: EMPLOYER })).map((j) => j.id), [job.id]);
  assert.deepEqual(await listMyJobs(store, { sessionWallet: OTHER }), []);
});

test("marketplace: unauthenticated writes and private reads are rejected", async () => {
  const { store, job } = await setup();
  const unauth = code(401, "unauthenticated");
  await assert.rejects(
    createJob(store, {
      sessionWallet: null,
      title: "x",
      description: "y",
      paymentMode: "Fixed",
      budgetAmount: "1",
      tokenMint: MINT,
    }),
    unauth
  );
  await assert.rejects(updateJob(store, { sessionWallet: null, jobId: job.id, title: "z" }), unauth);
  await assert.rejects(closeJob(store, { sessionWallet: null, jobId: job.id }), unauth);
  await assert.rejects(
    submitProposal(store, { sessionWallet: null, jobId: job.id, message: "m", proposedAmount: "1" }),
    unauth
  );
  await assert.rejects(listMyJobs(store, { sessionWallet: null }), unauth);
  await assert.rejects(listMyProposals(store, { sessionWallet: null }), unauth);
  await assert.rejects(getCreateHandoff(store, { sessionWallet: null, jobId: job.id }), unauth);
  // Anonymous visitors may read an open job but see no proposals.
  const anon = await getJobDetail(store, { sessionWallet: null, jobId: job.id });
  assert.equal(anon.viewerRole, "visitor");
  assert.deepEqual(anon.proposals, []);
});

test("marketplace: input validation (title, mode, base-unit amounts, u64, token)", async () => {
  const store = createMemoryMarketplaceStore();
  const base = {
    sessionWallet: EMPLOYER,
    title: "Job",
    description: "Desc",
    paymentMode: "Fixed",
    budgetAmount: "10",
    tokenMint: MINT,
  };
  const bad = code(400, "invalid_marketplace_input");
  for (const override of [
    { title: "   " },
    { title: "x".repeat(121) },
    { description: "" },
    { paymentMode: "Barter" },
    { budgetAmount: "0" },
    { budgetAmount: "1.5" },
    { budgetAmount: 10 },
    { budgetAmount: "18446744073709551616" },
    { tokenMint: "not-a-key" },
  ]) {
    await assert.rejects(createJob(store, { ...base, ...override }), bad);
  }
  for (const mode of ["Fixed", "Milestone", "Streaming", "Hourly"]) {
    const job = await createJob(store, { ...base, paymentMode: mode });
    assert.equal(job.paymentMode, mode);
  }
  const max = await createJob(store, { ...base, budgetAmount: "18446744073709551615" });
  assert.equal(max.budgetAmount, "18446744073709551615");
});

test("marketplace: only the owner edits or closes an open job", async () => {
  const { store, job } = await setup();
  await assert.rejects(
    updateJob(store, { sessionWallet: OTHER, jobId: job.id, title: "Hijack" }),
    code(403, "forbidden")
  );
  await assert.rejects(closeJob(store, { sessionWallet: FREELANCER, jobId: job.id }), code(403, "forbidden"));
  const edited = await updateJob(store, {
    sessionWallet: EMPLOYER,
    jobId: job.id,
    title: "Landing page v2",
    paymentMode: "Hourly",
    budgetAmount: "5000000",
  });
  assert.equal(edited.title, "Landing page v2");
  assert.equal(edited.paymentMode, "Hourly");
  assert.equal(edited.employerWallet, EMPLOYER);
  const closed = await closeJob(store, { sessionWallet: EMPLOYER, jobId: job.id }, T0);
  assert.equal(closed.status, "closed");
  assert.equal(closed.closedAt, T0.toISOString());
  await assert.rejects(
    updateJob(store, { sessionWallet: EMPLOYER, jobId: job.id, title: "again" }),
    code(409, "job_not_open")
  );
  await assert.rejects(closeJob(store, { sessionWallet: EMPLOYER, jobId: job.id }), code(409, "job_not_open"));
  assert.deepEqual(await listOpenJobs(store), []);
  // Closed jobs are hidden from visitors who never proposed.
  await assert.rejects(getJobDetail(store, { sessionWallet: OTHER, jobId: job.id }), code(404, "not_found"));
  await assert.rejects(getJobDetail(store, { sessionWallet: null, jobId: "nope" }), code(404, "not_found"));
});

test("marketplace: proposal lifecycle (self-proposal, duplicate, withdraw, resubmit, closed job)", async () => {
  const { store, job } = await setup();
  await assert.rejects(
    submitProposal(store, { sessionWallet: EMPLOYER, jobId: job.id, message: "me", proposedAmount: "1" }),
    code(403, "own_job")
  );
  const proposal = await submitProposal(store, {
    sessionWallet: FREELANCER,
    jobId: job.id,
    message: "I can do this in a week.",
    proposedAmount: "240000000",
  });
  assert.equal(proposal.freelancerWallet, FREELANCER);
  assert.equal(proposal.status, "submitted");
  await assert.rejects(
    submitProposal(store, { sessionWallet: FREELANCER, jobId: job.id, message: "again", proposedAmount: "1" }),
    code(409, "duplicate_proposal")
  );
  await assert.rejects(
    withdrawProposal(store, { sessionWallet: OTHER, proposalId: proposal.id }),
    code(403, "forbidden")
  );
  await assert.rejects(
    withdrawProposal(store, { sessionWallet: EMPLOYER, proposalId: proposal.id }),
    code(403, "forbidden")
  );
  const withdrawn = await withdrawProposal(store, { sessionWallet: FREELANCER, proposalId: proposal.id });
  assert.equal(withdrawn.status, "withdrawn");
  await assert.rejects(
    withdrawProposal(store, { sessionWallet: FREELANCER, proposalId: proposal.id }),
    code(409, "proposal_not_submitted")
  );
  const again = await submitProposal(store, {
    sessionWallet: FREELANCER,
    jobId: job.id,
    message: "Updated offer.",
    proposedAmount: "230000000",
  });
  assert.equal(again.status, "submitted");
  // Visibility: owner sees all proposals, freelancer only their own, others none.
  const ownerView = await getJobDetail(store, { sessionWallet: EMPLOYER, jobId: job.id });
  assert.equal(ownerView.viewerRole, "owner");
  assert.equal(ownerView.proposals.length, 2);
  const freelancerView = await getJobDetail(store, { sessionWallet: FREELANCER, jobId: job.id });
  assert.equal(freelancerView.viewerRole, "freelancer");
  assert.deepEqual(freelancerView.proposals, []);
  assert.ok(freelancerView.ownProposal);
  const otherView = await getJobDetail(store, { sessionWallet: OTHER, jobId: job.id });
  assert.equal(otherView.viewerRole, "visitor");
  assert.equal(otherView.ownProposal, null);

  await closeJob(store, { sessionWallet: EMPLOYER, jobId: job.id });
  await assert.rejects(
    submitProposal(store, { sessionWallet: OTHER, jobId: job.id, message: "late", proposedAmount: "1" }),
    code(409, "job_not_open")
  );
  await assert.rejects(
    withdrawProposal(store, { sessionWallet: FREELANCER, proposalId: again.id }),
    code(409, "job_not_open")
  );
  // A wallet that proposed can still see the closed job.
  const after = await getJobDetail(store, { sessionWallet: FREELANCER, jobId: job.id });
  assert.equal(after.job.status, "closed");
});

test("marketplace: selection fills the job, selects one, rejects other submitted", async () => {
  const { store, job } = await setup();
  const a = await submitProposal(store, {
    sessionWallet: FREELANCER,
    jobId: job.id,
    message: "A",
    proposedAmount: "200000000",
  });
  const b = await submitProposal(store, {
    sessionWallet: OTHER,
    jobId: job.id,
    message: "B",
    proposedAmount: "210000000",
  });
  await assert.rejects(
    selectProposal(store, { sessionWallet: FREELANCER, jobId: job.id, proposalId: a.id }),
    code(403, "forbidden")
  );
  await assert.rejects(
    getCreateHandoff(store, { sessionWallet: EMPLOYER, jobId: job.id }),
    code(409, "job_not_filled")
  );
  const detail = await selectProposal(store, { sessionWallet: EMPLOYER, jobId: job.id, proposalId: a.id });
  assert.equal(detail.job.status, "filled");
  assert.equal(detail.job.selectedProposalId, a.id);
  const byId = Object.fromEntries(detail.proposals.map((p) => [p.id, p.status]));
  assert.equal(byId[a.id], "selected");
  assert.equal(byId[b.id], "rejected");
  await assert.rejects(
    selectProposal(store, { sessionWallet: EMPLOYER, jobId: job.id, proposalId: b.id }),
    code(409, "job_not_open")
  );
  await assert.rejects(
    submitProposal(store, { sessionWallet: WALLET_C.toBase58(), jobId: job.id, message: "x", proposedAmount: "1" }),
    code(409, "job_not_open")
  );
  await assert.rejects(
    withdrawProposal(store, { sessionWallet: FREELANCER, proposalId: a.id }),
    code(409, "job_not_open")
  );
  assert.deepEqual(await listOpenJobs(store), []);
  const mine = await listMyProposals(store, { sessionWallet: FREELANCER });
  assert.equal(mine[0].proposal.status, "selected");
  assert.equal(mine[0].job?.status, "filled");

  // Handoff: owner only, carries selected terms, never mint/resolver/decimals.
  await assert.rejects(getCreateHandoff(store, { sessionWallet: FREELANCER, jobId: job.id }), code(403, "forbidden"));
  const handoff = await getCreateHandoff(store, { sessionWallet: EMPLOYER, jobId: job.id });
  assert.deepEqual(handoff, {
    jobId: job.id,
    proposalId: a.id,
    title: "Landing page build",
    description: "Build a responsive landing page.",
    paymentMode: "Fixed",
    amount: "200000000",
    freelancerWallet: FREELANCER,
  });
});

test("marketplace: selecting a withdrawn or foreign proposal is rejected", async () => {
  const { store, job } = await setup();
  const other = await createJob(store, {
    sessionWallet: EMPLOYER,
    title: "Other",
    description: "Other job",
    paymentMode: "Streaming",
    budgetAmount: "5",
    tokenMint: MINT,
  });
  const foreign = await submitProposal(store, {
    sessionWallet: FREELANCER,
    jobId: other.id,
    message: "F",
    proposedAmount: "5",
  });
  await assert.rejects(
    selectProposal(store, { sessionWallet: EMPLOYER, jobId: job.id, proposalId: foreign.id }),
    code(404, "not_found")
  );
  const p = await submitProposal(store, { sessionWallet: OTHER, jobId: job.id, message: "P", proposedAmount: "5" });
  await withdrawProposal(store, { sessionWallet: OTHER, proposalId: p.id });
  await assert.rejects(
    selectProposal(store, { sessionWallet: EMPLOYER, jobId: job.id, proposalId: p.id }),
    code(409, "proposal_not_submitted")
  );
  assert.equal((await getJobDetail(store, { sessionWallet: EMPLOYER, jobId: job.id })).job.status, "open");
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test("marketplace routes: wallet only from the signed session, origin-checked writes", () => {
  const routes = walk("app/api/marketplace").filter((f) => f.endsWith("route.ts"));
  assert.equal(routes.length, 14);
  for (const file of routes) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /body\.(employerWallet|freelancerWallet|wallet|sessionWallet|tokenMint)/, file);
    const writeAt = source.search(/export async function (POST|PATCH|PUT|DELETE)/);
    if (writeAt >= 0) {
      const writer = source.slice(writeAt);
      assert.match(writer, /requireMutatingOrigin\(request\)/, file);
      assert.match(writer, /await marketplaceSessionWallet\(request, ctx\)/, file);
      assert.match(writer, /sessionWallet: wallet/, file);
      assert.doesNotMatch(writer, /optionalMarketplaceSessionWallet/, file);
    }
  }
  const ctx = readFileSync("lib/server/marketplace/route-context.ts", "utf8");
  assert.match(ctx, /requireSession\(request, ctx\.stores, ctx\.env\)/);
  assert.match(ctx, /session\.walletAddress/);
});

test("marketplace migration: additive, journaled, constrained, not applied by tests", () => {
  const sql = readFileSync("drizzle/0008_marketplace_jobs.sql", "utf8");
  assert.match(sql, /CREATE TABLE "marketplace_jobs"/);
  assert.match(sql, /CREATE TABLE "marketplace_proposals"/);
  assert.match(sql, /CREATE UNIQUE INDEX "marketplace_proposals_job_freelancer_active_uidx"[\s\S]*WHERE "status" in \('submitted', 'selected'\)/);
  assert.match(sql, /marketplace_jobs_status_enum/);
  assert.match(sql, /marketplace_proposals_status_enum/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE FROM)\b|ALTER TABLE "(?!marketplace_)/);
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  const jobsEntry = journal.entries.find((e) => e.idx === 8);
  assert.equal(jobsEntry?.tag, "0008_marketplace_jobs");
  const last = journal.entries[journal.entries.length - 1];
  assert.deepEqual([last.idx, last.tag], [9, "0009_marketplace_profiles_gigs"]);
  const schema = readFileSync("lib/server/db/schema.ts", "utf8");
  assert.match(schema, /pgTable\(\s*"marketplace_jobs"/);
  assert.match(schema, /pgTable\(\s*"marketplace_proposals"/);
});
