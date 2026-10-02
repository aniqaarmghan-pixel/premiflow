import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { Keypair } from "@solana/web3.js";

import { createMemoryNotificationStore } from "../memory-stores";
import { HttpError } from "../http";
import { NOTIFICATION_KINDS } from "../notifications/kinds";
import { listNotifications } from "../notifications/service";
import type { ContractFacts, ContractFactsReader } from "../marketplace/contract-reader";
import { createGig } from "../marketplace/catalog-service";
import { listSavedIds, saveListing } from "../marketplace/favorites-service";
import { createMemoryMarketplaceStore } from "../marketplace/memory-store";
import {
  notifyProposalReceived,
  notifyProposalSelected,
  notifyProposalWithdrawn,
} from "../marketplace/proposal-notices";
import { closeJob, createJob, selectProposal, submitProposal, withdrawProposal } from "../marketplace/service";
import {
  deriveTrustSummary,
  getReviewEligibility,
  getShortlist,
  getTrustSummary,
  inviteFreelancer,
  linkContract,
  listContractLinks,
  listJobInvitations,
  listMyInvitations,
  respondToInvitation,
  setShortlisted,
  submitReview,
  type TrustDeps,
} from "../marketplace/trust-service";
import { createMemoryMarketplaceTrustStore, type MarketplaceReviewRecord } from "../marketplace/trust-store";
import { createSavedIdsStore, isSavedIn } from "@/lib/app/marketplace-saved-store";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const OTHER = WALLET_C.toBase58();
const MINT = "So11111111111111111111111111111111111111112";
const T0 = new Date("2026-10-01T00:00:00Z");

type Coded = { status?: number; code?: string };
const code = (status: number, value: string) => (err: Coded) => err.status === status && err.code === value;

const newAddress = () => Keypair.generate().publicKey.toBase58();

function fakeChain() {
  const contracts = new Map<string, ContractFacts>();
  const reader: ContractFactsReader = async (address) => {
    const facts = contracts.get(address);
    if (!facts) throw new HttpError(404, "contract_not_found", "No PREMIFLOW contract exists at that address.");
    return facts;
  };
  const put = (facts: Omit<ContractFacts, "address">) => {
    const address = newAddress();
    contracts.set(address, { address, ...facts });
    return address;
  };
  return { reader, put, contracts };
}

async function setup() {
  const market = createMemoryMarketplaceStore();
  const trust = createMemoryMarketplaceTrustStore();
  const notifications = createMemoryNotificationStore();
  const chain = fakeChain();
  const deps: TrustDeps = { market, trust, notifications, readContract: chain.reader };
  const job = await createJob(
    market,
    {
      sessionWallet: EMPLOYER,
      title: "Landing page build",
      description: "Build a responsive landing page.",
      paymentMode: "Fixed",
      budgetAmount: "250000000",
      tokenMint: MINT,
    },
    T0
  );
  return { market, trust, notifications, chain, deps, job };
}

async function inbox(store: ReturnType<typeof createMemoryNotificationStore>, wallet: string) {
  const { notifications } = await listNotifications(store, { recipientWallet: wallet, cursor: null, limit: "50" });
  return notifications.map((n) => n.type);
}

/* ---------------- verified reviews ---------------- */

test("reviews: rejected unless the contract is Completed on-chain", async () => {
  const { deps, chain } = await setup();
  for (const status of ["Pending", "Active", "Paused", "Disputed", "Cancelled"] as const) {
    const addr = chain.put({ employer: EMPLOYER, freelancer: FREELANCER, status } as Omit<ContractFacts, "address">);
    await assert.rejects(
      submitReview(deps, { sessionWallet: EMPLOYER, contractAddress: addr, score: 5, body: "" }),
      code(409, "contract_not_completed")
    );
    const e = await getReviewEligibility(deps, { sessionWallet: EMPLOYER, contractAddress: addr });
    assert.equal(e.eligible, false);
    assert.equal(e.reason, "not_completed");
  }
  await assert.rejects(
    submitReview(deps, { sessionWallet: EMPLOYER, contractAddress: newAddress(), score: 5, body: "" }),
    code(404, "contract_not_found")
  );
  await assert.rejects(
    submitReview(deps, { sessionWallet: null, contractAddress: newAddress(), score: 5, body: "" }),
    code(401, "unauthenticated")
  );
});

