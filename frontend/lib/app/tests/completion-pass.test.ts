import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatFriendlyTokenAmount } from "../money";
import {
  DEVNET_TEST_ASSET_COPY,
  PREMIFLOW_TEST_TOKEN,
  defaultPaymentToken,
  isDevnetTestAsset,
  paymentTokenDisplayLabel,
  paymentTokenLabel,
} from "../premiflow";
import { RESOLVER_NAV, RESOLVER_WORKSPACE_COPY, canSwitchWorkspace, isNavActive } from "../resolver-workspace";
import { ADMIN_DESKS } from "../admin-center";
import { RESOLVER_UX_COPY } from "../resolver-cases";
import { AI_CASE_SUMMARY_COPY } from "../resolution-center";
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_STATUS_LABEL,
} from "../support-tickets";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

test("Devnet token displays as Demo USDT; mint/decimals/labels unchanged", () => {
  assert.equal(PREMIFLOW_TEST_TOKEN.symbol, "Demo USDT");
  assert.equal(PREMIFLOW_TEST_TOKEN.decimals, 6);
  assert.equal(PREMIFLOW_TEST_TOKEN.mint.toBase58(), "9JTBN7QLcoam7LkN44YDhtMQsYt4zKLW7KUE4FscgZtx");
  assert.equal(paymentTokenLabel(PREMIFLOW_TEST_TOKEN.mint), "PREMIFLOW Test Token");
  assert.equal(formatFriendlyTokenAmount(103_000_000n, 6), "103.00 Demo USDT");
  assert.equal(formatFriendlyTokenAmount(3_000_000n, 6, "ACME"), "3.00 ACME", "custom labels untouched");
  assert.equal(defaultPaymentToken().symbol, "Demo USDT");
  assert.equal(DEVNET_TEST_ASSET_COPY.label, "Devnet test asset");
  assert.equal(DEVNET_TEST_ASSET_COPY.tooltip, "Not official USDT: a Devnet test token with no real value.");
  assert.doesNotMatch(read("lib/app/premiflow.ts"), /\bPFT\b/);
});

test("Admin nav: exact items, Exit Admin Center, no Back to contracts, no marketplace/party items", () => {
  assert.deepEqual(
    RESOLVER_NAV.map((i) => i.label),
    ["Admin Center", "Help Desk", "Resolution Desk", "Assigned Disputes", "Resolved Cases", "Resolution Activity", "Exit Admin Center"]
  );
  assert.equal(RESOLVER_NAV.find((i) => i.label === "Exit Admin Center")!.href, "/dashboard");
  assert.equal(RESOLVER_NAV.find((i) => i.label === "Help Desk")!.href, "/admin/help-desk");
  assert.equal(isNavActive("/admin", "/admin/help-desk"), false);
  assert.equal(isNavActive("/admin/help-desk", "/admin/help-desk"), true);
  assert.equal("switchToContracts" in RESOLVER_WORKSPACE_COPY, false);
  const shell = read("components/shell/AppShell.tsx");
  assert.doesNotMatch(shell, /Back to contracts|switchToContracts/);
  assert.match(shell, /workspace\.canSwitch && workspace\.mode !== "resolver"/);
  assert.match(shell, /ADMIN_EXIT_HREF/);
  assert.equal(canSwitchWorkspace(0, true), true);
  assert.equal(canSwitchWorkspace(0, false), false);
  assert.equal(ADMIN_DESKS.find((d) => d.id === "help")!.href, "/admin/help-desk");
  assert.match(read("lib/hooks/useAppAdmin.ts"), /\/api\/admin\/me|fetchAdminMe/);
});

test("Help Desk vocabulary: categories and statuses", () => {
  assert.deepEqual(SUPPORT_TICKET_CATEGORIES.map((c) => c.label), ["Account", "Wallet", "Marketplace", "Contract", "Payment", "Technical", "Other"]);
  assert.deepEqual(Object.values(SUPPORT_TICKET_STATUS_LABEL), ["Open", "In progress", "Resolved"]);
  assert.match(read("app/admin/help-desk/page.tsx"), /HelpDesk/);
  assert.match(read("components/support/SupportPage.tsx"), /<SupportTickets \/>/);
});

