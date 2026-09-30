import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";

import { availableActions } from "../../streampay-v2/actions";
import { makeContract, WALLET_A, WALLET_B, WALLET_C } from "../../streampay-v2/tests/fixtures";
import type { ContractStatus } from "../../streampay-v2/types";
import {
  ACTION_REQUIRED_COPY,
  OFFER_SECTIONS_COPY,
  ROLE_AWARE_STATUS_COPY,
  ROLE_TOTAL_LABELS,
  actionRequiredItems,
  isPendingOffer,
  liveStreamContracts,
  offerItemCopy,
  offerSections,
  roleAwareStatusLabel,
} from "../dashboard-offers";
import {
  dashboardSummary,
  groupContractsByRole,
  presentStatus,
  roleForContract,
} from "../view-model";

const OVERVIEW = readFileSync(
  new URL("../../../components/overview/OverviewPage.tsx", import.meta.url),
  "utf8"
);
const CONTRACT_CARD = readFileSync(
  new URL("../../../components/contracts/ContractCard.tsx", import.meta.url),
  "utf8"
);

const ADDR_1 = new PublicKey("SysvarC1ock11111111111111111111111111111111");
const ADDR_2 = new PublicKey("Stake11111111111111111111111111111111111111");
const ADDR_3 = new PublicKey("Vote111111111111111111111111111111111111111");
const ADDRS = [ADDR_1, ADDR_2, ADDR_3, WALLET_C];
const MODES = ["Fixed", "Milestone", "Streaming", "Hourly"] as const;
// Fixture acceptanceDeadline is 2_000_000_000.
const BEFORE_DEADLINE = 1_800_000_000;
const AFTER_DEADLINE = 2_000_000_000;
const EXPIRED = "Expired \u2014 decline only";
const fmt = (seconds: number) => `T${seconds}`;

function pendingOffer(overrides: Parameters<typeof makeContract>[0] = {}) {
  return makeContract({ status: "PendingAcceptance", acceptedAt: 0, ...overrides });
}

test("freelancer card: Offers awaiting your response with employer, amount, deadline and Review offer", () => {
  const offer = pendingOffer({ employer: WALLET_A, freelancer: WALLET_B });
  const sections = offerSections(WALLET_B, [offer], BEFORE_DEADLINE);
  assert.equal(sections.waitingForFreelancer.length, 0);
  assert.equal(sections.awaitingYourResponse.length, 1);
  const [item] = sections.awaitingYourResponse;
  assert.equal(item.mode, "Fixed");
  assert.equal(item.counterpartyRole, "employer");
  assert.equal(item.counterpartyAddress, WALLET_A.toBase58());
  assert.equal(item.totalAmount, 100n);
  assert.equal(item.tokenMint, offer.tokenMint.toBase58());
  assert.equal(item.acceptanceDeadline, 2_000_000_000);
  assert.equal(item.deadlinePassed, false);
  const copy = offerItemCopy(item, fmt);
  assert.equal(OFFER_SECTIONS_COPY.awaitingTitle, "Offers awaiting your response");
  assert.equal(OFFER_SECTIONS_COPY.deadlineLabel, "Acceptance deadline");
  assert.equal(copy.actionLabel, "Review offer");
  assert.equal(copy.counterpartyLabel, "Employer");
  assert.equal(copy.statusLabel, "Awaiting your response");
  assert.equal(copy.deadlineText, "T2000000000");
  assert.equal(copy.deadlineNote, "Respond by T2000000000");
});

test("expired freelancer offer reads exactly 'Expired \u2014 decline only' and never implies Accept", () => {
  const offer = pendingOffer({ employer: WALLET_A, freelancer: WALLET_B });
  const [item] = offerSections(WALLET_B, [offer], AFTER_DEADLINE).awaitingYourResponse;
  assert.equal(item.deadlinePassed, true);
  const copy = offerItemCopy(item, fmt);
  assert.equal(copy.statusLabel, EXPIRED);
  assert.equal(OFFER_SECTIONS_COPY.expiredFreelancerStatus, EXPIRED);
  assert.equal(copy.actionLabel, "Review offer");
  assert.match(copy.deadlineNote, /only be declined/);
  const visible = [
    OFFER_SECTIONS_COPY.awaitingTitle,
    OFFER_SECTIONS_COPY.awaitingBody,
    copy.statusLabel,
    copy.deadlineNote,
    copy.actionLabel,
  ].join(" | ");
  assert.doesNotMatch(visible, /\baccept\b|accept or decline/i);
  const actions = availableActions({ wallet: WALLET_B, contract: offer, now: AFTER_DEADLINE });
  assert.ok(!actions.includes("acceptContract"));
  assert.ok(actions.includes("declineContract"));
  const open = availableActions({ wallet: WALLET_B, contract: offer, now: BEFORE_DEADLINE });
  assert.ok(open.includes("acceptContract"));
});

