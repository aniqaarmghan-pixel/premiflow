import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { WALLET_A, WALLET_B, makeContract } from "@/lib/streampay-v2/tests/fixtures";
import type { UiAction } from "@/lib/streampay-v2/actions";
import { contractCardNextHint } from "@/lib/app/dispute-ux";
import {
  BOTH_PARTIES_CARD_LABEL,
  actionRequiredItems,
  viewerPartyRole,
  withSameWalletOfferActions,
} from "@/lib/app/dashboard-offers";
import {
  lifecycleNotificationForAction,
  lifecycleNotificationPath,
  requestOfferLifecycleNotification,
} from "@/lib/app/lifecycle-notifications-client";
import { streamingDashboard } from "@/lib/app/view-model";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const DEADLINE = 10_000;

test("contract card hint: expired offer never says accept", () => {
  const offer = makeContract({ status: "PendingAcceptance", acceptanceDeadline: DEADLINE });
  assert.equal(contractCardNextHint("freelancer", offer, DEADLINE - 1), "Next: accept or decline");
  assert.equal(contractCardNextHint("freelancer", offer, DEADLINE), "Offer expired: decline to close it");
  assert.equal(contractCardNextHint("employer", offer, DEADLINE + 5), "Offer expired: expire it to reclaim funds");
  const draft = makeContract({ status: "Draft", paymentMode: "Milestone", acceptanceDeadline: DEADLINE });
  assert.equal(
    contractCardNextHint("employer", draft, DEADLINE),
    "Setup deadline passed: expire the draft to reclaim funds"
  );
});

test("same wallet on both sides: role both and freelancer response restored", () => {
  const self = makeContract({
    status: "PendingAcceptance",
    employer: WALLET_A,
    freelancer: WALLET_A,
    acceptanceDeadline: DEADLINE,
  });
  assert.equal(viewerPartyRole(WALLET_A, self), "both");
  assert.equal(viewerPartyRole(WALLET_B, self), "none");
  assert.equal(viewerPartyRole(null, self), "none");
  assert.match(BOTH_PARTIES_CARD_LABEL, /both employer and freelancer/);
  const base: UiAction[] = [];
  const before = withSameWalletOfferActions(base, WALLET_A, self, DEADLINE - 1);
  assert.ok(before.includes("acceptContract") && before.includes("declineContract"));
  const after = withSameWalletOfferActions(["expireAcceptance"], WALLET_A, self, DEADLINE);
  assert.deepEqual(after.sort(), ["declineContract", "expireAcceptance"]);
  const normal = makeContract({ status: "PendingAcceptance", acceptanceDeadline: DEADLINE });
  assert.deepEqual(withSameWalletOfferActions(base, WALLET_A, normal, DEADLINE - 1), []);
  const active = makeContract({ status: "Active", employer: WALLET_A, freelancer: WALLET_A });
  assert.deepEqual(withSameWalletOfferActions(base, WALLET_A, active, 0), []);
});

test("expired Milestone draft stays in Action required with an expire note", () => {
  const draft = makeContract({
    status: "Draft",
    paymentMode: "Milestone",
    employer: WALLET_A,
    freelancer: WALLET_B,
    acceptanceDeadline: DEADLINE,
  });
  const [item] = actionRequiredItems(WALLET_A, [draft], DEADLINE + 1);
  assert.equal(item?.kind, "expiredDraft");
  assert.match(item?.note ?? "", /expire this draft/);
  assert.equal(actionRequiredItems(WALLET_A, [draft], DEADLINE - 1)[0]?.kind, "finishSetup");
  assert.deepEqual(actionRequiredItems(WALLET_B, [draft], DEADLINE + 1), []);
});

test("resolution center streaming fact is status-aware (Disputed does not extrapolate)", () => {
  const disputed = makeContract({
    paymentMode: "Streaming",
    status: "Disputed",
    startTime: 1_000,
    endTime: 2_000,
    mainAmount: 1_000n,
    disputedAt: 1_500,
  });
  const early = streamingDashboard(disputed, 1_600);
  const late = streamingDashboard(disputed, 1_900);
  assert.equal(early.earnedSoFar, late.earnedSoFar);
  assert.equal(early.live, false);
  const src = read("lib/app/resolution-center.ts");
  assert.match(src, /streamingDashboard\(contract, now\)\.earnedSoFar/);
  assert.doesNotMatch(src, /estimatedStreamAccrualForContract/);
});

test("lifecycle notification client: mapping, retry on 409, never throws", async () => {
  assert.equal(lifecycleNotificationForAction("acceptContract"), "offer_accepted");
  assert.equal(lifecycleNotificationForAction("approveActivation"), "contract_activated");
  assert.equal(lifecycleNotificationForAction("approveTrialAndActivate"), "contract_activated");
  assert.equal(lifecycleNotificationForAction("declineContract"), null);
  assert.equal(lifecycleNotificationPath("abc"), "/api/contracts/abc/lifecycle-notifications");
  const calls: { url: string; body: string }[] = [];
  const statuses = [409, 409, 201];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body) });
    const status = statuses.shift() ?? 500;
    return { ok: status < 300, status } as Response;
  }) as unknown as typeof fetch;
  assert.equal(await requestOfferLifecycleNotification("abc", "offer_accepted", { fetchImpl, delayMs: 0 }), true);
  assert.equal(calls.length, 3);
  assert.deepEqual(JSON.parse(calls[0].body), { kind: "offer_accepted" });
  const forbidden = (async () => ({ ok: false, status: 403 }) as Response) as unknown as typeof fetch;
  assert.equal(await requestOfferLifecycleNotification("abc", "offer_accepted", { fetchImpl: forbidden, delayMs: 0 }), false);
  const broken = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  assert.equal(await requestOfferLifecycleNotification("abc", "contract_activated", { fetchImpl: broken, delayMs: 0 }), false);
});

test("ContractDetail triggers lifecycle notifications only after confirmed tx, never on load", () => {
  const src = read("components/contracts/ContractDetail.tsx");
  const okIdx = src.indexOf("    if (ok) {");
  const trigger = src.indexOf("lifecycleNotificationForAction(action)");
  assert.ok(okIdx > 0 && trigger > okIdx && trigger - okIdx < 400);
  assert.doesNotMatch(src, /contract_offer_received/);
  assert.match(src, /withSameWalletOfferActions\(/);
  const card = read("components/contracts/ContractCard.tsx");
  assert.match(
    card,
    /roleAwareStatusLabelForWallets\(accountWallets, contract\)/
  );
  assert.doesNotMatch(card, /if \(!publicKey\) return null;/);
  assert.match(card, /BOTH_PARTIES_CARD_LABEL/);
});