test("reviews: non-participants and self-review are rejected", async () => {
  const { deps, chain } = await setup();
  const addr = chain.put({ employer: EMPLOYER, freelancer: FREELANCER, status: "Completed" });
  await assert.rejects(
    submitReview(deps, { sessionWallet: OTHER, contractAddress: addr, score: 4, body: "" }),
    code(403, "not_participant")
  );
  const e = await getReviewEligibility(deps, { sessionWallet: OTHER, contractAddress: addr });
  assert.equal(e.reason, "not_participant");
  const selfAddr = chain.put({ employer: EMPLOYER, freelancer: EMPLOYER, status: "Completed" });
  await assert.rejects(
    submitReview(deps, { sessionWallet: EMPLOYER, contractAddress: selfAddr, score: 5, body: "" }),
    code(403, "self_review")
  );
});

test("reviews: bounded score/body; counterparty only; duplicate rejected; reviewee notified", async () => {
  const { deps, chain, notifications } = await setup();
  const addr = chain.put({ employer: EMPLOYER, freelancer: FREELANCER, status: "Completed" });
  for (const score of [0, 6, 2.5, "x", null]) {
    await assert.rejects(
      submitReview(deps, { sessionWallet: EMPLOYER, contractAddress: addr, score, body: "" }),
      code(400, "invalid_marketplace_input")
    );
  }
  await assert.rejects(
    submitReview(deps, { sessionWallet: EMPLOYER, contractAddress: addr, score: 5, body: "x".repeat(1001) }),
    code(400, "invalid_marketplace_input")
  );
  const review = await submitReview(
    deps,
    { sessionWallet: EMPLOYER, contractAddress: addr, score: 5, body: "Great work." },
    T0
  );
  assert.equal(review.revieweeWallet, FREELANCER);
  assert.equal(review.reviewerRole, "employer");
  await assert.rejects(
    submitReview(deps, { sessionWallet: EMPLOYER, contractAddress: addr, score: 3, body: "" }),
    code(409, "duplicate_review")
  );
  const again = await getReviewEligibility(deps, { sessionWallet: EMPLOYER, contractAddress: addr });
  assert.equal(again.reason, "already_reviewed");
  const back = await submitReview(deps, { sessionWallet: FREELANCER, contractAddress: addr, score: 4, body: "" });
  assert.equal(back.revieweeWallet, EMPLOYER);
  assert.equal(back.reviewerRole, "freelancer");
  assert.deepEqual(await inbox(notifications, FREELANCER), ["marketplace_review_received"]);
  assert.deepEqual(await inbox(notifications, EMPLOYER), ["marketplace_review_received"]);
  assert.deepEqual(await inbox(notifications, OTHER), []);
});

/* ---------------- reputation (computed) ---------------- */

test("trust summary: derived only from verified reviews, honest when empty", async () => {
  const { deps, chain } = await setup();
  const empty = await getTrustSummary(deps, { wallet: FREELANCER });
  assert.equal(empty.reviewCount, 0);
  assert.equal(empty.averageScore, null);
  assert.equal(empty.completedContracts, 0);
  for (const score of [5, 4, 4]) {
    const addr = chain.put({ employer: EMPLOYER, freelancer: FREELANCER, status: "Completed" });
    await submitReview(deps, { sessionWallet: EMPLOYER, contractAddress: addr, score, body: "" });
  }
  const s = await getTrustSummary(deps, { wallet: FREELANCER });
  assert.equal(s.reviewCount, 3);
  assert.equal(s.averageScore, 4.3);
  assert.equal(s.completedContracts, 3);
  assert.equal(s.asFreelancerCount, 3);
  assert.equal(s.asEmployerCount, 0);
  assert.equal(s.recent.length, 3);
  const employerSide = await getTrustSummary(deps, { wallet: EMPLOYER });
  assert.equal(employerSide.reviewCount, 0);
  await assert.rejects(getTrustSummary(deps, { wallet: "not-a-wallet" }), code(404, "not_found"));

  const forged: MarketplaceReviewRecord = {
    id: "x",
    contractAddress: newAddress(),
    reviewerWallet: OTHER,
    revieweeWallet: OTHER,
    reviewerRole: "employer",
    score: 5,
    body: "",
    createdAt: T0,
  };
  assert.equal(deriveTrustSummary(OTHER, [forged]).reviewCount, 0, "self rows never count");
});