test("employer card: Offers waiting for freelancer, View offer, no action implied, still in Hiring", () => {
  const offer = pendingOffer({ employer: WALLET_A, freelancer: WALLET_B });
  const sections = offerSections(WALLET_A, [offer], BEFORE_DEADLINE);
  assert.equal(sections.awaitingYourResponse.length, 0);
  assert.equal(sections.waitingForFreelancer.length, 1);
  const [item] = sections.waitingForFreelancer;
  assert.equal(item.counterpartyRole, "freelancer");
  assert.equal(item.counterpartyAddress, WALLET_B.toBase58());
  assert.equal(item.totalAmount, 100n);
  const copy = offerItemCopy(item, fmt);
  assert.equal(OFFER_SECTIONS_COPY.waitingTitle, "Offers waiting for freelancer");
  assert.equal(copy.actionLabel, "View offer");
  assert.equal(copy.counterpartyLabel, "Freelancer");
  assert.equal(copy.statusLabel, "Waiting for freelancer");
  assert.equal(copy.deadlineText, "T2000000000");
  assert.equal(copy.deadlineNote, "The freelancer can accept until T2000000000");
  const expired = offerItemCopy(
    offerSections(WALLET_A, [offer], AFTER_DEADLINE).waitingForFreelancer[0],
    fmt
  );
  const employerCopy = [
    OFFER_SECTIONS_COPY.waitingTitle,
    OFFER_SECTIONS_COPY.waitingBody,
    copy.statusLabel,
    copy.deadlineNote,
    copy.actionLabel,
    expired.statusLabel,
    expired.deadlineNote,
  ].join(" | ");
  assert.doesNotMatch(
    employerCopy,
    /you (need|must|should)|action required|respond|review offer|approve|accept or decline/i
  );
  const grouped = groupContractsByRole(WALLET_A, [offer]);
  assert.equal(grouped.hiring.length, 1);
  assert.equal(dashboardSummary(WALLET_A, grouped).hiring, 1);
});

test("PendingAcceptance is never counted as Active", () => {
  const offers = MODES.map((mode, i) => pendingOffer({ paymentMode: mode, address: ADDRS[i] }));
  const summary = dashboardSummary(WALLET_A, groupContractsByRole(WALLET_A, offers));
  assert.equal(summary.active, 0);
  assert.equal(summary.hiring, 4);
  const active = makeContract({ status: "Active", address: ADDR_1 });
  const withActive = dashboardSummary(
    WALLET_A,
    groupContractsByRole(WALLET_A, [...offers.slice(1), active])
  );
  assert.equal(withActive.active, 1);
});

test("Streaming PendingAcceptance is not counted as a live stream", () => {
  const pendingStream = pendingOffer({ paymentMode: "Streaming", address: ADDR_1 });
  const liveStream = makeContract({ paymentMode: "Streaming", status: "Active", address: ADDR_2 });
  assert.deepEqual(liveStreamContracts([pendingStream]), []);
  assert.equal(
    dashboardSummary(WALLET_A, groupContractsByRole(WALLET_A, [pendingStream])).streamingActive,
    0
  );
  assert.deepEqual(liveStreamContracts([pendingStream, liveStream]), [liveStream]);
  assert.equal(
    dashboardSummary(WALLET_A, groupContractsByRole(WALLET_A, [pendingStream, liveStream]))
      .streamingActive,
    1
  );
  assert.match(OVERVIEW, /liveStreamContracts\(grouped\.all\)/);
});

