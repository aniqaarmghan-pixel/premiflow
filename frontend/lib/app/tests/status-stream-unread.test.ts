import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { WALLET_A, WALLET_B, makeContract } from "@/lib/streampay-v2/tests/fixtures";
import { ROLE_AWARE_STATUS_COPY, roleAwareStatusLabel } from "@/lib/app/dashboard-offers";
import { streamingTrialIncludedNote } from "@/lib/app/stream-display";
import { presentStatus, streamingDashboard } from "@/lib/app/view-model";
import {
  unreadMessageAriaLabel,
  unreadMessageBadgeLabel,
  unreadMessageCountsByContract,
} from "@/lib/app/contract-unread";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const between = (src: string, start: string, end: string) => {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `missing ${start}`);
  const j = src.indexOf(end, i + start.length);
  assert.ok(j > i, `missing ${end}`);
  return src.slice(i, j);
};

// #5 role-aware status labels
test("role-aware status: offer wording per party, status values unchanged", () => {
  const offer = makeContract({ status: "PendingAcceptance", employer: WALLET_A, freelancer: WALLET_B });
  assert.equal(roleAwareStatusLabel(WALLET_B, offer), ROLE_AWARE_STATUS_COPY.freelancerOffer);
  assert.equal(roleAwareStatusLabel(WALLET_A, offer), ROLE_AWARE_STATUS_COPY.employerOffer);
  assert.equal(offer.status, "PendingAcceptance");
  const active = makeContract({ status: "Active", employer: WALLET_A, freelancer: WALLET_B });
  assert.equal(roleAwareStatusLabel(WALLET_B, active), presentStatus("Active"));
});

