import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DISPUTE_CATEGORIES } from "@/lib/app/resolution-center";
import {
  DISPUTE_PROOF_NOTE,
  EXPLORER_LINK_LABEL,
  disputeProof,
} from "@/lib/app/dispute-proof";
import { explorerTxUrlFor } from "@/lib/network";

const SIG = "5".repeat(88);
const base = {
  disputeInitiator: "Freelancer" as const,
  disputedAt: 1_760_000_000,
  contestedAmount: 40_000_000n,
  releasedAmount: 10_000_000n,
  withdrawnAmount: 5_000_000n,
  refundedAmount: 0n,
};
const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

test("explorer URL builder targets devnet and mainnet correctly", () => {
  assert.equal(explorerTxUrlFor(SIG, "devnet"), `https://explorer.solana.com/tx/${SIG}?cluster=devnet`);
  assert.equal(explorerTxUrlFor(SIG, "mainnet"), `https://explorer.solana.com/tx/${SIG}`);
  assert.equal(EXPLORER_LINK_LABEL, "View on Solana Explorer");
});

test("disputed panel shows status, opener, reason, evidence and amounts from real data", () => {
  const proof = disputeProof({ ...base, status: "Disputed" }, 6, {
    category: DISPUTE_CATEGORIES[0].id,
    evidenceCount: 2,
  });
  assert.ok(proof);
  const rows = Object.fromEntries(proof.rows.map((r) => [r.label, r.value]));
  assert.match(rows.Status, /^Disputed/);
  assert.equal(rows["Opened by"], "Freelancer");
  assert.equal(rows["Opened on"], "2025-10-09 (UTC)");
  assert.equal(rows["Reason given"], DISPUTE_CATEGORIES[0].label);
  assert.equal(rows["Evidence on file"], "2 items");
  assert.equal(rows["Amount under dispute"], "40");
  assert.equal(rows["Released to freelancer"], "10");
  assert.equal(rows["Refunded to employer"], "0");
  assert.equal(rows["Resolver decision"], undefined);
});

test("resolved panel shows the recorded decision and both explorer links when signatures exist", () => {
  const proof = disputeProof({ ...base, status: "Resolved", refundedAmount: 30_000_000n }, 6, {
    openSignature: SIG,
    resolveSignature: "4".repeat(88),
  });
  assert.ok(proof);
  const rows = Object.fromEntries(proof.rows.map((r) => [r.label, r.value]));
  assert.equal(rows["Resolver decision"], "Settlement recorded on-chain");
  assert.equal(rows["Refunded to employer"], "30");
  assert.deepEqual(proof.links.map((l) => l.label), ["Dispute opened", "Resolution recorded"]);
});

test("no explorer link and no invented fields without data", () => {
  const proof = disputeProof({ ...base, status: "Disputed", disputeInitiator: "None", disputedAt: 0 }, 6, {
    openSignature: null,
    resolveSignature: "not-a-signature",
  });
  assert.ok(proof);
  assert.deepEqual(proof.links, []);
  const labels = proof.rows.map((r) => r.label);
  for (const absent of ["Opened by", "Opened on", "Reason given", "Evidence on file"]) {
    assert.ok(!labels.includes(absent), absent);
  }
  assert.equal(disputeProof({ ...base, status: "Active" } as never, 6), null);
});

test("proof copy uses plain wording, never raw program event names, and never decides", () => {
  const proof = disputeProof({ ...base, status: "Resolved" }, 6, { openSignature: SIG, resolveSignature: SIG, evidenceCount: 1 });
  const text = [DISPUTE_PROOF_NOTE, ...proof!.rows.flatMap((r) => [r.label, r.value]), ...proof!.links.map((l) => l.label)].join(" ");
  assert.doesNotMatch(text, /_|DisputeOpened|DisputeResolved|open_dispute|apply_dispute_resolution|resolveDispute/);
  assert.match(DISPUTE_PROOF_NOTE, /does not decide disputes/);
});

test("ResolutionCenter renders the proof card with guarded explorer links", () => {
  const rc = read("components/contracts/ResolutionCenter.tsx");
  assert.match(rc, /<DisputeProofCard\s/);
  assert.match(rc, /href=\{explorerTxUrl\(link\.signature\)\}[\s\S]*?rel="noopener noreferrer"[\s\S]*?\{EXPLORER_LINK_LABEL\}/);
  assert.match(rc, /proof\.links\.length > 0 \?/);
});