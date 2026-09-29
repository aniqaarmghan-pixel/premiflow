import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import { HOURLY_COPY } from "@/lib/app/hourly-ux";
import {
  markOutcomeSync,
  outcomeNotificationKindForStatus,
  outcomeSyncKey,
} from "@/lib/app/outcome-notifications-client";
import {
  RESOLVER_UX_COPY,
  ResolverPrecheckError,
  assertResolverPrecheck,
  canShowResolverSettlementControls,
  parseFreelancerAllocation,
  validateResolverSettlement,
} from "@/lib/app/resolver-cases";
import {
  READINESS_LABEL,
  RESOLVER_NAV,
  RESOLVER_WORKSPACE_COPY,
  canSwitchWorkspace,
  caseReadiness,
  disputesRequiringAttention,
  groupAssignedDisputes,
  isNavActive,
  parseWorkspaceSnapshot,
  readinessFor,
  resolveWorkspaceMode,
  resolvedCaseRow,
  resolverActivity,
  resolverWorkspaceMetrics,
  statementPresence,
} from "@/lib/app/resolver-workspace";
import { WALLET_A, WALLET_B, WALLET_C, makeContract } from "@/lib/streampay-v2/tests/fixtures";

const pk = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const R = pk(7);
const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");
const disputed = (n: number, at: number) =>
  makeContract({
    address: pk(n),
    resolver: R,
    employer: WALLET_A,
    freelancer: WALLET_B,
    status: "Disputed",
    disputedAt: at,
    contestedAmount: 1_000_000n,
  });

test("readiness comes from statements the resolver can read; unknown when unreadable", () => {
  const c = disputed(40, 100);
  assert.equal(caseReadiness(c, { state: "loaded", statements: { employer: true, freelancer: true } }), "ready");
  assert.equal(
    caseReadiness(c, { state: "loaded", statements: { employer: true, freelancer: false } }),
    "awaiting_statements"
  );
  assert.equal(caseReadiness(c, { state: "not_created" }), "awaiting_statements");
  assert.equal(caseReadiness(c, { state: "unavailable" }), "unknown");
  assert.equal(caseReadiness(c), "unknown");
  assert.equal(caseReadiness({ status: "Resolved" }), "resolved");
  assert.equal(caseReadiness({ status: "Active" }), "unknown");
  assert.deepEqual(
    statementPresence({ employerStatement: { body: " x " }, freelancerStatement: { body: "   " } }),
    { employer: true, freelancer: false }
  );
  assert.deepEqual(statementPresence({ employerStatement: null, freelancerStatement: null }), {
    employer: false,
    freelancer: false,
  });
  assert.equal(READINESS_LABEL.ready, "Ready for decision");
  assert.equal(READINESS_LABEL.awaiting_statements, "Awaiting statements");
});

test("workspace metrics, grouping and attention ordering use real case data", () => {
  const a = disputed(41, 300);
  const b = disputed(42, 100);
  const c = disputed(43, 200);
  const done = makeContract({ address: pk(44), resolver: R, status: "Resolved", disputedAt: 50 });
  const active = makeContract({ address: pk(45), resolver: R, status: "Active" });
  const map = {
    [a.address.toBase58()]: "ready",
    [b.address.toBase58()]: "awaiting_statements",
  } as const;
  const cases = [a, b, c, done, active];
  assert.deepEqual(resolverWorkspaceMetrics(cases, map), {
    open: 3,
    awaitingStatements: 1,
    readyForDecision: 1,
    readinessUnknown: 1,
    resolved: 1,
  });
  const g = groupAssignedDisputes(cases, map);
  assert.deepEqual([g.ready.length, g.awaiting.length, g.unknown.length, g.resolved.length], [1, 1, 1, 1]);
  assert.deepEqual(
    disputesRequiringAttention(cases, map).map((x) => x.address.toBase58()),
    [a, b, c].map((x) => x.address.toBase58())
  );
  assert.equal(readinessFor(done, map), "resolved");
  assert.equal(readinessFor(active, map), "unknown");
  assert.deepEqual(resolverWorkspaceMetrics([], {}), {
    open: 0,
    awaitingStatements: 0,
    readyForDecision: 0,
    readinessUnknown: 0,
    resolved: 0,
  });
});