test("Activity page and assistant use roleAwareStatusLabel", () => {
  const activity = read("components/activity/ActivityPage.tsx");
  assert.match(activity, /roleAwareStatusLabel\(publicKey, contract\)/);
  assert.doesNotMatch(activity, /presentStatus\(/);
  const assistant = read("components/copilot/FloatingAssistant.tsx");
  assert.match(assistant, /statusLabel: roleAwareStatusLabel\(publicKey, contract\)/);
  assert.doesNotMatch(assistant, /presentStatus\(contract\.status\)/);
});

// #10 trial streaming display consistency
test("streaming display: Active earned = trial released + stream estimate", () => {
  const contract = makeContract({
    paymentMode: "Streaming",
    status: "Active",
    startTime: 1_000,
    endTime: 4_600,
    durationSeconds: 3_600,
    mainAmount: 360n,
    totalAmount: 370n,
    trialAmount: 10n,
    releasedAmount: 100n,
    streamReleasedAmount: 90n,
    withdrawnAmount: 40n,
    refundedAmount: 0n,
  });
  const dash = streamingDashboard(contract, 2_800);
  assert.equal(dash.earnedSoFar, 180n);
  assert.equal(dash.trialPaid, 10n);
  assert.equal(dash.displayEarned, 190n);
  assert.ok(dash.displayEarned >= dash.alreadyRecorded);
});

test("streaming display: settled keeps the on-chain figure", () => {
  const contract = makeContract({
    paymentMode: "Streaming",
    status: "Completed",
    startTime: 1_000,
    endTime: 4_600,
    durationSeconds: 3_600,
    mainAmount: 360n,
    trialAmount: 10n,
    totalAmount: 370n,
    releasedAmount: 370n,
    streamReleasedAmount: 360n,
    freelancerSettlementAmount: 370n,
    terminatedAt: 5_000,
  });
  const dash = streamingDashboard(contract, 9_000);
  assert.equal(dash.displayEarned, 370n);
  assert.equal(dash.displayEarned, dash.earnedSoFar);
  assert.equal(dash.trialPaid, 10n);
});

test("streaming display: no trial means no trial note amount", () => {
  const contract = makeContract({
    paymentMode: "Streaming",
    status: "Active",
    startTime: 1_000,
    endTime: 4_600,
    durationSeconds: 3_600,
    mainAmount: 360n,
    totalAmount: 360n,
    releasedAmount: 90n,
    streamReleasedAmount: 90n,
  });
  const dash = streamingDashboard(contract, 2_800);
  assert.equal(dash.trialPaid, 0n);
  assert.equal(dash.displayEarned, dash.earnedSoFar);
  assert.match(streamingTrialIncludedNote("10 USDC"), /Includes trial pay of 10 USDC/);
});

test("StreamShowcase hero and Earned tile use displayEarned with a trial note", () => {
  const src = read("components/contracts/StreamShowcase.tsx");
  assert.equal(src.split("amount(dash.displayEarned)").length - 1, 2);
  assert.doesNotMatch(src, /amount\(dash\.earnedSoFar\)/);
  assert.match(src, /dash\.trialPaid > 0n \?/);
  assert.match(src, /streamingTrialIncludedNote\(amount\(dash\.trialPaid\)\)/);
  assert.match(src, /streamingEarnedLabel\(dash\.earnedBasis\)/);
});

// #12 unread message dots on /contracts
test("unread message counts group unread message_received by contract", () => {
  const counts = unreadMessageCountsByContract([
    { type: "message_received", readAt: null, contractAddress: "AAA" },
    { type: "message_received", readAt: null, contractAddress: "AAA" },
    { type: "message_received", readAt: "2026-09-28T00:00:00.000Z", contractAddress: "AAA" },
    { type: "work_submitted", readAt: null, contractAddress: "AAA" },
    { type: "message_received", readAt: null, contractAddress: "BBB" },
    { type: "message_received", readAt: null, contractAddress: null, href: null },
  ]);
  assert.deepEqual(counts, { AAA: 2, BBB: 1 });
  assert.equal(unreadMessageBadgeLabel(3), "3");
  assert.equal(unreadMessageBadgeLabel(12), "9+");
  assert.equal(unreadMessageAriaLabel(1), "1 unread message");
  assert.equal(unreadMessageAriaLabel(4), "4 unread messages");
});

test("/contracts list passes unread counts to ContractCard badge", () => {
  const page = read("components/contracts/ContractsPage.tsx");
  assert.match(page, /useUnreadMessageCounts\(publicKey \? publicKey\.toBase58\(\) : null\)/);
  assert.match(page, /unreadMessages=\{unreadCounts\[contract\.address\.toBase58\(\)\] \?\? 0\}/);
  const card = read("components/contracts/ContractCard.tsx");
  assert.match(card, /unreadMessages > 0 \?/);
  assert.match(card, /unreadMessageBadgeLabel\(unreadMessages\)/);
  assert.match(card, /aria-label=\{unreadMessageAriaLabel\(unreadMessages\)\}/);
  assert.match(card, /label=\{roleAwareStatusLabel\(publicKey, contract\)\}/);
  const hook = read("lib/hooks/useUnreadMessageCounts.ts");
  assert.match(hook, /fetchNotifications\(\{ limit: 50 \}\)/);
  assert.match(hook, /\.catch\(/);
});

// Unlocked: CreateWizard offer notification
test("CreateWizard notifies the freelancer only when setup completes as PendingAcceptance", () => {
  const src = read("components/create/CreateWizard.tsx");
  assert.match(src, /import \{ requestOfferLifecycleNotification \} from "@\/lib\/app\/lifecycle-notifications-client";/);
  const runSetup = between(src, "async function runSetup", "function finishSetup");
  assert.doesNotMatch(runSetup, /requestOfferLifecycleNotification/);
  const finish = between(src, "function finishSetup", "function reportUnexpected");
  assert.match(finish, /if \(progress\.status === "PendingAcceptance"\) \{/);
  assert.match(
    finish,
    /void requestOfferLifecycleNotification\(progress\.contractAddress, "contract_offer_received"\);/
  );
  assert.equal(src.split("requestOfferLifecycleNotification(").length - 1, 1);
});

// Unlocked: one-click Collect
test("withdrawFreelancer can prepend releaseStreamAccrual in the same transaction", () => {
  const src = read("lib/streampay-v2/instructions.ts");
  const body = between(src, "async withdrawFreelancer(", "async claimEmployerRefund(");
  assert.match(body, /releaseAccrualFirst\?: boolean;/);
  assert.match(body, /params\.releaseAccrualFirst\s*\?\s*withdraw\.preInstructions\(\[/);
  assert.match(body, /\.releaseStreamAccrual\(\)\s*\.accountsPartial\(\{ caller: freelancer, contract: params\.contract \}\)\s*\.instruction\(\)/);
  assert.ok(body.indexOf(".releaseStreamAccrual()") < body.indexOf("base.preInstructions([ataCreate])"));
  assert.match(body, /ataCreate \? base\.preInstructions\(\[ataCreate\]\) : base/);
  const detail = read("components/contracts/ContractDetail.tsx");
  const call = between(detail, 'case "withdrawFreelancer":', 'case "claimEmployerRefund":');
  assert.match(call, /contract\.paymentMode === "Streaming" &&/);
  assert.match(call, /contract\.status === "Active" &&/);
  assert.match(call, /actions\.includes\("releaseStreamAccrual"\)/);
  assert.match(detail, /onCollect=\{\(\) => requestAction\("withdrawFreelancer"\)\}/);
});

// Unlocked: TransactionStatus signature link
test("TransactionStatus signature links to the transaction explorer page", () => {
  const src = read("components/ui/TransactionStatus.tsx");
  assert.match(src, /<Address value=\{state\.signature\} label="Signature" href=\{explorerTxUrl\(state\.signature\)\} \/>/);
  assert.doesNotMatch(src, /<Address value=\{state\.signature\} label="Signature" \/>/);
  const address = read("components/ui/Address.tsx");
  assert.match(address, /href=\{href \?\? explorerAddressUrl\(value\)\}/);
  const network = read("lib/network.ts");
  assert.match(network, /export function explorerTxUrl/);
});