test("all four modes are classified the same way", () => {
  for (const mode of MODES) {
    const offer = pendingOffer({ paymentMode: mode, employer: WALLET_A, freelancer: WALLET_B });
    assert.equal(isPendingOffer(offer), true, mode);
    const asFreelancer = offerSections(WALLET_B, [offer], BEFORE_DEADLINE);
    assert.equal(asFreelancer.awaitingYourResponse.length, 1, mode);
    assert.equal(asFreelancer.awaitingYourResponse[0].mode, mode);
    assert.equal(asFreelancer.waitingForFreelancer.length, 0, mode);
    const asEmployer = offerSections(WALLET_A, [offer], BEFORE_DEADLINE);
    assert.equal(asEmployer.waitingForFreelancer.length, 1, mode);
    assert.equal(asEmployer.awaitingYourResponse.length, 0, mode);
    const expired = offerSections(WALLET_B, [offer], AFTER_DEADLINE).awaitingYourResponse[0];
    assert.equal(offerItemCopy(expired, fmt).statusLabel, EXPIRED, mode);
    assert.equal(roleAwareStatusLabel(WALLET_B, offer), ROLE_AWARE_STATUS_COPY.freelancerOffer);
    assert.equal(roleAwareStatusLabel(WALLET_A, offer), ROLE_AWARE_STATUS_COPY.employerOffer);
    assert.equal(offerSections(WALLET_C, [offer], BEFORE_DEADLINE).awaitingYourResponse.length, 0);
    const active = makeContract({ paymentMode: mode, status: "Active" });
    const none = offerSections(WALLET_B, [active], BEFORE_DEADLINE);
    assert.equal(none.awaitingYourResponse.length + none.waitingForFreelancer.length, 0, mode);
  }
});

test("mixed-role wallet gets the correct section per contract", () => {
  const hiringOffer = pendingOffer({ employer: WALLET_A, freelancer: WALLET_B, address: ADDR_1 });
  const workingOffer = pendingOffer({
    employer: WALLET_C,
    freelancer: WALLET_A,
    address: ADDR_2,
    paymentMode: "Hourly",
  });
  const activeHiring = makeContract({ employer: WALLET_A, freelancer: WALLET_C, address: ADDR_3 });
  const sections = offerSections(WALLET_A, [hiringOffer, workingOffer, activeHiring], BEFORE_DEADLINE);
  assert.deepEqual(
    sections.awaitingYourResponse.map((i) => i.address),
    [ADDR_2.toBase58()]
  );
  assert.equal(sections.awaitingYourResponse[0].counterpartyAddress, WALLET_C.toBase58());
  assert.deepEqual(
    sections.waitingForFreelancer.map((i) => i.address),
    [ADDR_1.toBase58()]
  );
  assert.equal(offerSections(null, [hiringOffer, workingOffer], BEFORE_DEADLINE).awaitingYourResponse.length, 0);
});

test("same wallet as both parties: offer is listed for the freelancer with Review offer visible", () => {
  const selfOffer = pendingOffer({ employer: WALLET_A, freelancer: WALLET_A });
  const sections = offerSections(WALLET_A, [selfOffer], BEFORE_DEADLINE);
  assert.equal(sections.awaitingYourResponse.length, 1);
  assert.equal(sections.waitingForFreelancer.length, 0);
  const copy = offerItemCopy(sections.awaitingYourResponse[0], fmt);
  assert.equal(copy.actionLabel, "Review offer");
  assert.equal(copy.statusLabel, "Awaiting your response");
  assert.equal(roleAwareStatusLabel(WALLET_A, selfOffer), ROLE_AWARE_STATUS_COPY.freelancerOffer);
  // roleForContract itself is unchanged (employer first) for every other caller.
  assert.equal(roleForContract(WALLET_A, selfOffer), "employer");
  assert.doesNotMatch(OVERVIEW, /roleForContract/);
});

