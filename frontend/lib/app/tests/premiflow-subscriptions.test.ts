import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { agreedAmountLabel, contractFeeSummary, createFeeSummary } from "../platform-fee";
import { APPROACH, WHY_PREMIFLOW, WHY_SOLANA, WHY_WEB3 } from "../positioning";
import { PRICING_COPY, SUBSCRIPTION_PLANS, planDemoUsdtLabel, planPriceLabel } from "../subscription-plans";
import {
  feeOn,
  DEFAULT_PLATFORM_FEE_BPS,
  FREELANCER_FEE_RATE_UNIT_BPS,
  MAX_FEE_BPS,
  PREMIUM_FEE_BPS,
  PRO_FEE_BPS,
  createContractFeeRates,
  freelancerFeeDue,
  freelancerFeeRateBps,
  freelancerFeeRateFor,
  freelancerNet,
  planFeeBps,
  type PlanTier,
} from "../../streampay-v2/fees";
import { decodePlanTier, effectivePlanTier, encodePlanTier, encodeSubscriptionTerm } from "../../streampay-v2/subscription";
import { deriveSubscriptionPda } from "../../streampay-v2/pda";
import { REQUIRED_V2_INSTRUCTIONS } from "../../streampay-v2/idl-required";
import { makeContract } from "../../streampay-v2/tests/fixtures";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const exists = (p: string) => existsSync(new URL(`../../../${p}`, import.meta.url));
const U = 1_000_000n; // Demo USDT has 6 decimals
const HUNDRED = 100n * U;

function sides(employer: PlanTier, freelancer: PlanTier, principal = HUNDRED) {
  const s = createFeeSummary(principal, planFeeBps(employer), planFeeBps(freelancer));
  return { funding: s.employerTotal, net: s.freelancerNet, totalFee: s.fee + s.freelancerFee, s };
}

test("plans: Free 3%/3% -> funding 103, net 97, total fee 6", () => {
  const r = sides("Free", "Free");
  assert.deepEqual([r.funding, r.net, r.totalFee], [103n * U, 97n * U, 6n * U]);
  assert.deepEqual([r.s.feeBps, r.s.freelancerFeeBps], [300, 300]);
});

test("plans: Pro 1%/1% -> 101 / 99 / 2 and Premium 0%/0% -> 100 / 100 / 0", () => {
  const pro = sides("Pro", "Pro");
  assert.deepEqual([pro.funding, pro.net, pro.totalFee], [101n * U, 99n * U, 2n * U]);
  const premium = sides("Premium", "Premium");
  assert.deepEqual([premium.funding, premium.net, premium.totalFee], [100n * U, 100n * U, 0n]);
  assert.equal(premium.s.charged, false);
});

test("mixed plans: each participant's own plan controls only their own fee", () => {
  const cases: [PlanTier, PlanTier, bigint, bigint][] = [
    ["Pro", "Free", 101n * U, 97n * U],
    ["Premium", "Pro", 100n * U, 99n * U],
    ["Free", "Premium", 103n * U, 100n * U],
  ];
  for (const [employer, freelancer, funding, net] of cases) {
    const r = sides(employer, freelancer);
    assert.deepEqual([r.funding, r.net], [funding, net], `${employer}/${freelancer}`);
  }
  assert.deepEqual([planFeeBps("Free"), planFeeBps("Pro"), planFeeBps("Premium")], [300, 100, 0]);
});

test("freelancer deduction is proportional to principal actually withdrawn, chunk independent", () => {
  const bps = 300;
  const chunks = [1n, 33n * U, 7n, 33n * U + 5n, HUNDRED - 66n * U - 13n];
  let withdrawn = 0n;
  let paid = 0n;
  for (const chunk of chunks) {
    paid += freelancerFeeDue(withdrawn, withdrawn + chunk, bps);
    withdrawn += chunk;
  }
  assert.equal(withdrawn, HUNDRED);
  assert.equal(paid, feeOn(HUNDRED, bps));
  assert.equal(paid, 3n * U);
  // partial release of 40: fee only on 40
  assert.equal(freelancerFeeDue(0n, 40n * U, bps), 1_200_000n);
  assert.throws(() => freelancerFeeDue(10n, 5n, bps));
});

