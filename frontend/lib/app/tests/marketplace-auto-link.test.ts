import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Keypair } from "@solana/web3.js";

import {
  loadPendingHandoff,
  resolveHandoffChoice,
  savePendingHandoff,
} from "@/lib/app/marketplace-handoff-store";
import {
  bindMarketplaceSource,
  classifyLinkError,
  clearMarketplaceSource,
  confirmPendingLink,
  dropAwaitingLinks,
  loadMarketplaceSource,
  loadPendingLinks,
  marketplaceSourceKey,
  pendingLinkKey,
  runPendingLinks,
  saveMarketplaceSource,
  type LinkRequest,
} from "@/lib/app/marketplace-link-store";
import {
  createIntentStorageKey,
  type IntentScope,
  type IntentStorage,
} from "@/lib/app/milestone-create-plan";
import { HttpError } from "@/lib/server/http";
import { createMemoryNotificationStore } from "@/lib/server/memory-stores";
import { createGig } from "@/lib/server/marketplace/catalog-service";
import type { ContractFacts } from "@/lib/server/marketplace/contract-reader";
import { createMemoryMarketplaceStore } from "@/lib/server/marketplace/memory-store";
import { createJob, getCreateHandoff, selectProposal, submitProposal } from "@/lib/server/marketplace/service";
import type { CreateHandoff } from "@/lib/server/marketplace/service";
import { linkContract, listContractLinks, type TrustDeps } from "@/lib/server/marketplace/trust-service";
import { createMemoryMarketplaceTrustStore } from "@/lib/server/marketplace/trust-store";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const SCOPE: IntentScope = { cluster: "devnet", programId: "Prog1111111111111111111111111111111111111111" };
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const OTHER = WALLET_C.toBase58();
const MINT = "So11111111111111111111111111111111111111112";
const NOW = 1_790_000_000_000;

function memoryStorage(): IntentStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const jobHandoff = (over: Partial<CreateHandoff> = {}): CreateHandoff => ({
  jobId: "11111111-1111-4111-8111-111111111111",
  proposalId: "22222222-2222-4222-8222-222222222222",
  title: "Landing page",
  description: "Build it.",
  paymentMode: "Fixed",
  amount: "1000",
  freelancerWallet: FREELANCER,
  ...over,
});

const gigHandoff = (): CreateHandoff => ({
  source: "gig",
  gigId: "33333333-3333-4333-8333-333333333333",
  packageTier: "standard",
  jobId: "",
  proposalId: "",
  title: "Logo",
  description: "Logos.",
  paymentMode: "Fixed",
  amount: "500",
  freelancerWallet: FREELANCER,
});

const addr = () => Keypair.generate().publicKey.toBase58();

function recorder(fail: (n: number) => unknown = () => null) {
  const calls: LinkRequest[] = [];
  return {
    calls,
    link: async (req: LinkRequest) => {
      calls.push(req);
      const err = fail(calls.length);
      if (err) throw err;
      return { created: true };
    },
  };
}

test("auto-link: imported proposal -> intent -> confirmed -> one link call, marker cleared", async () => {
  const storage = memoryStorage();
  assert.ok(saveMarketplaceSource(storage, SCOPE, EMPLOYER, jobHandoff(), NOW));
  const contract = addr();
  const bound = bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: contract, freelancer: FREELANCER }, NOW);
  assert.equal(bound?.state, "awaiting");
  assert.equal(loadMarketplaceSource(storage, SCOPE, EMPLOYER), null, "source consumed by the intent");
  const rec = recorder();
  // Before confirmation nothing is sent.
  await runPendingLinks(storage, SCOPE, EMPLOYER, rec.link, NOW);
  assert.equal(rec.calls.length, 0);
  confirmPendingLink(storage, SCOPE, EMPLOYER, contract, NOW);
  const r = await runPendingLinks(storage, SCOPE, EMPLOYER, rec.link, NOW);
  assert.deepEqual(r.linked, [contract]);
  assert.deepEqual(rec.calls, [
    {
      contractAddress: contract,
      source: "job",
      jobId: "11111111-1111-4111-8111-111111111111",
      proposalId: "22222222-2222-4222-8222-222222222222",
    },
  ]);
  assert.equal(storage.map.has(pendingLinkKey(SCOPE, EMPLOYER)), false);
  await runPendingLinks(storage, SCOPE, EMPLOYER, rec.link, NOW);
  assert.equal(rec.calls.length, 1, "nothing left to retry");
});

