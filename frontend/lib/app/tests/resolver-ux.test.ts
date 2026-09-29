import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import {
  DEFAULT_CONTRACTS_LIST_QUERY,
  buildContractsListHref,
  contractsListEmptyCopy,
  filterContractsByListQuery,
  parseContractsListQuery,
} from "@/lib/app/contracts-list-query";
import {
  DISPUTE_ASSIGNED_NOTIFICATION,
  disputeAssignedUniqueKey,
  markDisputeAssignedSync,
} from "@/lib/app/dispute-assigned-client";
import {
  caseLoadModeForRole,
  shouldAttemptCaseRecover,
  shouldLoadCaseAsResolver,
} from "@/lib/app/resolution-case";
import {
  RESOLVER_UX_COPY,
  ResolverPrecheckError,
  allocationUi,
  assertResolverPrecheck,
  assignedDisputeCount,
  canEditPartyStatementForRole,
  canShowResolverSettlementControls,
  contractRolesForWallet,
  freelancerAwardFromEmployerInput,
  parseFreelancerAllocation,
  postResolutionSummary,
  resolverCaseCard,
  resolverCasesForWallet,
  resolverSettlementSummary,
  shouldShowResolvingTab,
  validateResolverSettlement,
  withResolverCases,
} from "@/lib/app/resolver-cases";
import { groupContractsByRole } from "@/lib/app/view-model";
import {
  CONTRACT_CASE_OFFSETS,
  encodeContractCaseAccount,
} from "@/lib/server/solana/read-contract-case-facts";
import { CONTRACT_RESOLVER_OFFSET } from "@/lib/streampay-v2/accounts";
import { RESOLVER, WALLET_A, WALLET_B, makeContract } from "@/lib/streampay-v2/tests/fixtures";

const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const ME = pk(7);
const OTHER = pk(8);
const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

test("multi-role: Hiring, Working and Resolving are derived per contract from on-chain fields", () => {
  const hiring = makeContract({ address: pk(21), employer: ME, freelancer: OTHER, resolver: RESOLVER });
  const working = makeContract({ address: pk(22), employer: OTHER, freelancer: ME, resolver: RESOLVER });
  const resolving = makeContract({
    address: pk(23),
    employer: WALLET_A,
    freelancer: WALLET_B,
    resolver: ME,
    status: "Disputed",
    disputedAt: 1_700_000_500,
    contestedAmount: 50n,
  });
  assert.deepEqual(contractRolesForWallet(ME, hiring), { isEmployer: true, isFreelancer: false, isResolver: false });
  assert.deepEqual(contractRolesForWallet(ME, working), { isEmployer: false, isFreelancer: true, isResolver: false });
  assert.deepEqual(contractRolesForWallet(ME, resolving), { isEmployer: false, isFreelancer: false, isResolver: true });
  assert.deepEqual(contractRolesForWallet(null, resolving), { isEmployer: false, isFreelancer: false, isResolver: false });
  const grouped = groupContractsByRole(ME, [hiring, working, resolving]);
  assert.equal(grouped.hiring.length, 1);
  assert.equal(grouped.working.length, 1);
  assert.ok(!grouped.hiring.includes(resolving) && !grouped.working.includes(resolving));
  assert.deepEqual(
    resolverCasesForWallet(ME, [hiring, working, resolving, resolving]).map((c) => c.address.toBase58()),
    [resolving.address.toBase58()]
  );
  assert.deepEqual(resolverCasesForWallet(null, [resolving]), []);
});

test("resolver cases exclude contracts that were designated a resolver but never disputed", () => {
  const neverDisputed = makeContract({
    address: pk(24),
    employer: WALLET_A,
    freelancer: WALLET_B,
    resolver: ME,
    status: "Active",
    disputedAt: 0,
  });
  const disputed = makeContract({
    address: pk(25),
    employer: WALLET_A,
    freelancer: WALLET_B,
    resolver: ME,
    status: "Disputed",
    disputedAt: 1_700_000_600,
    contestedAmount: 50n,
  });
  const resolved = makeContract({
    address: pk(26),
    employer: WALLET_A,
    freelancer: WALLET_B,
    resolver: ME,
    status: "Resolved",
    disputedAt: 1_700_000_500,
  });

  assert.deepEqual(
    resolverCasesForWallet(ME, [neverDisputed, disputed, resolved, disputed]).map((c) =>
      c.address.toBase58()
    ),
    [disputed.address.toBase58(), resolved.address.toBase58()]
  );
});