test("partial dispute 60/40: freelancer fee only on awarded principal; refund carries no fee", () => {
  const awarded = 60n * U;
  assert.equal(freelancerFeeDue(0n, awarded, 300), 1_800_000n);
  assert.equal(freelancerNet(awarded, 300), 58_200_000n);
  // employer's unearned 40 is refunded: freelancer was never paid it, so no fee on it
  assert.equal(freelancerFeeDue(awarded, awarded, 300), 0n);
});

test("cancel / refund before any release charges the freelancer nothing", () => {
  assert.equal(freelancerFeeDue(0n, 0n, 300), 0n);
});

test("frozen byte encoding and legacy contracts never charge the freelancer", () => {
  assert.deepEqual([freelancerFeeRateBps(0), freelancerFeeRateBps(10), freelancerFeeRateBps(30)], [0, 100, 300]);
  assert.equal(freelancerFeeRateBps(undefined), 0);
  const legacy = contractFeeSummary(makeContract({ totalAmount: HUNDRED, feeBps: 300, feeReserve: 3n * U }));
  assert.deepEqual([legacy.fee, legacy.freelancerFee, legacy.freelancerNet], [3n * U, 0n, HUNDRED]);
  const upgraded = contractFeeSummary(
    makeContract({ totalAmount: HUNDRED, feeBps: 100, feeReserve: U, freelancerFeeBps: 300 })
  );
  assert.deepEqual([upgraded.employerTotal, upgraded.freelancerNet], [101n * U, 97n * U]);
  const premiumEmployer = contractFeeSummary(makeContract({ totalAmount: HUNDRED, feeBps: 0, freelancerFeeBps: 300 }));
  assert.deepEqual([premiumEmployer.employerTotal, premiumEmployer.freelancerFee, premiumEmployer.charged], [HUNDRED, 3n * U, true]);
  const accounts = read("lib/streampay-v2/accounts.ts");
  assert.match(accounts, /freelancerFeeRateBps\(Number\(optionalField\(raw, "freelancerFeeRate", "freelancer_fee_rate"\) \?\? 0\)\)/);
});

test("every payment mode uses the same symmetric principal-based summary", () => {
  for (const mode of ["Fixed", "Milestone", "Streaming", "Hourly"] as const) {
    assert.match(agreedAmountLabel(mode, true), /^Contract amount/);
  }
  // Hourly principal = max budget + trial (never the hourly rate)
  const hourly = createFeeSummary(20n * U + 5n * U);
  assert.deepEqual([hourly.fee, hourly.freelancerFee], [750_000n, 750_000n]);
});

test("subscription expiry, renewal state decoding and annual pricing", () => {
  const sub = { tier: "Pro" as const, expiresAt: 1_000 };
  assert.equal(effectivePlanTier(sub, 999), "Pro");
  assert.equal(effectivePlanTier(sub, 1_000), "Free");
  assert.equal(effectivePlanTier(null, 0), "Free");
  assert.equal(decodePlanTier({ premium: {} }), "Premium");
  assert.equal(decodePlanTier({ free: {} }), "Free");
  assert.deepEqual(encodePlanTier("Pro"), { pro: {} });
  assert.deepEqual(encodeSubscriptionTerm("Annual"), { annual: {} });
  for (const plan of SUBSCRIPTION_PLANS) assert.equal(plan.annualUsd, plan.monthlyUsd * 10, plan.name);
  const rust = read("../programs/streampay/src/v2/constants.rs");
  for (const [name, value] of [["PRO_MONTHLY_PRICE", 25], ["PRO_ANNUAL_PRICE", 250], ["PREMIUM_MONTHLY_PRICE", 60], ["PREMIUM_ANNUAL_PRICE", 600]] as const) {
    assert.match(rust, new RegExp(`${name}: u64 = ${value};`), name);
  }
});

type IdlAccount = { name: string; pda?: { seeds: { kind: string; value?: number[]; path?: string }[] } };
type IdlIx = { name: string; accounts: IdlAccount[]; args: { name: string; type: unknown }[] };
type IdlType = { name: string; type: { kind: string; fields?: { name: string }[]; variants?: { name: string }[] } };
const idl = JSON.parse(read("lib/streampay-v2/idl/streampay.json")) as {
  address: string;
  instructions: IdlIx[];
  accounts: { name: string }[];
  types: IdlType[];
};
const typeFields = (name: string) => (idl.types.find((t) => t.name === name)?.type.fields ?? []).map((f) => f.name);

