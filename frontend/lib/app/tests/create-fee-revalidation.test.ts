import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FEE_CHANGED_MESSAGE,
  feeRatesDiffer,
  revalidateCreateFees,
  type AuthoritativeCreateFeeRates,
} from "../create-fee-revalidation";
import { SUBSCRIPTION_PLANS } from "../subscription-plans";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const rates = (employerFeeBps: number, freelancerFeeBps: number): AuthoritativeCreateFeeRates => ({
  baseFeeBps: 300,
  employerTier: "Free",
  freelancerTier: "Free",
  employerFeeBps,
  freelancerFeeBps,
});

test("pre-sign: unchanged rates allow signing", async () => {
  const check = await revalidateCreateFees(rates(300, 300), async () => rates(300, 300));
  assert.equal(check.ok, true);
});

test("pre-sign: employer or freelancer rate change blocks signing and returns fresh rates", async () => {
  for (const fresh of [rates(100, 300), rates(300, 0), rates(0, 100)]) {
    const check = await revalidateCreateFees(rates(300, 300), async () => fresh);
    assert.equal(check.ok, false);
    assert.ok(!check.ok && check.reason === "changed");
    assert.deepEqual(check.reason === "changed" ? check.rates : null, fresh);
  }
  assert.equal(feeRatesDiffer(rates(300, 300), rates(300, 300)), false);
  assert.equal(feeRatesDiffer(rates(300, 300), rates(300, 290)), true);
});

test("pre-sign: no rates shown, or chain unreadable, never signs", async () => {
  const notShown = await revalidateCreateFees(null, async () => rates(300, 300));
  assert.ok(!notShown.ok && notShown.reason === "changed");
  const unreadable = await revalidateCreateFees(rates(300, 300), async () => {
    throw new Error("rpc down");
  });
  assert.ok(!unreadable.ok && unreadable.reason === "unavailable");
});

test("pre-sign message is exact", () => {
  assert.equal(FEE_CHANGED_MESSAGE, "Your plan or platform fee changed. Please review the updated fees before signing.");
});

test("wizard: every create path revalidates before the wallet prompt and requires re-confirmation", () => {
  const wizard = read("components/create/CreateWizard.tsx");
  // Single create callsite covers Fixed / Milestone / Streaming (createContract) and Hourly.
  assert.equal((wizard.match(/await client\.createContract\(/g) ?? []).length, 1);
  assert.equal((wizard.match(/await client\.createHourlyContract\(/g) ?? []).length, 1);
  const outer = wizard.indexOf("const feeCheck = await revalidateCreateFees(");
  const run = wizard.indexOf('"Create & send offer"');
  const inner = wizard.indexOf("const lastFeeCheck = await revalidateCreateFees(feeCheck.rates, readFreshFees);");
  const attempt = wizard.indexOf("intent = markCreateAttempted(intent, Date.now());");
  const send = wizard.indexOf("await client.createHourlyContract(");
  assert.ok(outer > 0 && outer < run, "checked before the create transaction starts");
  assert.ok(inner > run && inner < attempt && attempt < send, "re-checked right before signing");
  assert.match(wizard, /createFeeRates\.replace\(feeCheck\.rates\);\n\s+setFeeChangeNotice\(FEE_CHANGED_MESSAGE\);/);
  assert.match(wizard, /if \(!feeCheck\.ok\) \{[\s\S]*?return;\n\s+\}/);
  assert.match(wizard, /feeChangeNotice !== null \|\|/);
  assert.match(wizard, /role="alert"[\s\S]*?\{FEE_RECONFIRM_LABEL\}/);
  // The program stays authoritative: no client bps in create requests.
  const client = read("lib/streampay-v2/instructions.ts");
  assert.doesNotMatch(client, /feeBps\s*:/);
  const types = read("lib/streampay-v2/types.ts");
  for (const name of ["export type CreateContractRequest", "export type CreateHourlyContractRequest"]) {
    const start = types.indexOf(name);
    assert.ok(start >= 0, name);
    assert.doesNotMatch(types.slice(start, types.indexOf("};", start)), /fee/i, `${name} carries no fee input`);
  }
});

test("pricing: Free 3% is the current launch rate, not a permanent guarantee", () => {
  const free = SUBSCRIPTION_PLANS.find((p) => p.tier === "Free");
  assert.equal(free?.feeLabel, "3% platform fee (current launch rate)");
});
