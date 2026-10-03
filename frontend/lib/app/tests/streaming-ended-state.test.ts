import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  liveStreamContracts,
  roleAwareStatusLabel,
  roleAwareStatusLabelForWallets,
} from "../dashboard-offers";
import { contractCardNextHint } from "../dispute-ux";
import { presentContractStatus } from "../view-model";
import { availableActions } from "../../streampay-v2/actions";
import { makeContract, WALLET_A, WALLET_B } from "../../streampay-v2/tests/fixtures";

const START = 1_000;
const END = 2_000;
const BEFORE = 1_500;
const AFTER = 9_000;
const stream = (over: Parameters<typeof makeContract>[0] = {}) =>
  makeContract({
    paymentMode: "Streaming",
    status: "Active",
    startTime: START,
    endTime: END,
    durationSeconds: 1_000,
    mainAmount: 1_000n,
    totalAmount: 1_000n,
    releasedAmount: 0n,
    streamReleasedAmount: 0n,
    withdrawnAmount: 0n,
    ...over,
  });
const employer = (c: ReturnType<typeof stream>, now: number) =>
  availableActions({ wallet: WALLET_A, contract: c, now });
const freelancer = (c: ReturnType<typeof stream>, now: number) =>
  availableActions({ wallet: WALLET_B, contract: c, now });

test("card status: Active before end, Streaming ended at and after end, on-chain status unchanged", () => {
  const c = stream();
  assert.equal(presentContractStatus(c, BEFORE), "Active");
  assert.equal(roleAwareStatusLabelForWallets([WALLET_A], c, BEFORE), "Active");
  assert.equal(roleAwareStatusLabel(WALLET_B, c, BEFORE), "Active");
  for (const now of [END, AFTER]) {
    assert.equal(presentContractStatus(c, now), "Streaming ended");
    assert.equal(presentContractStatus(c, now, { compact: true }), "Ended");
    assert.equal(roleAwareStatusLabelForWallets([WALLET_A], c, now), "Streaming ended");
    assert.equal(roleAwareStatusLabelForWallets([WALLET_B], c, now), "Streaming ended");
    assert.equal(roleAwareStatusLabel(WALLET_A, c, now), "Streaming ended");
  }
  assert.equal(c.status, "Active");
  // Without a clock, helpers keep the on-chain label (backward compatible).
  assert.equal(roleAwareStatusLabelForWallets([WALLET_A], c), "Active");
  // Other modes are never relabelled.
  const fixed = makeContract({ paymentMode: "Fixed", status: "Active", startTime: START, endTime: END });
  assert.equal(presentContractStatus(fixed, AFTER), "Active");
});

test("live streams list drops ended streams; card hints never say watch the stream after end", () => {
  const c = stream();
  assert.deepEqual(liveStreamContracts([c], BEFORE), [c]);
  assert.deepEqual(liveStreamContracts([c], END), []);
  assert.deepEqual(liveStreamContracts([c], AFTER), []);
  assert.equal(contractCardNextHint("freelancer", c, BEFORE), "Next: watch the stream");
  assert.equal(contractCardNextHint("employer", c, BEFORE), "Next: watch the stream");
  for (const now of [END, AFTER]) {
    assert.equal(contractCardNextHint("freelancer", c, now), "Next: collect final pay");
    assert.equal(contractCardNextHint("employer", c, now), "Final payment awaiting freelancer collection");
  }
  const done = stream({ releasedAmount: 1_000n, streamReleasedAmount: 1_000n, withdrawnAmount: 1_000n });
  assert.equal(contractCardNextHint("employer", done, AFTER), "Stream ended: final pay collected");
  assert.equal(contractCardNextHint("freelancer", done, AFTER), "Stream ended: final pay collected");
});

test("employer actions: Cancel before end; no Cancel/Complete/Update earnings/approve at or after end", () => {
  const c = stream();
  const before = employer(c, BEFORE);
  assert.ok(before.includes("cancelActiveContract"));
  assert.ok(!before.includes("completeContract"));
  for (const now of [END, AFTER]) {
    const e = employer(c, now);
    for (const hidden of ["cancelActiveContract", "completeContract", "releaseStreamAccrual", "approveWorkUnit", "withdrawFreelancer"] as const) {
      assert.equal(e.includes(hidden), false, `${hidden} at ${now}`);
    }
  }
});

test("freelancer actions: Collect final pay and permissionless completion stay available after end", () => {
  const c = stream();
  const before = freelancer(c, BEFORE);
  assert.ok(!before.includes("completeContract"));
  assert.ok(!before.includes("cancelActiveContract"));
  for (const now of [END, AFTER]) {
    const f = freelancer(c, now);
    assert.ok(f.includes("withdrawFreelancer"));
    assert.ok(f.includes("releaseStreamAccrual"));
    assert.ok(f.includes("completeContract"));
    assert.ok(!f.includes("cancelActiveContract"));
  }
});

test("dispute remains available to both parties while anything is still contested", () => {
  // Before end something is contested, so Open dispute stays for both sides.
  const c = stream();
  assert.ok(employer(c, BEFORE).includes("openDispute"));
  assert.ok(freelancer(c, BEFORE).includes("openDispute"));
});

test("UI wiring: cards and overview pass the clock", () => {
  const card = readFileSync("components/contracts/ContractCard.tsx", "utf8");
  assert.match(card, /roleAwareStatusLabelForWallets\(accountWallets, contract, now\)/);
  assert.match(card, /useNow\(30_000\)/);
  const overview = readFileSync("components/overview/OverviewPage.tsx", "utf8");
  assert.match(overview, /liveStreamContracts\(grouped\.all, now\)/);
  assert.match(overview, /roleAwareStatusLabelForWallets\(accountWallets, c, now\)/);
  assert.doesNotMatch(overview, /roleAwareStatusLabelForWallets\(accountWallets, c\)/);
  const activity = readFileSync("components/activity/ActivityPage.tsx", "utf8");
  assert.match(activity, /roleAwareStatusLabelForWallets\(accountWallets, contract, now\)/);
});
