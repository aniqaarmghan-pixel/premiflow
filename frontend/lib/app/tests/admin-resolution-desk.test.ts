import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ADMIN_CENTER_COPY, ADMIN_DESKS } from "../admin-center";
import { RESOLVER_NAV, RESOLVER_WORKSPACE_COPY, isNavActive } from "../resolver-workspace";
import { RESOLVER_UX_COPY } from "../resolver-cases";
import { canShowResolverSettlementControls } from "../resolver-cases";
import { makeContract, RESOLVER, WALLET_A, WALLET_B, WALLET_C } from "../../streampay-v2/tests/fixtures";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

test("Admin Center replaces the resolver workspace switch", () => {
  assert.equal(RESOLVER_WORKSPACE_COPY.switchToResolver, "Admin Center");
  const shell = read("components/shell/AppShell.tsx");
  assert.doesNotMatch(shell, /Switch to resolver workspace/);
  assert.match(shell, /RESOLVER_WORKSPACE_COPY\.switchToResolver/);
  assert.match(shell, /next === "resolver" \? "\/admin"/);
  assert.match(read("app/admin/page.tsx"), /AdminCenter/);
  assert.equal(isNavActive("/admin", "/admin"), true);
  assert.equal(isNavActive("/admin", "/resolver"), false);
});

test("Admin Center has Help Desk and Resolution Desk; Help Desk has no settlement authority", () => {
  assert.deepEqual(ADMIN_DESKS.map((d) => d.title), ["Help Desk", "Resolution Desk"]);
  const help = ADMIN_DESKS.find((d) => d.id === "help")!;
  assert.match(help.authority, /No escrow settlement authority/);
  const desk = ADMIN_DESKS.find((d) => d.id === "resolution")!;
  for (const fact of [/statements/, /message evidence/, /disputed amount/, /allocation/]) {
    assert.match(desk.body, fact);
  }
  assert.match(desk.authority, /on-chain designated resolver/);
  assert.match(ADMIN_CENTER_COPY.intro, /same PREMIFLOW admin account/);
  assert.match(ADMIN_CENTER_COPY.humanDecision, /does not use AI to decide/);
});

test("Resolution Desk nav has no marketplace / party actions", () => {
  const labels = RESOLVER_NAV.map((i) => i.label);
  assert.ok(labels.includes("Resolution Desk") && labels.includes("Help Desk"));
  assert.ok(!labels.some((l) => /Create contract|Marketplace|Hiring|Working|Post a job/i.test(l)));
});

test("Resolve dispute is visible for the connected designated resolver only", () => {
  assert.equal(RESOLVER_UX_COPY.reviewSettlement, "Resolve dispute");
  const detail = read("components/contracts/ContractDetail.tsx");
  assert.match(detail, /publicKey\.equals\(contract\.resolver\)/);
  assert.match(detail, /connectedIsResolver\s*\?\s*"resolver"/);
  assert.match(detail, /client\.resolveDispute\(/, "reuses the existing resolveDispute transaction");
  const c = makeContract({ status: "Disputed", contestedAmount: 100n });
  assert.equal(canShowResolverSettlementControls(RESOLVER, c), true);
  for (const w of [WALLET_A, WALLET_B, WALLET_C]) {
    assert.equal(canShowResolverSettlementControls(w, c), false);
  }
});

test("Coming later placeholders are gone and nothing auto-decides", () => {
  const rc = read("components/contracts/ResolutionCenter.tsx");
  assert.doesNotMatch(rc, /Coming later|comingLater/i);
  assert.doesNotMatch(read("lib/app/admin-center.ts"), /suggestedAward|autoResolve/);
});