test("every home item links to /contracts/<address>", () => {
  const hiring = pendingOffer({ employer: WALLET_A, freelancer: WALLET_B, address: ADDR_1 });
  const working = pendingOffer({ employer: WALLET_C, freelancer: WALLET_A, address: ADDR_2 });
  const approval = makeContract({
    status: "PendingEmployerApproval",
    employer: WALLET_A,
    freelancer: WALLET_B,
    address: ADDR_3,
  });
  const sections = offerSections(WALLET_A, [hiring, working], BEFORE_DEADLINE);
  const actions = actionRequiredItems(WALLET_A, [approval], BEFORE_DEADLINE);
  const all = [...sections.awaitingYourResponse, ...sections.waitingForFreelancer, ...actions];
  assert.equal(all.length, 3);
  for (const item of all) assert.equal(item.href, `/contracts/${item.address}`);
  assert.equal(sections.awaitingYourResponse[0].href, `/contracts/${ADDR_2.toBase58()}`);
  assert.equal(sections.waitingForFreelancer[0].href, `/contracts/${ADDR_1.toBase58()}`);
  assert.equal(actions[0].href, `/contracts/${ADDR_3.toBase58()}`);
  assert.equal((OVERVIEW.match(/href=\{item\.href\}/g) ?? []).length, 2);
});

test("Working/Hiring tiles are labelled as totals and keep their semantics", () => {
  assert.equal(ROLE_TOTAL_LABELS.hiring, "Hiring \u2014 total contracts");
  assert.equal(ROLE_TOTAL_LABELS.working, "Working \u2014 total contracts");
  assert.match(ROLE_TOTAL_LABELS.note, /completed, cancelled, declined and expired/);
  assert.match(OVERVIEW, /label=\{ROLE_TOTAL_LABELS\.hiring\}\s+value=\{String\(summary\.hiring\)\}/);
  assert.match(OVERVIEW, /label=\{ROLE_TOTAL_LABELS\.working\}\s+value=\{String\(summary\.working\)\}/);
  assert.match(OVERVIEW, /\{ROLE_TOTAL_LABELS\.note\}/);
  assert.doesNotMatch(OVERVIEW, /label="(Hiring|Working)"/);
  const closedStatuses = ["Completed", "Cancelled", "Declined", "Expired"] as const;
  const closed = closedStatuses.map((status, i) =>
    makeContract({ status, paymentMode: "Streaming", address: ADDRS[i] })
  );
  const grouped = groupContractsByRole(WALLET_A, closed);
  const summary = dashboardSummary(WALLET_A, grouped);
  // Semantics unchanged: totals still include history, but none of it is current work.
  assert.equal(summary.hiring, 4);
  assert.equal(summary.hiring, grouped.hiring.length);
  assert.equal(summary.active, 0);
  assert.equal(summary.streamingActive, 0);
  assert.deepEqual(liveStreamContracts(closed), []);
  assert.equal(offerSections(WALLET_A, closed, BEFORE_DEADLINE).waitingForFreelancer.length, 0);
  assert.deepEqual(actionRequiredItems(WALLET_A, closed, BEFORE_DEADLINE), []);
});

test("Action required: employer Milestone Draft setup and activation review only", () => {
  const draft = makeContract({
    status: "Draft",
    paymentMode: "Milestone",
    employer: WALLET_A,
    freelancer: WALLET_B,
    address: ADDR_1,
  });
  const approval = makeContract({
    status: "PendingEmployerApproval",
    paymentMode: "Hourly",
    employer: WALLET_A,
    freelancer: WALLET_B,
    address: ADDR_2,
  });
  const fixedDraft = makeContract({ status: "Draft", paymentMode: "Fixed", employer: WALLET_A, address: ADDR_3 });
  const items = actionRequiredItems(WALLET_A, [draft, approval, fixedDraft], BEFORE_DEADLINE);
  assert.deepEqual(
    items.map((i) => [i.address, i.kind, i.note, i.actionLabel]),
    [
      [ADDR_1.toBase58(), "finishSetup", "Finish setup: add milestones and lock terms", "Open contract"],
      [ADDR_2.toBase58(), "reviewActivation", "Review activation", "Open contract"],
    ]
  );
  assert.equal(items[0].freelancerAddress, WALLET_B.toBase58());
  assert.equal(items[1].mode, "Hourly");
  assert.equal(ACTION_REQUIRED_COPY.title, "Action required");
  // Mirrors availableActions; no action/transaction logic is changed.
  const draftActions = availableActions({ wallet: WALLET_A, contract: draft, now: BEFORE_DEADLINE });
  assert.ok(draftActions.includes("addMilestone") && draftActions.includes("finalizeTerms"));
  assert.ok(
    availableActions({ wallet: WALLET_A, contract: approval, now: BEFORE_DEADLINE }).includes(
      "rejectActivation"
    )
  );
  assert.deepEqual(
    actionRequiredItems(WALLET_A, [draft], AFTER_DEADLINE).map((item) => [item.kind, item.note]),
    [["expiredDraft", "Setup deadline passed: expire this draft to reclaim funds"]]
  );
  assert.ok(
    !availableActions({ wallet: WALLET_A, contract: draft, now: AFTER_DEADLINE }).includes("addMilestone")
  );
  assert.deepEqual(actionRequiredItems(WALLET_B, [draft, approval], BEFORE_DEADLINE), []);
  assert.deepEqual(actionRequiredItems(WALLET_C, [draft, approval], BEFORE_DEADLINE), []);
  assert.deepEqual(actionRequiredItems(null, [draft, approval], BEFORE_DEADLINE), []);
  assert.deepEqual(actionRequiredItems(WALLET_A, [pendingOffer({ address: ADDR_3 })], BEFORE_DEADLINE), []);
  assert.match(
    OVERVIEW,
    /actionRequiredItemsForWallets\(accountWallets, grouped\.all, now\)/
  );
  assert.match(OVERVIEW, /ACTION_REQUIRED_COPY\.title/);
  assert.match(OVERVIEW, /\{item\.note\}/);
});