/* ---------------- invitations ---------------- */

test("invitations: owner-only, no duplicates, closed jobs blocked, freelancer answers", async () => {
  const { deps, job, notifications, market } = await setup();
  await assert.rejects(
    inviteFreelancer(deps, { sessionWallet: OTHER, jobId: job.id, invitee: FREELANCER, message: "" }),
    code(403, "forbidden")
  );
  await assert.rejects(
    inviteFreelancer(deps, { sessionWallet: EMPLOYER, jobId: job.id, invitee: EMPLOYER, message: "" }),
    code(400, "invalid_marketplace_input")
  );
  await assert.rejects(
    inviteFreelancer(deps, { sessionWallet: EMPLOYER, jobId: job.id, invitee: "nope", message: "" }),
    code(400, "invalid_marketplace_input")
  );
  const inv = await inviteFreelancer(deps, {
    sessionWallet: EMPLOYER,
    jobId: job.id,
    invitee: FREELANCER,
    message: "Would love your proposal.",
  });
  assert.equal(inv.status, "pending");
  await assert.rejects(
    inviteFreelancer(deps, { sessionWallet: EMPLOYER, jobId: job.id, invitee: FREELANCER, message: "" }),
    code(409, "duplicate_invitation")
  );
  assert.deepEqual(await inbox(notifications, FREELANCER), ["marketplace_invitation_received"]);
  await assert.rejects(listJobInvitations(deps, { sessionWallet: FREELANCER, jobId: job.id }), code(403, "forbidden"));
  assert.equal((await listJobInvitations(deps, { sessionWallet: EMPLOYER, jobId: job.id })).length, 1);
  assert.equal((await listMyInvitations(deps, { sessionWallet: FREELANCER })).length, 1);
  assert.equal((await listMyInvitations(deps, { sessionWallet: OTHER })).length, 0);

  await assert.rejects(
    respondToInvitation(deps, { sessionWallet: EMPLOYER, invitationId: inv.id, action: "accept" }),
    code(403, "forbidden")
  );
  await assert.rejects(
    respondToInvitation(deps, { sessionWallet: FREELANCER, invitationId: inv.id, action: "maybe" }),
    code(400, "invalid_marketplace_input")
  );
  const accepted = await respondToInvitation(deps, { sessionWallet: FREELANCER, invitationId: inv.id, action: "accept" });
  assert.equal(accepted.status, "accepted");
  await assert.rejects(
    respondToInvitation(deps, { sessionWallet: FREELANCER, invitationId: inv.id, action: "decline" }),
    code(409, "invitation_answered")
  );
  assert.deepEqual(await inbox(notifications, EMPLOYER), ["marketplace_invitation_accepted"]);

  const second = await inviteFreelancer(deps, { sessionWallet: EMPLOYER, jobId: job.id, invitee: OTHER, message: "" });
  await closeJob(market, { sessionWallet: EMPLOYER, jobId: job.id });
  await assert.rejects(
    inviteFreelancer(deps, { sessionWallet: EMPLOYER, jobId: job.id, invitee: MINT, message: "" }),
    code(409, "job_not_open")
  );
  await assert.rejects(
    respondToInvitation(deps, { sessionWallet: OTHER, invitationId: second.id, action: "accept" }),
    code(409, "job_not_open")
  );
  const declined = await respondToInvitation(deps, { sessionWallet: OTHER, invitationId: second.id, action: "decline" });
  assert.equal(declined.status, "declined");
});

/* ---------------- shortlist ---------------- */