test("spoof prevention: plan PDAs are program-derived and required; clients never send bps", () => {
  const seed = [...new TextEncoder().encode("subscription")];
  for (const ixName of ["create_contract", "create_hourly_contract"]) {
    const ix = idl.instructions.find((i) => i.name === ixName);
    assert.ok(ix, ixName);
    for (const [account, path] of [["employer_subscription", "employer"], ["freelancer_subscription", "freelancer"]]) {
      const acc: IdlAccount | undefined = ix.accounts.find((a: IdlAccount) => a.name === account);
      assert.ok(acc?.pda, `${ixName}.${account}`);
      assert.deepEqual(acc.pda.seeds[0].value, seed);
      assert.equal(acc.pda.seeds[1].path, path);
    }
  }
  const purchase = idl.instructions.find((i) => i.name === "purchase_subscription");
  assert.ok(purchase);
  assert.deepEqual(typeFields("PurchaseSubscriptionArgs"), ["tier", "term"]);
  assert.ok(purchase.accounts.some((a) => a.name === "subscriber"));
  assert.ok(idl.accounts.some((a) => a.name === "Subscription"));
  assert.ok(typeFields("Contract").includes("freelancer_fee_rate"));
  assert.ok(typeFields("FeeConfig").includes("subscription_mint"));
  assert.ok(REQUIRED_V2_INSTRUCTIONS.includes("purchase_subscription"));
  assert.equal(idl.address, "EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd");
  const client = read("lib/streampay-v2/instructions.ts");
  assert.equal((client.match(/employerSubscription: deriveSubscriptionPda\(employer, this\.program\.programId\)\.address/g) ?? []).length, 2);
  assert.equal((client.match(/freelancerSubscription: deriveSubscriptionPda\(params\.freelancer, this\.program\.programId\)\.address/g) ?? []).length, 2);
  assert.match(client, /if \(!raw\.feeBps && !raw\.freelancerFeeRate\)/);
  assert.doesNotMatch(client, /feeBps:\s*\d/);
  const a = deriveSubscriptionPda(makeContract().employer);
  const b = deriveSubscriptionPda(makeContract().employer);
  assert.equal(a.address.toBase58(), b.address.toBase58());
});

test("pricing UI: three plans, monthly/annual toggle, one subscription, network fees separate", () => {
  const labels = SUBSCRIPTION_PLANS.map((p) => [p.name, planPriceLabel(p, "Monthly"), planPriceLabel(p, "Annual"), p.feeLabel, p.audience]);
  assert.deepEqual(labels, [
    ["Free", "$0/month", "$0/month", "3% platform fee (current launch rate)", "For occasional users"],
    ["Pro", "$25/month", "$250/year", "1% platform fee", "For active professionals"],
    ["Premium", "$60/month", "$600/year", "0% PREMIFLOW platform fee", "For high-volume professionals"],
  ]);
  assert.equal(planDemoUsdtLabel(SUBSCRIPTION_PLANS[1], "Annual"), "Paid on Devnet as 250 Demo USDT per year");
  assert.equal(PRICING_COPY.annualNote, "Pay for 10 months. Get 12.");
  assert.equal(
    PRICING_COPY.intro,
    "One subscription applies to both hiring and working when using the subscribed wallet. There is no separate employer plan or freelancer plan."
  );
  const notes = PRICING_COPY.notes.join(" ");
  assert.match(notes, /network fees are separate/i);
  assert.match(notes, /No monthly volume cap/);
  assert.match(notes, /Not official USDT: a Devnet test token with no real value\./);
  const page = read("components/pricing/PricingPage.tsx");
  assert.match(page, /aria-label="Billing period"/);
  assert.match(page, /client\.purchaseSubscription\(\{ tier, term \}\)/);
  assert.doesNotMatch(page + JSON.stringify(PRICING_COPY), /Employer Pro|Freelancer Pro/);
  assert.ok(exists("app/pricing/page.tsx"));
  assert.match(read("lib/app/site-routes.ts"), /"\/pricing",/);
});