test("auto-link: gig package carries gigId + tier only", async () => {
  const storage = memoryStorage();
  saveMarketplaceSource(storage, SCOPE, EMPLOYER, gigHandoff(), NOW);
  const contract = addr();
  bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: contract, freelancer: FREELANCER }, NOW);
  confirmPendingLink(storage, SCOPE, EMPLOYER, contract, NOW);
  const rec = recorder();
  await runPendingLinks(storage, SCOPE, EMPLOYER, rec.link, NOW);
  assert.deepEqual(rec.calls, [
    { contractAddress: contract, source: "gig", gigId: "33333333-3333-4333-8333-333333333333", packageTier: "standard" },
  ]);
  const stored = storage.map.get(marketplaceSourceKey(SCOPE, EMPLOYER));
  assert.equal(stored, undefined);
});

test("auto-link: failed / expired / discarded setup never links", async () => {
  const storage = memoryStorage();
  saveMarketplaceSource(storage, SCOPE, EMPLOYER, jobHandoff(), NOW);
  const contract = addr();
  bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: contract, freelancer: FREELANCER }, NOW);
  dropAwaitingLinks(storage, SCOPE, EMPLOYER);
  assert.equal(confirmPendingLink(storage, SCOPE, EMPLOYER, contract, NOW), null);
  const rec = recorder();
  await runPendingLinks(storage, SCOPE, EMPLOYER, rec.link, NOW);
  assert.equal(rec.calls.length, 0);

  // A new intent for another contract drops the old awaiting marker too.
  saveMarketplaceSource(storage, SCOPE, EMPLOYER, jobHandoff(), NOW);
  const first = addr();
  bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: first, freelancer: FREELANCER }, NOW);
  bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: addr(), freelancer: FREELANCER }, NOW);
  assert.deepEqual(loadPendingLinks(storage, SCOPE, EMPLOYER), []);
});

test("auto-link: transient failures retry; reload resumes; exactly one success; rejections clear", async () => {
  const storage = memoryStorage();
  saveMarketplaceSource(storage, SCOPE, EMPLOYER, jobHandoff(), NOW);
  const contract = addr();
  bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: contract, freelancer: FREELANCER }, NOW);
  confirmPendingLink(storage, SCOPE, EMPLOYER, contract, NOW);
  const rec = recorder((n) => (n === 1 ? { status: 401, code: "unauthenticated" } : n === 2 ? { status: 503 } : null));
  assert.deepEqual((await runPendingLinks(storage, SCOPE, EMPLOYER, rec.link, NOW)).retry, [contract]);
  assert.deepEqual((await runPendingLinks(storage, SCOPE, EMPLOYER, rec.link, NOW)).retry, [contract]);
  assert.equal(loadPendingLinks(storage, SCOPE, EMPLOYER)[0].attempts, 2);
  // Concurrent "reloads" share one in-flight request.
  const [a, b] = await Promise.all([
    runPendingLinks(storage, SCOPE, EMPLOYER, rec.link, NOW),
    runPendingLinks(storage, SCOPE, EMPLOYER, rec.link, NOW),
  ]);
  assert.equal(a.linked.length + b.linked.length, 1);
  assert.equal(rec.calls.length, 3);
  assert.deepEqual(loadPendingLinks(storage, SCOPE, EMPLOYER), []);

  const s2 = memoryStorage();
  saveMarketplaceSource(s2, SCOPE, EMPLOYER, jobHandoff(), NOW);
  const c2 = addr();
  bindMarketplaceSource(s2, SCOPE, EMPLOYER, { contractAddress: c2, freelancer: FREELANCER }, NOW);
  confirmPendingLink(s2, SCOPE, EMPLOYER, c2, NOW);
  const rejecting = recorder(() => ({ status: 409, code: "contract_mismatch" }));
  assert.deepEqual((await runPendingLinks(s2, SCOPE, EMPLOYER, rejecting.link, NOW)).rejected, [c2]);
  assert.deepEqual(loadPendingLinks(s2, SCOPE, EMPLOYER), []);

  assert.equal(classifyLinkError(new Error("network")), "retry");
  assert.equal(classifyLinkError({ status: 404, code: "contract_not_found" }), "retry");
  assert.equal(classifyLinkError({ status: 403, code: "not_participant" }), "rejected");
  assert.equal(classifyLinkError({ status: 409, code: "proposal_not_selected" }), "rejected");
  // Transient failures are given up after the max age.
  const s3 = memoryStorage();
  saveMarketplaceSource(s3, SCOPE, EMPLOYER, jobHandoff(), NOW);
  const c3 = addr();
  bindMarketplaceSource(s3, SCOPE, EMPLOYER, { contractAddress: c3, freelancer: FREELANCER }, NOW);
  confirmPendingLink(s3, SCOPE, EMPLOYER, c3, NOW);
  await runPendingLinks(s3, SCOPE, EMPLOYER, recorder(() => ({ status: 503 })).link, NOW + 8 * 24 * 3600 * 1000);
  assert.deepEqual(loadPendingLinks(s3, SCOPE, EMPLOYER), []);
});

