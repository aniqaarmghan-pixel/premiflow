import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  installedWalletNames,
  safeWalletList,
  walletConnectFailure,
  walletConnectStep,
  walletErrorReport,
  walletSwitchStep,
} from "../wallet-connect";
import { milestoneProgress } from "../milestone-progress";
import {
  MAX_PROTECTION_FEE_BPS,
  PROTECTION_FEE_CONFIG,
  isProtectionFeeActive,
  protectionFeeBreakdown,
} from "../protection-fee";
import { previewableImageUrls, profileInitials, profilePhotoUrlError } from "../profile-identity";
import { makeContract } from "../../streampay-v2/tests/fixtures";
import type { WorkUnitView } from "../../streampay-v2";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

// ---------------------------------------------------------------- 1. wallet runtime
test("wallet lists are null/undefined-safe (root cause of reading 'some')", () => {
  assert.deepEqual(safeWalletList(undefined), []);
  assert.deepEqual(safeWalletList(null), []);
  assert.deepEqual(safeWalletList([null, undefined]), []);
  assert.deepEqual(installedWalletNames(undefined), []);
  assert.deepEqual(
    installedWalletNames([
      { readyState: "Installed", adapter: { name: "Phantom" } },
      { readyState: "Installed", adapter: undefined },
      { readyState: "Installed", adapter: null },
      null,
      { readyState: "NotDetected", adapter: { name: "Solflare" } },
    ]),
    ["Phantom"]
  );
  // No installed list -> still a safe decision, never a throw.
  const step = walletConnectStep({
    connected: false,
    connecting: false,
    selected: false,
    selectedReady: false,
    installed: installedWalletNames(undefined),
    hasModal: true,
  });
  assert.equal(step, "open_modal");
});

test("Phantom 'reading some' connection error and rejection are non-fatal", () => {
  const wrapped = {
    name: "WalletConnectionError",
    message: "Cannot read properties of undefined (reading 'some')",
    error: new TypeError("Cannot read properties of undefined (reading 'some')"),
  };
  assert.equal(walletConnectFailure(wrapped).kind, "failed");
  assert.equal(walletErrorReport(wrapped), "warn");
  assert.equal(walletErrorReport({ name: "WalletConnectionError", error: { code: 4001, message: "User rejected the request." } }), "silent");
  assert.equal(walletErrorReport({ name: "WalletNotReadyError" }), "info");
  assert.equal(walletErrorReport(undefined), "warn");
});

