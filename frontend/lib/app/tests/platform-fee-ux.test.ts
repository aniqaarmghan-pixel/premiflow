import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EMPLOYER_FEE_NOTE,
  FREELANCER_FEE_NOTE,
  agreedAmountLabel,
  contractFeeSummary,
  createFeeSummary,
  feePercentLabel,
  feeRowLabel,
} from "../platform-fee";
import { canonicalHourlyEarned } from "../../streampay-v2";
import { makeContract } from "../../streampay-v2/tests/fixtures";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

test("create summary: agreed + 3% fee = employer total (base units, floor)", () => {
  const s = createFeeSummary(100_000_000n);
  assert.deepEqual(
    [s.agreedAmount, s.fee, s.employerTotal, s.feeBps, s.charged],
    [100_000_000n, 3_000_000n, 103_000_000n, 300, true]
  );
  assert.equal(createFeeSummary(33n).fee, 0n);
  assert.equal(createFeeSummary(101n).employerTotal, 104n);
  assert.equal(feeRowLabel(300), "Platform fee (3%)");
  assert.equal(feePercentLabel(250), "2.5%");
  assert.equal(feePercentLabel(125), "1.25%");
});

test("hourly fee uses max funded budget + trial, never the hourly rate", () => {
  const rate = 10_000_000n;
  const main = canonicalHourlyEarned(rate, 7_200n);
  const trial = 5_000_000n;
  const s = createFeeSummary(main + trial);
  assert.equal(s.agreedAmount, 25_000_000n);
  assert.equal(s.fee, 750_000n);
  assert.notEqual(s.fee, createFeeSummary(rate).fee);
  assert.equal(agreedAmountLabel("Hourly", true), "Contract amount (max budget + trial)");
});

test("streaming fee is on the full stream principal, not accrued earnings", () => {
  const c = makeContract({
    paymentMode: "Streaming",
    totalAmount: 1_000n,
    releasedAmount: 250n,
    feeBps: 300,
    feeReserve: 30n,
  });
  const s = contractFeeSummary(c);
  assert.deepEqual([s.agreedAmount, s.fee, s.employerTotal], [1_000n, 30n, 1_030n]);
  assert.equal(agreedAmountLabel("Streaming", false), "Contract amount (full stream)");
});

test("old feeBps = 0 contracts never show a charged fee", () => {
  for (const fields of [{}, { feeBps: 0, feeReserve: 0n }]) {
    const s = contractFeeSummary(makeContract({ totalAmount: 1_000_000n, ...fields }));
    assert.equal(s.charged, false);
    assert.equal(s.fee, 0n);
    assert.equal(s.employerTotal, 1_000_000n);
  }
  const summary = read("components/contracts/ProtectionFeeSummary.tsx");
  assert.match(summary, /if \(!summary\.charged\) return null;/);
});

test("on-chain fee reserve is authoritative for existing contracts", () => {
  const s = contractFeeSummary(makeContract({ totalAmount: 1_000n, feeBps: 500, feeReserve: 50n }));
  assert.equal(s.fee, 50n);
  assert.equal(feeRowLabel(s.feeBps), "Platform fee (5%)");
});

test("copy: symmetric plan-based fee is disclosed on both sides, never hidden", () => {
  assert.match(EMPLOYER_FEE_NOTE, /PREMIFLOW platform fee/);
  assert.match(FREELANCER_FEE_NOTE, /deducted from principal you actually withdraw/);
  assert.match(FREELANCER_FEE_NOTE, /never charged/);
  const sides = read("components/contracts/FeeSides.tsx");
  for (const label of ['"Total funding"', '"Gross earnings"', '"Estimated net"', '"Employer"', '"Freelancer"']) {
    assert.ok(sides.includes(label), label);
  }
  const sources = [
    "lib/app/platform-fee.ts",
    "components/contracts/ProtectionFeeSummary.tsx",
    "components/create/CreateWizard.tsx",
  ].map(read);
  for (const src of sources) assert.doesNotMatch(src, /receives the full agreed amount/i);
  const helper = read("lib/app/platform-fee.ts");
  assert.doesNotMatch(helper, /parseFloat|Math\.round|\* 0\.03/);
});

test("create wizard review shows both fee sides for every mode", () => {
  const wizard = read("components/create/CreateWizard.tsx");
  assert.match(wizard, /createFeeSummary\(fundedPrincipal, feeRates\.employerFeeBps, feeRates\.freelancerFeeBps\)/);
  assert.match(wizard, /fundedPrincipal != null && feeRates\.status === "ready"/);
  assert.doesNotMatch(wizard, /useSubscriptionPlan|INTENDED_PLATFORM_FEE_BPS/);
  assert.match(wizard, /<FeeSides/);
  assert.match(wizard, /useCreateFeeRates\(publicKey\?\.toBase58\(\) \?\? null, draft\.freelancer\)/);
  assert.match(wizard, /feeRates=\{createFeeRates\}/);
  assert.match(wizard, /fundedPrincipal=\{totalParsed\}/);
  assert.doesNotMatch(wizard, /incl\. 3% fee/);
  for (const mode of ["Fixed", "Milestone", "Streaming", "Hourly"] as const) {
    assert.match(agreedAmountLabel(mode, false), /^Contract amount/);
  }
  const progress = read("components/contracts/PaymentProgress.tsx");
  assert.match(progress, /<ProtectionFeeSummary contract=\{contract\} decimals=\{decimals\} role=\{role\} \/>/);
});