test("Resolving tab: filtering, counts, URL parsing and empty copy", () => {
  const disputed = makeContract({ address: pk(31), resolver: ME, status: "Disputed", disputedAt: 200, contestedAmount: 10n });
  const older = makeContract({ address: pk(32), resolver: ME, status: "Disputed", disputedAt: 100, contestedAmount: 10n });
  const resolved = makeContract({ address: pk(33), resolver: ME, status: "Resolved", disputedAt: 300 });
  const cases = resolverCasesForWallet(ME, [resolved, older, disputed]);
  assert.deepEqual(
    cases.map((c) => c.address.toBase58()),
    [disputed, older, resolved].map((c) => c.address.toBase58())
  );
  assert.equal(assignedDisputeCount(cases), 2);
  const base = groupContractsByRole(ME, []);
  const grouped = withResolverCases(base, cases);
  assert.equal(grouped.all.length, 0, "All / Hiring / Working are unchanged");
  assert.equal(grouped.hiring.length + grouped.working.length, 0);
  const q = parseContractsListQuery(new URLSearchParams("role=resolving"));
  assert.equal(q.role, "resolving");
  assert.equal(filterContractsByListQuery(grouped, q).length, 3);
  assert.equal(filterContractsByListQuery(grouped, { ...q, status: "Disputed" }).length, 2);
  assert.equal(filterContractsByListQuery(grouped, { ...q, claim: "withdraw" }).length, 0);
  assert.equal(filterContractsByListQuery(base, q).length, 0);
  assert.equal(buildContractsListHref({ role: "resolving" }), "/contracts?role=resolving");
  assert.equal(
    contractsListEmptyCopy({ ...DEFAULT_CONTRACTS_LIST_QUERY, role: "resolving" }).title,
    RESOLVER_UX_COPY.emptyTitle
  );
  assert.equal(shouldShowResolvingTab(0, "all"), false);
  assert.equal(shouldShowResolvingTab(2, "all"), true);
  assert.equal(shouldShowResolvingTab(0, "resolving"), true);
});

const disputedBase = makeContract({
  status: "Disputed",
  resolver: ME,
  contestedAmount: 1_000_000n,
  releasedAmount: 400_000n,
  withdrawnAmount: 400_000n,
  refundedAmount: 0n,
});

test("settlement validation: bounds, employer remainder, withdrawn floor, status", () => {
  const zero = validateResolverSettlement(disputedBase, 0n);
  assert.ok(zero.ok && zero.employerAllocation === 1_000_000n && zero.totalAllocation === 1_000_000n);
  const all = validateResolverSettlement(disputedBase, 1_000_000n);
  assert.ok(all.ok && all.employerAllocation === 0n && all.freelancerClaimableAfter === 1_000_000n);
  const split = validateResolverSettlement(disputedBase, 333_333n);
  assert.ok(split.ok && split.employerAllocation === 666_667n && split.totalAllocation === 1_000_000n);
  const over = validateResolverSettlement(disputedBase, 1_000_001n);
  assert.ok(!over.ok && /exceed/.test(over.error));
  const negative = validateResolverSettlement(disputedBase, -1n);
  assert.ok(!negative.ok && /negative/.test(negative.error));
  const overWithdrawn = { ...disputedBase, releasedAmount: 100n, withdrawnAmount: 500n };
  assert.equal(validateResolverSettlement(overWithdrawn, 399n).ok, false);
  assert.equal(validateResolverSettlement(overWithdrawn, 400n).ok, true);
  assert.equal(validateResolverSettlement({ ...disputedBase, status: "Resolved" }, 0n).ok, false);
  assert.equal(validateResolverSettlement({ ...disputedBase, status: "Active" }, 0n).ok, false);
});