test("Resolution Desk: section order, prominent settlement, existing resolveDispute only", () => {
  const rc = read("components/contracts/ResolutionCenter.tsx");
  assert.doesNotMatch(rc, /Coming later|comingLater/);
  const order = [
    "CASE_WORKSPACE_COPY.heading",
    "EVIDENCE_COPY.heading",
    "PARTY_STATEMENTS_COPY.heading",
    "SUBMITTED_EVIDENCE_COPY.heading",
    "<CaseAiSummary",
    "RESOLVER_UX_COPY.settlementHeading}",
  ].map((marker) => rc.indexOf(marker));
  assert.ok(order.every((i) => i > 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "sections render in order");
  assert.equal(RESOLVER_UX_COPY.settlementHeading, "Settlement decision");
  assert.equal(RESOLVER_UX_COPY.freelancerReceives, "Freelancer receives");
  assert.equal(RESOLVER_UX_COPY.employerReceives, "Employer receives (refund)");
  assert.match(RESOLVER_UX_COPY.totalLabel, /disputed remainder/);
  assert.equal(RESOLVER_UX_COPY.reviewSettlement, "Resolve dispute");
  assert.match(rc, /totalLabel/);
  assert.match(read("components/contracts/ContractDetail.tsx"), /client\.resolveDispute\(/);
  assert.equal(AI_CASE_SUMMARY_COPY.label, "AI case summary \u2014 informational only");
  assert.doesNotMatch(read("components/contracts/CaseAiSummary.tsx"), /resolveDispute|signTransaction/);
});

test("init-fee-config script is manual-only and never wired into package scripts", () => {
  const script = read("scripts/init-fee-config.ts");
  assert.match(script, /PREMIFLOW_CONFIRM_INIT_FEE_CONFIG !== "yes"/);
  assert.match(script, /feeBps !== 300/);
  assert.match(script, /<PATH_TO_PROGRAM_UPGRADE_AUTHORITY_KEYPAIR_JSON>/);
  assert.doesNotMatch(script, /readFileSync|secretKey|fromSecretKey/);
  assert.doesNotMatch(read("package.json"), /init-fee-config/);
});

test("Demo USDT display + Devnet note only for the configured test mint; surfaces wired", () => {
  const mint = PREMIFLOW_TEST_TOKEN.mint;
  const custom = "So11111111111111111111111111111111111111112";
  assert.equal(isDevnetTestAsset(mint), true);
  assert.equal(isDevnetTestAsset(mint.toBase58()), true);
  assert.equal(isDevnetTestAsset(custom), false);
  assert.equal(isDevnetTestAsset(null), false);
  assert.equal(paymentTokenDisplayLabel(mint), "Demo USDT");
  assert.equal(paymentTokenDisplayLabel(custom), paymentTokenLabel(custom), "custom labels unchanged");
  const note = read("components/ui/DevnetAssetNote.tsx");
  assert.match(note, /isDevnetTestAsset\(mint\)/);
  assert.match(note, /title=\{DEVNET_TEST_ASSET_COPY\.tooltip\}/);
  const create = read("components/create/CreateWizard.tsx");
  assert.doesNotMatch(create, /paymentTokenLabel\(draft\.mint\)/);
  assert.match(create, /Payment summary \(\{paymentTokenDisplayLabel\(draft\.mint\)\}\)/);
  for (const file of [
    "components/create/CreateWizard.tsx",
    "components/overview/OverviewPage.tsx",
    "components/contracts/ContractDetail.tsx",
    "components/activity/ActivityPage.tsx",
  ]) {
    assert.match(read(file), /<DevnetAssetNote/, file);
    assert.doesNotMatch(read(file), /\bPFT\b/, file);
  }
});