test("shortlist: owner-only and private to the employer", async () => {
  const { deps, job, market } = await setup();
  const proposal = await submitProposal(market, {
    sessionWallet: FREELANCER,
    jobId: job.id,
    message: "I can do it.",
    proposedAmount: "200000000",
  });
  const other = await createJob(market, {
    sessionWallet: EMPLOYER,
    title: "Other",
    description: "Other job.",
    paymentMode: "Fixed",
    budgetAmount: "1000",
    tokenMint: MINT,
  });
  const res = await setShortlisted(deps, {
    sessionWallet: EMPLOYER,
    jobId: job.id,
    proposalId: proposal.id,
    shortlisted: true,
  });
  assert.deepEqual(res.proposalIds, [proposal.id]);
  await assert.rejects(getShortlist(deps, { sessionWallet: FREELANCER, jobId: job.id }), code(403, "forbidden"));
  await assert.rejects(getShortlist(deps, { sessionWallet: OTHER, jobId: job.id }), code(403, "forbidden"));
  await assert.rejects(getShortlist(deps, { sessionWallet: null, jobId: job.id }), code(401, "unauthenticated"));
  await assert.rejects(
    setShortlisted(deps, { sessionWallet: FREELANCER, jobId: job.id, proposalId: proposal.id, shortlisted: true }),
    code(403, "forbidden")
  );
  await assert.rejects(
    setShortlisted(deps, { sessionWallet: EMPLOYER, jobId: other.id, proposalId: proposal.id, shortlisted: true }),
    code(404, "not_found")
  );
  const cleared = await setShortlisted(deps, {
    sessionWallet: EMPLOYER,
    jobId: job.id,
    proposalId: proposal.id,
    shortlisted: false,
  });
  assert.deepEqual(cleared.proposalIds, []);
});

/* ---------------- notifications ---------------- */

test("notifications: proposal events reach only the intended recipient", async () => {
  const { market, notifications, job } = await setup();
  const p = await submitProposal(market, {
    sessionWallet: FREELANCER,
    jobId: job.id,
    message: "Hello",
    proposedAmount: "100",
  });
  await notifyProposalReceived(market, notifications, p.id);
  assert.deepEqual(await inbox(notifications, EMPLOYER), ["marketplace_proposal_received"]);
  assert.deepEqual(await inbox(notifications, FREELANCER), []);
  await withdrawProposal(market, { sessionWallet: FREELANCER, proposalId: p.id });
  await notifyProposalWithdrawn(market, notifications, p.id);
  assert.equal((await inbox(notifications, EMPLOYER)).filter((k) => k === "marketplace_proposal_withdrawn").length, 1);
  const p2 = await submitProposal(market, { sessionWallet: OTHER, jobId: job.id, message: "Me", proposedAmount: "100" });
  await selectProposal(market, { sessionWallet: EMPLOYER, jobId: job.id, proposalId: p2.id });
  await notifyProposalSelected(market, notifications, job.id);
  await notifyProposalSelected(market, notifications, job.id);
  assert.deepEqual(await inbox(notifications, OTHER), ["marketplace_proposal_selected"], "idempotent");
  assert.deepEqual(await inbox(notifications, FREELANCER), []);
  // Best effort: a missing proposal never throws.
  await notifyProposalReceived(market, notifications, "00000000-0000-4000-8000-000000000000");
  for (const kind of [
    "marketplace_proposal_received",
    "marketplace_invitation_received",
    "marketplace_gig_hired",
    "marketplace_review_eligible",
    "marketplace_review_received",
  ]) {
    assert.ok((NOTIFICATION_KINDS as readonly string[]).includes(kind), kind);
  }
});

/* ---------------- contract links ---------------- */