test("settlement validation is exact above 2^53 (BigInt, no floats)", () => {
  const u64Max = 18_446_744_073_709_551_615n;
  const c = { ...disputedBase, contestedAmount: u64Max, releasedAmount: 0n, withdrawnAmount: 0n };
  const r = validateResolverSettlement(c, u64Max - 1n);
  assert.ok(r.ok && r.employerAllocation === 1n && r.totalAllocation === u64Max);
  assert.equal(parseFreelancerAllocation("9007199254740993", 0, c).award, 9_007_199_254_740_993n);
});

test("allocation parsing uses base-unit helpers and rejects bad input", () => {
  assert.equal(parseFreelancerAllocation("0.25", 6, disputedBase).award, 250_000n);
  assert.equal(parseFreelancerAllocation("0", 6, disputedBase).award, 0n);
  assert.ok(parseFreelancerAllocation("0.0000001", 6, disputedBase).error);
  assert.ok(parseFreelancerAllocation("abc", 6, disputedBase).error);
  assert.ok(parseFreelancerAllocation("-1", 6, disputedBase).error);
  assert.ok(parseFreelancerAllocation("", 6, disputedBase).error);
  assert.ok(parseFreelancerAllocation("1.000001", 6, disputedBase).error);
  assert.ok(parseFreelancerAllocation("0.5", undefined, disputedBase).error);
  assert.equal(freelancerAwardFromEmployerInput("0.25", 6, 1_000_000n).award, 750_000n);
  assert.ok(freelancerAwardFromEmployerInput("2", 6, 1_000_000n).error);
  assert.ok(freelancerAwardFromEmployerInput("", 6, 1_000_000n).error);
  assert.equal(allocationUi(750_000n, 6), "0.75");
  assert.equal(parseFreelancerAllocation(allocationUi(333_333n, 6), 6, disputedBase).award, 333_333n);
});

test("confirmation summary lists the four required allocation rows", () => {
  const r = validateResolverSettlement(disputedBase, 250_000n);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(resolverSettlementSummary(r, 6), [
    { label: "Amount under dispute", value: "1" },
    { label: "Freelancer allocation", value: "0.25" },
    { label: "Employer allocation", value: "0.75" },
    { label: "Total allocation", value: "1" },
  ]);
});

test("settlement controls and pre-check are resolver-only and Disputed-only", () => {
  const c = makeContract({ status: "Disputed", resolver: ME, employer: WALLET_A, freelancer: WALLET_B, contestedAmount: 5n });
  assert.equal(canShowResolverSettlementControls(ME, c), true);
  assert.equal(canShowResolverSettlementControls(WALLET_A, c), false);
  assert.equal(canShowResolverSettlementControls(WALLET_B, c), false);
  assert.equal(canShowResolverSettlementControls(null, c), false);
  assert.equal(canShowResolverSettlementControls(ME, { ...c, status: "Resolved" }), false);
  assert.doesNotThrow(() => assertResolverPrecheck(ME, c));
  assert.throws(() => assertResolverPrecheck(WALLET_A, c), ResolverPrecheckError);
  assert.throws(() => assertResolverPrecheck(null, c), /Connect the designated resolver/);
  assert.throws(() => assertResolverPrecheck(ME, { ...c, status: "Resolved" }), /no longer Disputed/);
});

test("party statements are read-only for the resolver; resolver reads but never recovers a case", () => {
  assert.equal(canEditPartyStatementForRole("resolver"), false);
  assert.equal(canEditPartyStatementForRole("none"), false);
  assert.equal(canEditPartyStatementForRole("employer"), true);
  assert.equal(canEditPartyStatementForRole("freelancer"), true);
  assert.equal(shouldAttemptCaseRecover("Disputed", "resolver"), false);
  assert.equal(shouldLoadCaseAsResolver("Disputed", "resolver"), true);
  assert.equal(shouldLoadCaseAsResolver("Resolved", "resolver"), true);
  assert.equal(shouldLoadCaseAsResolver("Active", "resolver"), false);
  assert.equal(shouldLoadCaseAsResolver("Disputed", "employer"), false);
  assert.equal(caseLoadModeForRole("resolver", "recover"), "get");
  assert.equal(caseLoadModeForRole("employer", "recover"), "recover");
});