test("auto-link: direct Create and edited freelancer never link; walletless and corrupt records ignored", async () => {
  const storage = memoryStorage();
  const direct = addr();
  assert.equal(bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: direct, freelancer: FREELANCER }, NOW), null);
  assert.equal(confirmPendingLink(storage, SCOPE, EMPLOYER, direct, NOW), null);

  saveMarketplaceSource(storage, SCOPE, EMPLOYER, jobHandoff(), NOW);
  assert.equal(bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: addr(), freelancer: OTHER }, NOW), null);
  assert.equal(loadMarketplaceSource(storage, SCOPE, EMPLOYER), null);

  saveMarketplaceSource(storage, SCOPE, EMPLOYER, jobHandoff(), NOW);
  clearMarketplaceSource(storage, SCOPE, EMPLOYER);
  assert.equal(bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: addr(), freelancer: FREELANCER }, NOW), null);

  assert.equal(saveMarketplaceSource(storage, SCOPE, null, jobHandoff(), NOW), false);
  assert.equal(saveMarketplaceSource(storage, SCOPE, EMPLOYER, jobHandoff({ proposalId: "" }), NOW), false);
  storage.setItem(marketplaceSourceKey(SCOPE, EMPLOYER), "{not json");
  assert.equal(loadMarketplaceSource(storage, SCOPE, EMPLOYER), null);
  storage.setItem(pendingLinkKey(SCOPE, EMPLOYER), JSON.stringify({ version: 1, items: [{ contractAddress: "x", state: "confirmed", link: { source: "evil" } }] }));
  assert.deepEqual(loadPendingLinks(storage, SCOPE, EMPLOYER), []);
  // Another wallet sees nothing.
  saveMarketplaceSource(storage, SCOPE, EMPLOYER, jobHandoff(), NOW);
  assert.equal(loadMarketplaceSource(storage, SCOPE, OTHER), null);
});

test("auto-link: consumed handoff never reappears; create intent storage untouched", () => {
  const storage = memoryStorage();
  savePendingHandoff(storage, SCOPE, EMPLOYER, jobHandoff(), NOW);
  const intentKey = createIntentStorageKey(SCOPE, EMPLOYER);
  storage.setItem("unrelated", "keep");
  const result = resolveHandoffChoice(storage, SCOPE, EMPLOYER, "import", { intentExists: false });
  assert.ok(result.draft);
  saveMarketplaceSource(storage, SCOPE, EMPLOYER, jobHandoff(), NOW);
  assert.equal(loadPendingHandoff(storage, SCOPE, EMPLOYER), null);
  const contract = addr();
  bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: contract, freelancer: FREELANCER }, NOW);
  confirmPendingLink(storage, SCOPE, EMPLOYER, contract, NOW);
  dropAwaitingLinks(storage, SCOPE, EMPLOYER);
  assert.equal(storage.map.has(intentKey), false, "link store never writes the create intent");
  assert.equal(storage.getItem("unrelated"), "keep");
  assert.equal(loadPendingHandoff(storage, SCOPE, EMPLOYER), null);
});