test("resolved cases show settlement values and never invent a transaction link", () => {
  const done = makeContract({
    address: pk(46),
    resolver: R,
    status: "Resolved",
    freelancerSettlementAmount: 700_000n,
    employerRefundableAmount: 300_000n,
  });
  const row = resolvedCaseRow(done, 6);
  assert.equal(row.freelancerSettlementLabel, "0.7");
  assert.equal(row.employerRefundableLabel, "0.3");
  assert.equal(row.txSignature, null);
  assert.equal(row.href, `/contracts/${pk(46).toBase58()}#resolution`);
  assert.match(RESOLVER_WORKSPACE_COPY.resolvedNote, /collect or claim/);
  assert.doesNotMatch(RESOLVER_WORKSPACE_COPY.resolvedNote, /\btransferred\b/);
  assert.match(RESOLVER_UX_COPY.partyClaimGuidance, /Collect pay/);
  assert.match(RESOLVER_UX_COPY.partyClaimGuidance, /Claim refund/);
});

test("resolver activity uses on-chain dispute timestamps only", () => {
  assert.deepEqual(resolverActivity([]), []);
  const items = resolverActivity([
    disputed(47, 100),
    makeContract({ address: pk(48), resolver: R, status: "Resolved", disputedAt: 200 }),
    makeContract({ address: pk(49), resolver: R, status: "Active", disputedAt: 0 }),
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].at, 200);
  assert.equal(items[0].detail, "Settlement recorded");
  assert.equal(items[1].detail, "Awaiting your decision");
  assert.equal(RESOLVER_WORKSPACE_COPY.activityEmpty, "No resolver activity yet.");
});

test("workspace mode: resolver workspace needs resolver cases; switch keeps party capability", () => {
  assert.equal(resolveWorkspaceMode({ stored: "resolver", resolverCaseCount: 0, partyContractCount: 0 }), "party");
  assert.equal(resolveWorkspaceMode({ stored: null, resolverCaseCount: 2, partyContractCount: 0 }), "resolver");
  assert.equal(resolveWorkspaceMode({ stored: null, resolverCaseCount: 2, partyContractCount: 3 }), "party");
  assert.equal(resolveWorkspaceMode({ stored: null, resolverCaseCount: 2, partyContractCount: null }), "party");
  assert.equal(resolveWorkspaceMode({ stored: "party", resolverCaseCount: 2, partyContractCount: 0 }), "party");
  assert.equal(resolveWorkspaceMode({ stored: "resolver", resolverCaseCount: 1, partyContractCount: 5 }), "resolver");
  assert.equal(canSwitchWorkspace(0), false);
  assert.equal(canSwitchWorkspace(1), true);
  assert.deepEqual(parseWorkspaceSnapshot("resolver|2|0"), {
    stored: "resolver",
    resolverCaseCount: 2,
    partyContractCount: 0,
  });
  assert.deepEqual(parseWorkspaceSnapshot("||"), { stored: null, resolverCaseCount: 0, partyContractCount: null });
  assert.deepEqual(parseWorkspaceSnapshot("bogus|-3|x"), {
    stored: null,
    resolverCaseCount: 0,
    partyContractCount: null,
  });
  const labels = RESOLVER_NAV.map((i) => i.label);
  assert.deepEqual(labels, [
    "Resolver Dashboard",
    "Assigned Disputes",
    "Resolved Cases",
    "Resolver Activity",
    "Help & Support",
  ]);
  assert.ok(!labels.some((l) => /Create contract|Hiring|Working/.test(l)));
  assert.equal(isNavActive("/resolver", "/resolver/assigned"), false);
  assert.equal(isNavActive("/resolver/assigned", "/resolver/assigned"), true);
  assert.equal(isNavActive("/", "/contracts"), false);
  assert.equal(isNavActive("/contracts", "/contracts/abc"), true);
  const shell = read("components/shell/AppShell.tsx");
  assert.match(shell, /useWorkspace\(\)/);
  assert.match(shell, /WorkspaceSwitch/);
  assert.match(shell, /label: "Create contract"/, "party navigation is preserved");
});