test("one active wallet: switching disconnects first, provider has no autoConnect and reports errors softly", () => {
  assert.equal(walletSwitchStep({ connected: true, selected: true }), "disconnect_then_pick");
  assert.equal(walletSwitchStep({ connected: false, selected: true }), "disconnect_then_pick");
  assert.equal(walletSwitchStep({ connected: false, selected: false }), "pick");

  const providers = read("app/providers.tsx");
  assert.doesNotMatch(providers, /\bautoConnect\b/);
  assert.match(providers, /onError=\{onWalletError\}/);
  assert.doesNotMatch(providers, /console\.error/);

  const control = read("components/shell/WalletControl.tsx");
  assert.match(control, /walletSwitchStep\(/);
  assert.match(control, /settleWithin\(disconnect\(\)[\s\S]*select\(null\);[\s\S]*setVisible\(true\)/);
  // Dismissed picker clears the pending connect so Apply/Hire and the header never double-connect.
  assert.match(control, /modalWasOpenRef/);

  const hook = read("lib/hooks/useWalletConnectRequest.ts");
  assert.match(hook, /installedWalletNames\(wallets\)/);
  assert.doesNotMatch(hook, /wallets\s*\n?\s*\.filter/);
  assert.match(hook, /modalWasOpenRef/);

  // Exactly one WalletProvider for the whole app -> one shared wallet state
  // (Apply, Hire, header and Create all read the same useWallet()).
  const files = ["app/providers.tsx", "app/layout.tsx"].filter((f) => {
    try {
      read(f);
      return true;
    } catch {
      return false;
    }
  });
  const providerCount = files.reduce((n, f) => n + (read(f).match(/<WalletProvider\b/g) ?? []).length, 0);
  assert.equal(providerCount, 1);
  for (const dir of ["components/site", "components/marketplace", "components/shell"]) {
    for (const f of readdirSync(new URL(`../../../${dir}`, import.meta.url))) {
      if (!f.endsWith(".tsx")) continue;
      assert.doesNotMatch(read(`${dir}/${f}`), /<WalletProvider\b|new PhantomWalletAdapter/, `${dir}/${f}`);
    }
  }
});

// ---------------------------------------------------------------- 2/3. sidebar + brand
test("desktop sidebar fills 100dvh with an internal hidden-scrollbar nav; logos never clipped", () => {
  const shell = read("components/shell/AppShell.tsx");
  assert.match(shell, /lg:h-\[100dvh\] lg:flex-col lg:self-start lg:overflow-hidden lg:min-h-\[100dvh\]/);
  assert.match(shell, /pf-rail [^"]*min-h-0 flex-1 [^"]*overflow-y-auto/);
  // Bottom padding keeps the last Profile / Support / footer items reachable above overlays.
  assert.match(shell, /pf-rail [^"]*pb-\[calc\(6rem/);
  assert.match(shell, /<BrandMark light size=\{44\} wordmarkFontSize="1\.32rem" \/>/);
  assert.match(shell, /lg:grid-cols-\[224px_minmax\(0,1fr\)\]/);
  const css = read("app/globals.css");
  assert.match(css, /\.pf-rail::-webkit-scrollbar\s*\{\s*display:\s*none/);

  const pub = read("components/site/PublicShell.tsx");
  assert.match(pub, /<BrandMark light trim size=\{58\} gap=\{14\} wordmarkFontSize="2\.2rem" \/>/);
  assert.match(pub, /<BrandMark light trim size=\{36\} gap=\{10\} wordmarkFontSize="1\.4rem" \/>/);
  assert.match(pub, /className="min-w-max shrink-0"/);
});

// ---------------------------------------------------------------- 4. profile vs gig
test("profile photo UX replaces the technical Avatar URL field; initials fallback", () => {
  const form = read("components/marketplace/MarketplaceProfileForm.tsx");
  assert.doesNotMatch(form, /Avatar URL/);
  assert.match(form, /ProfilePhotoField/);
  assert.match(form, /avatarUrl: current\.avatarUrl\.trim\(\)/); // same storage field
  assert.match(form, /ProfileVsGigNote/);
  assert.equal(profileInitials("Ana Maria Lopez"), "AL");
  assert.equal(profileInitials("acme"), "AC");
  assert.equal(profileInitials("", "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"), "7X");
  assert.equal(profileInitials(null, null), "");
  assert.equal(profilePhotoUrlError(""), null);
  assert.equal(profilePhotoUrlError("https://cdn.example.com/a.png"), null);
  assert.notEqual(profilePhotoUrlError("http://cdn.example.com/a.png"), null);
  assert.notEqual(profilePhotoUrlError("not a url"), null);
  assert.deepEqual(previewableImageUrls(["https://a.example/x.png", "http://b", "", "https://c.example/y.jpg"]), [
    "https://a.example/x.png",
    "https://c.example/y.jpg",
  ]);
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  assert.match(parts, /profileInitials\(name, wallet\)/);
  assert.match(parts, /onError=\{\(\) => setFailedUrl\(url\)\}/);
  const gigForm = read("components/marketplace/MarketplaceGigForm.tsx");
  assert.match(gigForm, /PROFILE_VS_GIG_COPY\.gigMediaNote/);
  assert.match(gigForm, /<GigImagePreview /);
});

// ---------------------------------------------------------------- 5. milestones
function unit(over: Partial<WorkUnitView>): WorkUnitView {
  return {
    index: 0,
    kind: "Milestone",
    status: "Defined",
    amount: 100n,
    periodStart: 0,
    periodEnd: 0,
    dueOffsetSeconds: 0,
    submittedAt: 0,
    actionDeadline: 0,
    approvedAt: 0,
    releasedAt: 0,
    revisionCount: 0,
    releaseTrigger: "NotReleased",
    submissionUri: "",
    ...over,
  } as WorkUnitView;
}

test("milestone progress uses only stored contract / work-unit data", () => {
  const contract = makeContract({
    paymentMode: "Milestone",
    status: "Active",
    startTime: 1_000,
    totalAmount: 400n,
    releasedAmount: 100n,
    maxRevisions: 2,
  });
  const model = milestoneProgress(contract, [
    unit({ index: 2, amount: 150n }),
    unit({ index: 0, amount: 100n, status: "Released", releasedAt: 2_000, releaseTrigger: "EmployerApproval" }),
    unit({ index: 1, amount: 150n, status: "Submitted", submittedAt: 1_500, actionDeadline: 9_000, revisionCount: 1, dueOffsetSeconds: 600 }),
    unit({ index: 9, kind: "Trial", amount: 5n }),
  ]);
  assert.deepEqual(model.steps.map((s) => s.state), ["completed", "submitted", "upcoming"]);
  assert.equal(model.steps[0].releasedVia, "Employer approval");
  assert.equal(model.steps[0].releasedAmount, 100n);
  assert.equal(model.steps[1].reviewEndsAt, 9_000);
  assert.equal(model.steps[1].dueAt, 1_600);
  assert.equal(model.steps[1].revisionsUsed, 1);
  assert.equal(model.steps[1].maxRevisions, 2);
  assert.equal(model.steps[2].dueAt, null); // not stored -> not shown
  assert.equal(model.steps[2].reviewEndsAt, null);
  assert.equal(model.releasedPct, 25);
  assert.equal(model.milestoneTotal, 400n);

  const current = milestoneProgress(contract, [unit({ index: 0 }), unit({ index: 1 })]);
  assert.deepEqual(current.steps.map((s) => s.state), ["current", "upcoming"]);
  const disputed = milestoneProgress({ ...contract, status: "Disputed" }, [unit({ index: 0, status: "Void" }), unit({ index: 1 })]);
  assert.deepEqual(disputed.steps.map((s) => s.state), ["void", "disputed"]);
  assert.equal(milestoneProgress(contract, undefined).steps.length, 0);

  const detail = read("components/contracts/ContractDetail.tsx");
  assert.match(detail, /contract\.paymentMode === "Milestone" && main\.length > 0 \? \(\s*<MilestoneProgressPanel/);
  // Action cards stay below the panel.
  assert.ok(detail.indexOf("<MilestoneProgressPanel") < detail.indexOf("main.map((unit) => ("));
  const panel = read("components/contracts/MilestoneProgressPanel.tsx");
  assert.doesNotMatch(panel, /StreamShowcase|streamReleased|accru/i);
});

// ---------------------------------------------------------------- 6. workspace side panel
test("contract workspace side panel stretches with an intentional brand surface", () => {
  const detail = read("components/contracts/ContractDetail.tsx");
  assert.match(detail, /xl:flex xl:flex-col xl:self-stretch" data-workspace-side-panel/);
  assert.match(detail, /aria-hidden="true"\s*data-workspace-rail-fill/);
});

// ---------------------------------------------------------------- 8. monetization readiness
test("protection fee is disabled by default and never changes payment amounts", () => {
  assert.equal(PROTECTION_FEE_CONFIG.enabled, false);
  assert.equal(PROTECTION_FEE_CONFIG.bps, 0);
  assert.equal(isProtectionFeeActive(), false);
  for (const agreed of [0n, 1n, 999_999n, 5_000_000_000n]) {
    const b = protectionFeeBreakdown(agreed);
    assert.equal(b.enabled, false);
    assert.equal(b.fee, 0n);
    assert.equal(b.freelancerReceives, agreed);
    assert.equal(b.employerTotal, agreed);
  }
  // Even a hypothetical future config never reduces the freelancer amount.
  const future = protectionFeeBreakdown(1_000_000n, { enabled: true, bps: 250, label: "Fee" });
  assert.equal(future.freelancerReceives, 1_000_000n);
  assert.equal(future.fee, 25_000n);
  assert.equal(future.employerTotal, 1_025_000n);
  assert.equal(protectionFeeBreakdown(100n, { enabled: true, bps: 99_999, label: "x" }).fee, (100n * BigInt(MAX_PROTECTION_FEE_BPS)) / 10_000n);
  assert.equal(protectionFeeBreakdown(100n, { enabled: false, bps: 500, label: "x" }).fee, 0n);

  // Not wired into any transaction path.
  for (const f of [
    "lib/streampay-v2/send.ts",
    "lib/streampay-v2/instructions.ts",
    "components/create/CreateWizard.tsx",
  ]) {
    assert.doesNotMatch(read(f), /protection-fee|ProtectionFee/, f);
  }
  const summary = read("components/contracts/ProtectionFeeSummary.tsx");
  assert.match(summary, /if \(!breakdown\.enabled\) return null;/);
  assert.match(read("docs/PROTECTION_FEE.md"), /Devnet redeploy/);
});