test("Why PREMIFLOW copy", () => {
  assert.equal(WHY_PREMIFLOW.heading, "One freelance marketplace. Four ways to get paid on Solana.");
  const text = JSON.stringify(WHY_PREMIFLOW);
  for (const needle of ["Fixed, Milestone, Streaming and Hourly", "Paid trials", "One account", "Transparent fees", "Protected funding and settlement", "Structured dispute evidence", "Neutral AI case summary", "Human final resolution", "never decides"]) {
    assert.ok(text.includes(needle), needle);
  }
});

test("Why Solana copy is concise and makes no throughput claims", () => {
  const text = WHY_SOLANA.points.join(" ");
  for (const needle of ["Fast settlement", "Low transaction costs", "Streaming and Hourly", "authorized by your wallet", "Verifiable settlement history", "Transparent contract state"]) {
    assert.ok(text.includes(needle), needle);
  }
  assert.doesNotMatch(text, /\bTPS\b|transactions per second|\d{3,}/i);
  assert.ok(WHY_SOLANA.points.length <= 6);
});

test("Why Web3 copy: used where it adds value; private data off-chain; no full-decentralization claim", () => {
  const text = WHY_WEB3.points.join(" ");
  assert.match(text, /funding, payment protection, settlement and verifiable contract actions/);
  assert.match(text, /Profiles, jobs, gigs, messaging, discovery and the Help Desk/);
  assert.match(text, /Private messages, support tickets and dispute evidence stay off-chain/);
  assert.match(text, /Not everything is decentralized/);
  assert.doesNotMatch(text, /fully decentralized|trustless/i);
});

test("competitor copy safety: generic traditional comparison, no superlatives or named platforms", () => {
  assert.equal(APPROACH.heading, "How PREMIFLOW approaches freelance work");
  assert.equal(APPROACH.columns.traditional, "Traditional freelance workflow");
  assert.equal(APPROACH.items.length, 12);
  const all = JSON.stringify([WHY_PREMIFLOW, WHY_SOLANA, WHY_WEB3, APPROACH, PRICING_COPY, SUBSCRIPTION_PLANS]);
  assert.doesNotMatch(all, /\b(first|only|best|cheapest|lowest|market leader|number one|unbeatable|guarantee\w*)\b/i);
  assert.ok(!all.includes("#1"));
  assert.doesNotMatch(all, /upwork|fiverr|freelancer\.com|toptal|peopleperhour|guru\.com|contra\b/i);
  assert.doesNotMatch(all, /all (other )?(competitors|platforms|marketplaces)|no other (platform|marketplace)/i);
  const about = read("components/about/AboutPage.tsx");
  for (const id of ["about-why-premiflow-heading", "about-approach-heading", "about-why-solana-heading", "about-why-web3-heading"]) {
    assert.ok(about.includes(id), id);
  }
  assert.match(about, /href="\/pricing"/);
});