test("contract links: verified against chain parties; mismatches rejected; party-only reads", async () => {
  const { deps, job, market, chain, notifications } = await setup();
  const p = await submitProposal(market, { sessionWallet: FREELANCER, jobId: job.id, message: "Hi", proposedAmount: "1" });
  const good = chain.put({ employer: EMPLOYER, freelancer: FREELANCER, status: "Active" });
  const linkInput = (addr: string) => ({
    sessionWallet: EMPLOYER,
    contractAddress: addr,
    source: "job",
    jobId: job.id,
    proposalId: p.id,
  });
  await assert.rejects(linkContract(deps, linkInput(good)), code(409, "proposal_not_selected"));
  await selectProposal(market, { sessionWallet: EMPLOYER, jobId: job.id, proposalId: p.id });

  const wrongFreelancer = chain.put({ employer: EMPLOYER, freelancer: OTHER, status: "Active" });
  await assert.rejects(linkContract(deps, linkInput(wrongFreelancer)), code(409, "contract_mismatch"));
  const wrongEmployer = chain.put({ employer: OTHER, freelancer: FREELANCER, status: "Active" });
  await assert.rejects(
    linkContract(deps, { ...linkInput(wrongEmployer), sessionWallet: FREELANCER }),
    code(409, "contract_mismatch")
  );
  await assert.rejects(linkContract(deps, { ...linkInput(good), sessionWallet: OTHER }), code(403, "not_participant"));
  await assert.rejects(linkContract(deps, linkInput(newAddress())), code(404, "contract_not_found"));
  await assert.rejects(linkContract(deps, linkInput("bad")), code(400, "invalid_marketplace_input"));
  await assert.rejects(linkContract(deps, { ...linkInput(good), source: "other" }), code(400, "invalid_marketplace_input"));

  const first = await linkContract(deps, linkInput(good));
  assert.equal(first.created, true);
  assert.equal(first.link.freelancerWallet, FREELANCER);
  const repeat = await linkContract(deps, { ...linkInput(good), sessionWallet: FREELANCER });
  assert.equal(repeat.created, false);

  const views = await listContractLinks(deps, { sessionWallet: FREELANCER, jobId: job.id });
  assert.equal(views.length, 1);
  assert.equal(views[0].status, "Active");
  assert.deepEqual(await listContractLinks(deps, { sessionWallet: OTHER, jobId: job.id }), []);

  // Gig: contract freelancer must be the gig seller; one listing per contract.
  const gig = await createGig(market, {
    sessionWallet: FREELANCER,
    body: { title: "Logo design", description: "Three logo concepts.", skills: ["design"], paymentMode: "Fixed", priceAmount: "150000000" },
    tokenMint: MINT,
  });
  await assert.rejects(
    linkContract(deps, { sessionWallet: EMPLOYER, contractAddress: good, source: "gig", gigId: gig.id }),
    code(409, "contract_already_linked")
  );
  const wrongSeller = chain.put({ employer: EMPLOYER, freelancer: OTHER, status: "Completed" });
  await assert.rejects(
    linkContract(deps, { sessionWallet: EMPLOYER, contractAddress: wrongSeller, source: "gig", gigId: gig.id }),
    code(409, "contract_mismatch")
  );
  const done = chain.put({ employer: EMPLOYER, freelancer: FREELANCER, status: "Completed" });
  const gigLink = await linkContract(deps, { sessionWallet: EMPLOYER, contractAddress: done, source: "gig", gigId: gig.id });
  assert.equal(gigLink.created, true);
  const freelancerInbox = await inbox(notifications, FREELANCER);
  assert.ok(freelancerInbox.includes("marketplace_gig_hired"));
  assert.ok(freelancerInbox.includes("marketplace_review_eligible"));
  assert.ok((await inbox(notifications, EMPLOYER)).includes("marketplace_review_eligible"));
  assert.deepEqual(await inbox(notifications, OTHER), []);
  const gigViews = await listContractLinks(deps, { sessionWallet: EMPLOYER, gigId: gig.id });
  assert.equal(gigViews[0].status, "Completed");
});

/* ---------------- save batching ---------------- */