test("authorization matrix: only the on-chain resolver of a Disputed contract gets controls", () => {
  const c = disputed(50, 100);
  const wrongResolver = pk(9);
  for (const w of [WALLET_A, WALLET_B, WALLET_C, wrongResolver]) {
    assert.equal(canShowResolverSettlementControls(w, c), false);
    assert.throws(() => assertResolverPrecheck(w, c), ResolverPrecheckError);
  }
  assert.equal(canShowResolverSettlementControls(R, c), true);
  assert.doesNotThrow(() => assertResolverPrecheck(R, c));
  const other = makeContract({ ...c, address: pk(51), resolver: wrongResolver });
  assert.throws(() => assertResolverPrecheck(R, other), ResolverPrecheckError);
  assert.equal(canShowResolverSettlementControls(R, { ...c, status: "Resolved" }), false);
});

test("settlement edges: total always equals the disputed amount; decimals enforced", () => {
  const c = { ...disputed(52, 1), releasedAmount: 0n, withdrawnAmount: 0n };
  for (const award of [0n, 1n, 999_999n, 1_000_000n]) {
    const r = validateResolverSettlement(c, award);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.totalAllocation, c.contestedAmount);
      assert.equal(r.employerAllocation, c.contestedAmount - award);
    }
  }
  assert.equal(validateResolverSettlement(c, 1_000_001n).ok, false);
  assert.ok(parseFreelancerAllocation("0.1234567", 6, c).error);
  assert.equal(parseFreelancerAllocation("1", 6, c).award, 1_000_000n);
});

test("hourly: employer sees an info state, not a disabled End button, while a session runs", () => {
  assert.equal(
    HOURLY_COPY.employerSessionInProgress,
    "Freelancer work session in progress. The contract can be ended after the freelancer stops the current session. Need to end it now? Open a dispute."
  );
  const src = read("components/contracts/HourlyShowcase.tsx");
  assert.match(src, /HOURLY_COPY\.employerSessionInProgress/);
  assert.doesNotMatch(src, /<Button disabled variant="secondary" aria-label="End hourly contract">/);
});

test("contract tabs read All | As employer | As freelancer | Resolving", () => {
  const src = read("components/contracts/ContractsPage.tsx");
  assert.match(src, /label: "As employer"/);
  assert.match(src, /label: "As freelancer"/);
  assert.doesNotMatch(src, /label: "Hiring"|label: "Working"/);
});

test("outcome notification kind follows on-chain status; client sync dedupes per key", () => {
  assert.equal(outcomeNotificationKindForStatus("Resolved"), "settlement_recorded");
  assert.equal(outcomeNotificationKindForStatus("Completed"), "contract_ended");
  assert.equal(outcomeNotificationKindForStatus("Cancelled"), "contract_ended");
  assert.equal(outcomeNotificationKindForStatus("Active"), null);
  assert.equal(outcomeNotificationKindForStatus("Disputed"), null);
  const seen = new Set<string>();
  const key = outcomeSyncKey("C", "settlement_recorded", "W");
  assert.equal(markOutcomeSync(key, seen), true);
  assert.equal(markOutcomeSync(key, seen), false);
  const detail = read("components/contracts/ContractDetail.tsx");
  assert.match(detail, /requestContractOutcomeNotification\(/);
});
