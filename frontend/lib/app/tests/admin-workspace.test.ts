import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ADMIN_CENTER_COPY } from "../admin-center";
import { settlementPanelOwnsResolve, withoutDuplicateResolveAction } from "../dispute-ux";
import {
  ADMIN_NAV,
  RESOLVER_DESK_NAV,
  adminEntryRedirect,
  deskShellKind,
  isAdminWorkspacePath,
} from "../resolver-workspace";
import { POST_SIGN_IN_HREF, isDashboardNavActive } from "../site-routes";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const ADMIN_PATHS = ["/admin", "/admin/help-desk", "/resolver", "/resolver/assigned", "/resolver/resolved", "/resolver/activity"];

test("server admin: dedicated Admin workspace on /admin, Help Desk and /resolver*; entry opens /admin", () => {
  assert.deepEqual(ADMIN_NAV.map((i) => i.label), [
    "Admin Center",
    "Help Desk",
    "Resolution Desk",
    "Assigned Disputes",
    "Resolved Cases",
    "Resolution Activity",
  ]);
  assert.deepEqual(ADMIN_NAV.map((i) => i.href), ADMIN_PATHS);
  for (const pathname of ADMIN_PATHS) {
    assert.equal(isAdminWorkspacePath(pathname), true);
    for (const workspaceMode of ["party", "resolver"] as const) {
      assert.equal(deskShellKind({ adminStatus: "admin", workspaceMode, pathname }), "admin");
    }
  }
  assert.equal(POST_SIGN_IN_HREF, "/dashboard");
  assert.equal(adminEntryRedirect(POST_SIGN_IN_HREF, "admin"), "/admin");
  assert.equal(adminEntryRedirect("/dashboard", "user"), null);
  assert.equal(adminEntryRedirect("/dashboard", "loading"), null);
  assert.equal(adminEntryRedirect("/contracts/abc", "admin"), null, "case detail stays reachable");
  assert.equal(isDashboardNavActive("/admin", "/admin/help-desk"), false);
  assert.equal(isDashboardNavActive("/admin/help-desk", "/admin/help-desk"), true);
  const shell = read("components/shell/AppShell.tsx");
  assert.match(shell, /useAppAdminStatus\(user\?\.id \?\? null\)/);
  assert.match(shell, /router\.replace\(target\)/);
  assert.match(shell, /desk === "party" \? \(\s*<DashboardBottomNav/);
  assert.match(shell, /desk === "party" \? <ExploreMarketplaceLink/);
  assert.doesNotMatch(shell, /Exit Admin Center|exitAdmin/);
});

test("normal users keep the marketplace shell; non-admin resolver wallets get resolution pages only", () => {
  assert.equal(deskShellKind({ adminStatus: "user", workspaceMode: "party", pathname: "/dashboard" }), "party");
  assert.equal(deskShellKind({ adminStatus: "user", workspaceMode: "party", pathname: "/admin" }), "party");
  assert.equal(deskShellKind({ adminStatus: "loading", workspaceMode: "party", pathname: "/dashboard" }), "pending");
  assert.equal(deskShellKind({ adminStatus: "user", workspaceMode: "party", pathname: "/resolver/assigned" }), "resolver");
  assert.equal(deskShellKind({ adminStatus: "user", workspaceMode: "resolver", pathname: "/contracts/x" }), "resolver");
  const labels = RESOLVER_DESK_NAV.map((i) => i.label as string);
  assert.ok(labels.includes("Resolution Desk"));
  assert.ok(!labels.some((l) => /Admin Center|Help Desk|Post a job|My Jobs|My Proposals|My Gigs|Saved/.test(l)));
  assert.equal(RESOLVER_DESK_NAV.at(-1)!.href, "/dashboard");
  const center = read("components/admin/AdminCenter.tsx");
  assert.match(center, /useAppAdminStatus/);
  assert.match(center, /status !== "admin"/);
  assert.match(ADMIN_CENTER_COPY.notAuthorized, /not an authorized PREMIFLOW admin/);
  assert.match(read("components/admin/HelpDesk.tsx"), /status === 403/);
  const hook = read("lib/hooks/useAppAdmin.ts");
  assert.match(hook, /new Map<string, Promise<boolean>>/, "admin flag cached per signed-in account");
  assert.match(hook, /if \(!userId\) return;/, "never fetched (and cached) before sign-in");
  assert.doesNotMatch(read("lib/hooks/useWorkspace.ts"), /useAppAdmin/);
});

test("admin status grants no escrow authority: resolver gating stays on the connected wallet", () => {
  assert.match(read("lib/server/admin/auth.ts"), /settlement: false/);
  const detail = read("components/contracts/ContractDetail.tsx");
  assert.match(detail, /publicKey\.equals\(contract\.resolver\)/);
  assert.match(detail, /contractRolesForWallet\(publicKey, contract\)\.isResolver/);
  assert.doesNotMatch(detail, /useAppAdmin/);
  assert.doesNotMatch(read("components/contracts/ResolutionCenter.tsx"), /useAppAdmin/);
});

test("Disputed + designated resolver: exactly one Resolve dispute action (Settlement decision only)", () => {
  const actions = ["resolveDispute"] as const;
  const owned = settlementPanelOwnsResolve({ canSettle: true, role: "resolver", status: "Disputed" });
  assert.equal(owned, true);
  assert.deepEqual(withoutDuplicateResolveAction(actions, owned), [], "Actions card renders none");
  assert.equal(settlementPanelOwnsResolve({ canSettle: false, role: "resolver", status: "Disputed" }), false);
  assert.equal(settlementPanelOwnsResolve({ canSettle: true, role: "employer", status: "Disputed" }), false);
  assert.equal(settlementPanelOwnsResolve({ canSettle: true, role: "resolver", status: "Resolved" }), false);
  assert.deepEqual(withoutDuplicateResolveAction(actions, false), ["resolveDispute"], "no panel: control not lost");
  const detail = read("components/contracts/ContractDetail.tsx");
  assert.match(
    detail,
    /const contractButtons = withoutDuplicateResolveAction\(\s*actions,\s*settlementPanelOwnsResolve\(\{ canSettle: canSettleDispute, role, status: contract\.status \}\)/
  );
  assert.equal((detail.match(/onReviewSettlement=\{\(\) => requestAction\("resolveDispute"\)\}/g) ?? []).length, 1);
  assert.match(detail, /client\.resolveDispute\(/);
});