test("wizard wiring: metadata only, link only on the verified success path", () => {
  const wizard = readFileSync("components/create/CreateWizard.tsx", "utf8");
  const finish = wizard.slice(wizard.indexOf("function finishSetup"), wizard.indexOf("function reportUnexpected"));
  assert.match(finish, /linkConfirmedMarketplaceContract\(intent\.employer, progress\.contractAddress/);
  assert.equal(wizard.match(/linkConfirmedMarketplaceContract\(/g)?.length, 1, "only finishSetup links");
  assert.match(
    wizard,
    /saveCreateIntent\(intentStorage\(\), ensured\.intent\);\n\s*\/\/[^\n]*\n\s*bindMarketplaceSource\(intentStorage\(\), INTENT_SCOPE, terms\.employer, ensured\.intent, Date\.now\(\)\);/
  );
  const forgetAt = wizard.indexOf("const forget = ");
  const forget = wizard.slice(forgetAt, wizard.indexOf("};", forgetAt));
  assert.match(forget, /dropAwaitingLinks\(/);
  const chooser = wizard.slice(wizard.indexOf("function chooseHandoff"), wizard.indexOf("const errors = useMemo"));
  assert.match(chooser, /saveMarketplaceSource\(/);
  assert.doesNotMatch(chooser, /submit|createContract|runCreate|sendTransaction|clearCreateIntent|discard/i);
  const store = readFileSync("lib/app/marketplace-link-store.ts", "utf8") + readFileSync("lib/app/marketplace-auto-link.ts", "utf8");
  assert.doesNotMatch(store, /sendTransaction|signTransaction|signMessage|createContract\(|saveCreateIntent|clearCreateIntent|saveCreateDraft/);
});

/* ---------------- end to end with the server verifier ---------------- */

function chain() {
  const contracts = new Map<string, ContractFacts>();
  return {
    put(facts: Omit<ContractFacts, "address">) {
      const address = addr();
      contracts.set(address, { address, ...facts });
      return address;
    },
    reader: async (address: string) => {
      const f = contracts.get(address);
      if (!f) throw new HttpError(404, "contract_not_found", "No PREMIFLOW contract exists at that address.");
      return f;
    },
  };
}

async function serverSetup() {
  const market = createMemoryMarketplaceStore();
  const trust = createMemoryMarketplaceTrustStore();
  const c = chain();
  const deps: TrustDeps = { market, trust, notifications: createMemoryNotificationStore(), readContract: c.reader };
  const job = await createJob(market, {
    sessionWallet: EMPLOYER,
    title: "Landing page",
    description: "Build it.",
    paymentMode: "Fixed",
    budgetAmount: "1000",
    tokenMint: MINT,
  });
  return { market, trust, deps, chain: c, job };
}

const asLink = (deps: TrustDeps, sessionWallet: string) => async (req: LinkRequest) => {
  try {
    return await linkContract(deps, { sessionWallet, ...req });
  } catch (err) {
    throw err instanceof HttpError ? { status: err.status, code: err.code } : err;
  }
};

test("e2e: proposal handoff -> confirmed contract -> auto-linked once (retry-safe)", async () => {
  const { market, deps, chain: c, job } = await serverSetup();
  const p = await submitProposal(market, { sessionWallet: FREELANCER, jobId: job.id, message: "Hi", proposedAmount: "900" });
  await selectProposal(market, { sessionWallet: EMPLOYER, jobId: job.id, proposalId: p.id });
  const handoff = await getCreateHandoff(market, { sessionWallet: EMPLOYER, jobId: job.id });
  const storage = memoryStorage();
  saveMarketplaceSource(storage, SCOPE, EMPLOYER, handoff, NOW);
  const contract = c.put({ employer: EMPLOYER, freelancer: FREELANCER, status: "PendingAcceptance" });
  bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: contract, freelancer: FREELANCER }, NOW);
  confirmPendingLink(storage, SCOPE, EMPLOYER, contract, NOW);
  const link = asLink(deps, EMPLOYER);
  assert.deepEqual((await runPendingLinks(storage, SCOPE, EMPLOYER, link, NOW)).linked, [contract]);
  // A lost marker clear / second tab replays the same request: no-op, still one link.
  const again = await linkContract(deps, { sessionWallet: EMPLOYER, contractAddress: contract, source: "job", jobId: job.id, proposalId: p.id });
  assert.equal(again.created, false);
  const views = await listContractLinks(deps, { sessionWallet: FREELANCER, jobId: job.id });
  assert.equal(views.length, 1);
  assert.equal(views[0].contractAddress, contract);
});

test("e2e: gig package -> auto-link; tampered source / parties rejected and cleared", async () => {
  const { market, deps, chain: c, job } = await serverSetup();
  const gig = await createGig(market, {
    sessionWallet: FREELANCER,
    body: {
      title: "Logo design",
      description: "Logos.",
      skills: ["design"],
      paymentMode: "Fixed",
      priceAmount: "150000000",
      packages: [
        { tier: "basic", name: "Basic", description: "One logo.", priceAmount: "150000000", deliveryDays: 3, revisions: 1 },
        { tier: "standard", name: "Standard", description: "Two logos.", priceAmount: "250000000", deliveryDays: 5, revisions: 2 },
      ],
    },
    tokenMint: MINT,
  });
  const contract = c.put({ employer: EMPLOYER, freelancer: FREELANCER, status: "PendingAcceptance" });
  const storage = memoryStorage();
  saveMarketplaceSource(storage, SCOPE, EMPLOYER, { ...gigHandoff(), gigId: gig.id, packageTier: "standard" }, NOW);
  bindMarketplaceSource(storage, SCOPE, EMPLOYER, { contractAddress: contract, freelancer: FREELANCER }, NOW);
  confirmPendingLink(storage, SCOPE, EMPLOYER, contract, NOW);
  assert.deepEqual((await runPendingLinks(storage, SCOPE, EMPLOYER, asLink(deps, EMPLOYER), NOW)).linked, [contract]);

  const code = (status: number, value: string) => (err: { status?: number; code?: string }) =>
    err.status === status && err.code === value;
  // Seller cannot record a hire of their own gig; the employer must be the session wallet.
  const c2 = c.put({ employer: EMPLOYER, freelancer: FREELANCER, status: "PendingAcceptance" });
  await assert.rejects(
    linkContract(deps, { sessionWallet: FREELANCER, contractAddress: c2, source: "gig", gigId: gig.id }),
    code(403, "not_employer")
  );
  await assert.rejects(
    linkContract(deps, { sessionWallet: EMPLOYER, contractAddress: c2, source: "gig", gigId: gig.id, packageTier: "premium" }),
    code(400, "invalid_marketplace_input")
  );
  // Tampered job source: proposal that is not the selected one / wrong parties.
  const p = await submitProposal(market, { sessionWallet: FREELANCER, jobId: job.id, message: "Hi", proposedAmount: "1" });
  const c3 = c.put({ employer: EMPLOYER, freelancer: FREELANCER, status: "PendingAcceptance" });
  const tampered = memoryStorage();
  saveMarketplaceSource(tampered, SCOPE, EMPLOYER, jobHandoff({ jobId: job.id, proposalId: p.id }), NOW);
  bindMarketplaceSource(tampered, SCOPE, EMPLOYER, { contractAddress: c3, freelancer: FREELANCER }, NOW);
  confirmPendingLink(tampered, SCOPE, EMPLOYER, c3, NOW);
  assert.deepEqual((await runPendingLinks(tampered, SCOPE, EMPLOYER, asLink(deps, EMPLOYER), NOW)).rejected, [c3]);
  assert.deepEqual(loadPendingLinks(tampered, SCOPE, EMPLOYER), []);
  await selectProposal(market, { sessionWallet: EMPLOYER, jobId: job.id, proposalId: p.id });
  const wrongParties = c.put({ employer: EMPLOYER, freelancer: OTHER, status: "PendingAcceptance" });
  await assert.rejects(
    linkContract(deps, { sessionWallet: EMPLOYER, contractAddress: wrongParties, source: "job", jobId: job.id, proposalId: p.id }),
    code(409, "contract_mismatch")
  );
  await assert.rejects(
    linkContract(deps, { sessionWallet: OTHER, contractAddress: c3, source: "job", jobId: job.id, proposalId: p.id }),
    code(403, "not_participant")
  );
  // Client-claimed parties are ignored: only chain facts are used.
  const forged = await linkContract(deps, {
    sessionWallet: EMPLOYER,
    contractAddress: c3,
    source: "job",
    jobId: job.id,
    proposalId: p.id,
    ...({ employerWallet: OTHER, freelancerWallet: OTHER } as object),
  });
  assert.equal(forged.link.freelancerWallet, FREELANCER);
  assert.equal(forged.link.employerWallet, EMPLOYER);
});