test("resolver case card: base-unit-safe contested amount, dispute date, review link", () => {
  const c = makeContract({
    address: pk(41),
    resolver: ME,
    status: "Disputed",
    contestedAmount: 1_234_567n,
    disputedAt: 1_700_000_000,
    paymentMode: "Streaming",
    contractId: 9n,
  });
  const card = resolverCaseCard(c, 6);
  assert.equal(card.contestedLabel, "1.234567");
  assert.equal(card.title, "Contract #9");
  assert.equal(card.actionLabel, "Review dispute");
  assert.equal(card.href, `/contracts/${pk(41).toBase58()}#resolution`);
  assert.ok(card.disputedAtLabel);
  assert.equal(card.employer, c.employer.toBase58());
  assert.equal(card.freelancer, c.freelancer.toBase58());
  const other = resolverCaseCard({ ...c, disputedAt: 0, status: "Resolved" }, undefined);
  assert.equal(other.disputedAtLabel, null);
  assert.equal(other.actionLabel, "View case");
  assert.equal(other.contestedLabel, "1234567 units");
});

test("dispute-assigned dedupe key is deterministic per contract + disputed_at + resolver", () => {
  const key = disputeAssignedUniqueKey("C1", 100, "R1");
  assert.equal(key, "dispute_assigned:C1:100:R1");
  assert.equal(key, disputeAssignedUniqueKey("C1", 100, "R1"));
  assert.notEqual(key, disputeAssignedUniqueKey("C1", 101, "R1"));
  assert.notEqual(key, disputeAssignedUniqueKey("C1", 100, "R2"));
  const seen = new Set<string>();
  assert.equal(markDisputeAssignedSync(key, seen), true);
  assert.equal(markDisputeAssignedSync(key, seen), false);
  assert.equal(DISPUTE_ASSIGNED_NOTIFICATION.title, "New dispute assigned");
  assert.equal(DISPUTE_ASSIGNED_NOTIFICATION.body, "A contract assigned to you requires review.");
});

test("post-resolution copy records settlement without claiming a token transfer", () => {
  assert.equal(RESOLVER_UX_COPY.settlementRecorded, "Settlement recorded");
  for (const text of [RESOLVER_UX_COPY.settlementRecordedBody, RESOLVER_UX_COPY.settlementNoTransfer]) {
    assert.doesNotMatch(text, /\btransferred\b|\bsent to\b|\bpaid out\b/i);
  }
  const resolved = makeContract({ status: "Resolved", freelancerSettlementAmount: 700n, employerRefundableAmount: 300n });
  const summary = postResolutionSummary(resolved);
  assert.equal(summary.recorded, true);
  assert.equal(summary.freelancerSettlement, 700n);
  assert.equal(summary.employerRefundableTotal, 300n);
});

test("resolver memcmp offset matches the Contract layout (196)", () => {
  assert.equal(CONTRACT_RESOLVER_OFFSET, 196);
  assert.equal(CONTRACT_RESOLVER_OFFSET, CONTRACT_CASE_OFFSETS.resolver);
  const snapshot = encodeContractCaseAccount({
    employer: WALLET_A,
    freelancer: WALLET_B,
    resolver: RESOLVER,
    status: "Disputed",
  });
  const bytes = snapshot.data.slice(CONTRACT_RESOLVER_OFFSET, CONTRACT_RESOLVER_OFFSET + 32);
  assert.ok(new PublicKey(bytes).equals(RESOLVER));
});

test("wiring: resolver pre-check runs before resolveDispute; controls gated to the resolver", () => {
  const detail = read("components/contracts/ContractDetail.tsx");
  const branch = detail.slice(detail.indexOf('case "resolveDispute": {'));
  const precheck = branch.indexOf("assertResolverPrecheck(");
  assert.ok(precheck > 0);
  assert.ok(precheck < branch.indexOf("client.resolveDispute("));
  const rc = read("components/contracts/ResolutionCenter.tsx");
  assert.match(rc, /canSettle && resolverView && disputed/);
  assert.match(rc, /canEditPartyStatementForRole\(role\)/);
});