test("role-aware PendingAcceptance wording leaves presentStatus unchanged", () => {
  const offer = pendingOffer({ employer: WALLET_A, freelancer: WALLET_B });
  assert.deepEqual(ROLE_AWARE_STATUS_COPY, {
    freelancerOffer: "Offer awaiting your response",
    employerOffer: "Waiting for freelancer",
  });
  assert.equal(roleAwareStatusLabel(WALLET_B, offer), "Offer awaiting your response");
  assert.equal(roleAwareStatusLabel(WALLET_A, offer), "Waiting for freelancer");
  assert.equal(roleAwareStatusLabel(WALLET_C, offer), presentStatus("PendingAcceptance"));
  assert.equal(roleAwareStatusLabel(null, offer), presentStatus("PendingAcceptance"));
  assert.equal(presentStatus("PendingAcceptance"), "Pending freelancer acceptance");
  const others: ContractStatus[] = [
    "Draft",
    "PendingEmployerApproval",
    "Active",
    "Completed",
    "Declined",
    "Expired",
    "Cancelled",
    "ActivationRejected",
    "Disputed",
    "Resolved",
  ];
  for (const status of others) {
    const contract = makeContract({ status, employer: WALLET_A, freelancer: WALLET_B });
    assert.equal(roleAwareStatusLabel(WALLET_A, contract), presentStatus(status), status);
    assert.equal(roleAwareStatusLabel(WALLET_B, contract), presentStatus(status), status);
  }
  assert.match(
    CONTRACT_CARD,
    /label=\{roleAwareStatusLabelForWallets\(accountWallets, contract\)\}/
  );
  assert.doesNotMatch(CONTRACT_CARD, /presentStatus/);
  assert.match(
    OVERVIEW,
    /roleAwareStatusLabelForWallets\(accountWallets, c\)/
  );
  assert.doesNotMatch(OVERVIEW, /presentStatus/);
});

test("home page renders action and offer sections with every item field", () => {
  assert.match(
    OVERVIEW,
    /offerSectionsForWallets\(accountWallets, grouped\.all, now\)/
  );
  assert.match(OVERVIEW, /shortenAddress\(item\.counterpartyAddress\)/);
  assert.match(OVERVIEW, /shortenAddress\(item\.freelancerAddress\)/);
  assert.match(OVERVIEW, /formatTokenAmount\(item\.totalAmount/);
  assert.match(OVERVIEW, /OFFER_SECTIONS_COPY\.deadlineLabel/);
  assert.match(OVERVIEW, /\{copy\.deadlineText\}/);
  assert.match(OVERVIEW, /\{copy\.statusLabel\}/);
  assert.match(OVERVIEW, /\{copy\.actionLabel\}/);
  const order = [
    "<ActionRequiredSection",
    "OFFER_SECTIONS_COPY.awaitingTitle",
    "OFFER_SECTIONS_COPY.waitingTitle",
    "Streaming now",
  ].map((marker) => OVERVIEW.indexOf(marker));
  assert.ok(order.every((at) => at > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});