test("saved ids: one shared request per wallet for every Save button", async () => {
  let calls = 0;
  const store = createSavedIdsStore(async () => {
    calls += 1;
    return { jobs: ["j1"], gigs: ["g1"] };
  });
  await Promise.all(Array.from({ length: 12 }, () => store.ensure("w1")));
  await store.ensure("w1");
  assert.equal(calls, 1);
  const snap = store.getSnapshot();
  assert.equal(snap.status, "ready");
  assert.ok(isSavedIn(snap, "job", "j1"));
  assert.ok(isSavedIn(snap, "gig", "g1"));
  assert.ok(!isSavedIn(snap, "job", "g1"));
  let notified = 0;
  const off = store.subscribe(() => (notified += 1));
  store.setSaved("job", "j2", true);
  store.setSaved("job", "j1", false);
  off();
  assert.equal(notified, 2);
  assert.ok(isSavedIn(store.getSnapshot(), "job", "j2"));
  assert.ok(!isSavedIn(store.getSnapshot(), "job", "j1"));
  await store.ensure("w2");
  assert.equal(calls, 2, "wallet switch refetches");
  await store.ensure(null);
  assert.equal(store.getSnapshot().jobs.size, 0);

  const { market, job } = await setup();
  await saveListing(market, { sessionWallet: FREELANCER, targetType: "job", targetId: job.id });
  assert.deepEqual(await listSavedIds(market, { sessionWallet: FREELANCER }), { jobs: [job.id], gigs: [] });
  assert.deepEqual(await listSavedIds(market, { sessionWallet: OTHER }), { jobs: [], gigs: [] });
  await assert.rejects(listSavedIds(market, { sessionWallet: null }), code(401, "unauthenticated"));
  const toggle = readFileSync("components/marketplace/MarketplaceSaveToggle.tsx", "utf8");
  assert.doesNotMatch(toggle, /fetchSaved\b/);
  assert.match(toggle, /fetchSavedIds/);
});

/* ---------------- migration + guards ---------------- */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test("migration 0012: additive, journaled, constrained, not applied by tests", () => {
  const sql = readFileSync("drizzle/0012_marketplace_trust_hiring.sql", "utf8");
  for (const table of ["marketplace_reviews", "marketplace_invitations", "marketplace_shortlist", "marketplace_contract_links"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  }
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_reviews_reviewer_contract_uidx"[^\n]*\("reviewer_wallet","contract_address"\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_invitations_job_freelancer_uidx"/);
  assert.match(sql, /"score" >= 1 and "score" <= 5/);
  assert.match(sql, /"reviewer_wallet" <> "reviewee_wallet"/);
  assert.doesNotMatch(sql, /\b(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|UPDATE )\b/);
  const drops = sql.match(/DROP [A-Z ]+/g) ?? [];
  assert.deepEqual(drops, ["DROP CONSTRAINT IF EXISTS "]);
  for (const kind of NOTIFICATION_KINDS) assert.match(sql, new RegExp(`'${kind}'`), kind);
  const schema = readFileSync("lib/server/db/schema.ts", "utf8");
  for (const kind of NOTIFICATION_KINDS) assert.match(schema, new RegExp(`'${kind}'`), kind);
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/--.*$/gm, "");
  for (const file of [
    "drizzle/0012_marketplace_trust_hiring.sql",
    "lib/server/marketplace/trust-store.ts",
    "lib/server/db/marketplace-trust-store.ts",
  ]) {
    assert.doesNotMatch(strip(readFileSync(file, "utf8")), /\b(rating|ratings|reputation|review_score|stars)\b/, file);
  }
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: { idx: number; tag: string; when: number }[];
  };
  const last = journal.entries.at(-1)!;
  assert.deepEqual([last.idx, last.tag], [12, "0012_marketplace_trust_hiring"]);
  assert.ok(last.when > journal.entries.at(-2)!.when);
});

test("trust routes: session wallet only, chain-verified, no wallet from the body", () => {
  const routes = walk("app/api/marketplace").filter((f) => f.endsWith("route.ts"));
  const trustRoutes = routes.filter((f) => /reviews|trust|invitations|shortlist|contract-links|saved[\\/]ids/.test(f));
  assert.equal(trustRoutes.length, 8);
  for (const file of trustRoutes) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /body\.(employerWallet|freelancerWallet|wallet|sessionWallet|reviewee|status)\b/, file);
    assert.doesNotMatch(source, /sendTransaction|signTransaction|createContract\(/, file);
  }
  const ctx = readFileSync("lib/server/marketplace/route-context.ts", "utf8");
  assert.match(ctx, /snapshotFactsReader\(base\.env\.solanaRpcUrl\)/);
});