test("subscription identity: entitlement is per wallet; no claim that linked wallets inherit a plan", () => {
  const copy = JSON.stringify([PRICING_COPY, SUBSCRIPTION_PLANS, WHY_PREMIFLOW, WHY_SOLANA, WHY_WEB3, APPROACH]);
  assert.match(copy, /when using the subscribed wallet/);
  assert.match(PRICING_COPY.notes.join(" "), /other wallets linked to your PREMIFLOW account do not share it/);
  assert.doesNotMatch(copy, /all (of )?your (linked )?wallets|every (linked )?wallet|across (all )?(your )?wallets|account-wide|covers your (whole )?account/i);
  assert.doesNotMatch(copy, /One subscription covers hiring and working\./);
  const hook = read("lib/hooks/useSubscriptionPlan.ts") + read("lib/hooks/useCreateFeeRates.ts");
  assert.match(hook, /fetchSubscriptionIfExists\(/);
  assert.doesNotMatch(hook, /linkedWallets|linked_wallets/);
});

test("freelancer fee: cumulative owed-minus-paid; many small withdrawals equal one withdrawal of the same total", () => {
  const bps = 300;
  let withdrawn = 0n;
  let paid = 0n;
  let naive = 0n;
  for (let i = 0; i < 30; i += 1) {
    const owed = feeOn(withdrawn + 33n, bps); // floor(total_withdrawn * bps / 10_000)
    const due = freelancerFeeDue(withdrawn, withdrawn + 33n, bps);
    assert.equal(due, owed - paid);
    naive += feeOn(33n, bps); // what independent per-withdrawal flooring would charge
    paid += due;
    withdrawn += 33n;
  }
  assert.equal(paid, feeOn(990n, bps));
  assert.deepEqual([paid, naive], [29n, 0n]);
  const rust = read("../programs/streampay/tests/platform_fee_v2.rs");
  assert.match(rust, /fn sym_many_small_withdrawals_match_single_cumulative_fee\(\)/);
});

test("create review rates mirror the program exactly, including 10-bps freelancer storage", () => {
  const rust = read("../programs/streampay/src/v2/fees.rs");
  for (const [name, value] of [
    ["DEFAULT_PLATFORM_FEE_BPS", DEFAULT_PLATFORM_FEE_BPS],
    ["PRO_FEE_BPS", PRO_FEE_BPS],
    ["PREMIUM_FEE_BPS", PREMIUM_FEE_BPS],
    ["FREELANCER_FEE_RATE_UNIT_BPS", FREELANCER_FEE_RATE_UNIT_BPS],
    ["MAX_FEE_BPS", MAX_FEE_BPS],
  ] as const) {
    assert.match(rust, new RegExp(`pub const ${name}: u16 = ${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, "_?")};`), name);
  }
  assert.equal(DEFAULT_PLATFORM_FEE_BPS, 300);
  // Launch config (fee_bps = 300): Free 3/3, Pro 1/1, Premium 0/0, mixed per participant.
  assert.deepEqual(createContractFeeRates({ baseFeeBps: 300, employerTier: "Free", freelancerTier: "Free" }), { employerFeeBps: 300, freelancerFeeBps: 300 });
  assert.deepEqual(createContractFeeRates({ baseFeeBps: 300, employerTier: "Pro", freelancerTier: "Premium" }), { employerFeeBps: 100, freelancerFeeBps: 0 });
  // No FeeConfig on-chain -> base 0 -> no fee on either side (program read_fee_bps).
  assert.deepEqual(createContractFeeRates({ baseFeeBps: 0, employerTier: "Free", freelancerTier: "Free" }), { employerFeeBps: 0, freelancerFeeBps: 0 });
  // Non-multiple-of-10 config: employer stored exactly, freelancer floored to 10-bps steps.
  assert.deepEqual(createContractFeeRates({ baseFeeBps: 255, employerTier: "Free", freelancerTier: "Free" }), { employerFeeBps: 255, freelancerFeeBps: 250 });
  assert.deepEqual(createContractFeeRates({ baseFeeBps: 80, employerTier: "Pro", freelancerTier: "Pro" }), { employerFeeBps: 80, freelancerFeeBps: 80 });
  assert.equal(freelancerFeeRateFor(5_000), 100, "capped at MAX_FEE_BPS");
  const hook = read("lib/app/create-fee-revalidation.ts");
  assert.match(hook, /program\.account\.feeConfig\.fetchNullable\(deriveFeeConfigPda\(program\.programId\)\.address\)/);
  assert.match(read("lib/hooks/useCreateFeeRates.ts"), /readAuthoritativeCreateFeeRates\(/);
  assert.match(read("lib/hooks/useCreateFeeRates.ts"), /status: "unavailable"/);
  assert.match(hook, /cfg \? Number\(cfg\.feeBps\) : 0/);
  assert.doesNotMatch(hook, /DEFAULT_PLATFORM_FEE_BPS|INTENDED_PLATFORM_FEE_BPS/);
});

test("legacy contracts keep freelancer fee 0 (never retroactive)", () => {
  for (const fields of [{}, { feeBps: 300, feeReserve: 3n * U }, { feeBps: 300, feeReserve: 3n * U, freelancerFeeBps: 0 }]) {
    const s = contractFeeSummary(makeContract({ totalAmount: HUNDRED, ...fields }));
    assert.deepEqual([s.freelancerFeeBps, s.freelancerFee, s.freelancerNet], [0, 0n, HUNDRED]);
  }
  const rust = read("../programs/streampay/src/v2/instructions/withdraw_freelancer.rs");
  assert.match(rust, /fees::freelancer_fee_due\(contract\.withdrawn_amount, new_withdrawn, freelancer_fee_bps\)/);
});
