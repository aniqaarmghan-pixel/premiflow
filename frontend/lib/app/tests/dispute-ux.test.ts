import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DISPUTE_INVALID_AWARD_MESSAGE,
  DISPUTE_LIFECYCLE_STEPS,
  DISPUTE_NOTHING_REMAINS_MESSAGE,
  DISPUTE_STATE_CHANGED_MESSAGE,
  DISPUTE_UNAUTHORIZED_OPEN_MESSAGE,
  DISPUTE_UNAUTHORIZED_RESOLVE_MESSAGE,
  DISPUTED_STATE_COPY,
  OPEN_DISPUTE_COPY,
  OPEN_DISPUTE_TITLE,
  POST_RESOLUTION_COLLECT_COPY,
  POST_RESOLUTION_REFUND_COPY,
  RESOLVE_DISPUTE_COPY,
  contractCardNextHint,
  displayContestedAmount,
  openDisputePresentation,
  postResolutionCollectAvailable,
  postResolutionRefundAvailable,
  presentResolver,
  resolutionPreview,
  resolverCopyImpliesEscrowReceipt,
  shouldOfferOpenDispute,
  shouldOfferResolveDispute,
  shouldRefreshAfterDisputeFailure,
  withDisputeRaceMessage,
} from "../dispute-ux";
import { confirmTitle } from "../view-model";
import { parseDisputeAwardInput, validateDisputeAward } from "../validation";
import { PREMIFLOW_RESOLVER } from "../premiflow";
import { availableActions } from "../../streampay-v2/actions";
import type { ParsedClientError } from "../../streampay-v2/errors";
import {
  RESOLVER,
  WALLET_A,
  WALLET_B,
  WALLET_C,
  makeContract,
} from "../../streampay-v2/tests/fixtures";

function err(code: number, uiMessage = "raw"): ParsedClientError {
  return {
    kind: "streampay_v2",
    code,
    uiMessage,
    raw: uiMessage,
  };
}

function disputedContract() {
  return makeContract({
    status: "Disputed",
    totalAmount: 100n,
    releasedAmount: 30n,
    withdrawnAmount: 10n,
    refundedAmount: 0n,
    contestedAmount: 70n,
    resolver: PREMIFLOW_RESOLVER.address,
  });
}

function resolvedContract(overrides: Parameters<typeof makeContract>[0] = {}) {
  return makeContract({
    status: "Resolved",
    totalAmount: 100n,
    releasedAmount: 70n,
    withdrawnAmount: 10n,
    refundedAmount: 0n,
    freelancerSettlementAmount: 70n,
    employerRefundableAmount: 30n,
    contestedAmount: 70n,
    resolver: PREMIFLOW_RESOLVER.address,
    ...overrides,
  });
}

test("employer and freelancer see Open dispute when remainder is positive", () => {
  const contract = makeContract({
    status: "Active",
    paymentMode: "Fixed",
    totalAmount: 10n,
    releasedAmount: 4n,
  });
  const employer = availableActions({ wallet: WALLET_A, contract, now: 1_000 });
  const freelancer = availableActions({ wallet: WALLET_B, contract, now: 1_000 });
  assert.ok(employer.includes("openDispute"));
  assert.ok(freelancer.includes("openDispute"));
  assert.equal(shouldOfferOpenDispute("employer", employer), true);
  assert.equal(shouldOfferOpenDispute("freelancer", freelancer), true);
});

test("unrelated wallet and resolver do not get Open dispute", () => {
  const contract = makeContract({
    status: "Active",
    paymentMode: "Fixed",
    totalAmount: 10n,
    releasedAmount: 4n,
  });
  const stranger = availableActions({ wallet: WALLET_C, contract, now: 1_000 });
  const resolver = availableActions({ wallet: RESOLVER, contract, now: 1_000 });
  assert.ok(!stranger.includes("openDispute"));
  assert.ok(!resolver.includes("openDispute"));
  assert.equal(shouldOfferOpenDispute("none", stranger), false);
  assert.equal(shouldOfferOpenDispute("resolver", resolver), false);
});

test("zero contested amount hides Open dispute", () => {
  const contract = makeContract({
    status: "Active",
    paymentMode: "Fixed",
    totalAmount: 10n,
    releasedAmount: 10n,
  });
  assert.ok(
    !availableActions({ wallet: WALLET_A, contract, now: 1_000 }).includes("openDispute")
  );
  assert.equal(displayContestedAmount(contract, 1_000), 0n);
  const presentation = openDisputePresentation(contract, 1_000);
  assert.equal(presentation.canSubmit, false);
});

test("Streaming projected-zero remainder hides Open dispute", () => {
  const contract = makeContract({
    status: "Active",
    paymentMode: "Streaming",
    startTime: 1_000,
    endTime: 2_000,
    mainAmount: 100n,
    totalAmount: 100n,
    releasedAmount: 0n,
    streamReleasedAmount: 0n,
  });
  assert.ok(
    !availableActions({ wallet: WALLET_A, contract, now: 2_000 }).includes(
      "openDispute"
    )
  );
  assert.equal(displayContestedAmount(contract, 2_000), 0n);
  const presentation = openDisputePresentation(contract, 2_000);
  assert.equal(presentation.canSubmit, false);
  assert.equal(presentation.clockCanChange, true);
  assert.match(presentation.streamingNote ?? "", /on-chain time/i);
});

test("Open dispute confirmation says no token transfer and does not pick a winner", () => {
  const contract = makeContract({
    status: "Active",
    paymentMode: "Fixed",
    totalAmount: 10n,
    releasedAmount: 4n,
  });
  const presentation = openDisputePresentation(contract, 1_000);
  assert.equal(presentation.title, OPEN_DISPUTE_TITLE);
  assert.equal(confirmTitle("openDispute"), "Open dispute?");
  assert.match(presentation.lead, /freeze the contract/i);
  assert.ok(presentation.points.some((line) => /no tokens are transferred/i.test(line)));
  assert.ok(presentation.points.some((line) => /does not refund the employer/i.test(line)));
  assert.ok(presentation.points.some((line) => /does not pay the freelancer/i.test(line)));
  assert.ok(presentation.points.some((line) => /designated resolver/i.test(line)));
  assert.equal(presentation.contestedAmount, 6n);
  assert.doesNotMatch(presentation.points.join(" "), /employer wins|freelancer wins/i);
  assert.equal(resolverCopyImpliesEscrowReceipt(presentation.points.join(" ")), false);
});

test("disputed state copy says the contract is frozen", () => {
  assert.match(DISPUTED_STATE_COPY.heading, /dispute in progress/i);
  assert.match(DISPUTED_STATE_COPY.frozen, /frozen while the dispute is being resolved/i);
  assert.match(DISPUTED_STATE_COPY.noTransfer, /did not transfer tokens/i);
});

test("resolver sees Resolve dispute; employer and freelancer cannot resolve", () => {
  const contract = disputedContract();
  const resolver = availableActions({
    wallet: PREMIFLOW_RESOLVER.address,
    contract,
    now: 1_000,
  });
  const employer = availableActions({ wallet: WALLET_A, contract, now: 1_000 });
  const freelancer = availableActions({ wallet: WALLET_B, contract, now: 1_000 });
  assert.deepEqual(resolver, ["resolveDispute"]);
  assert.deepEqual(employer, []);
  assert.deepEqual(freelancer, []);
  assert.equal(shouldOfferResolveDispute("resolver", resolver), true);
  assert.equal(shouldOfferResolveDispute("employer", employer), false);
  assert.equal(shouldOfferResolveDispute("freelancer", freelancer), false);
});

test("settlement validation rejects invalid resolver awards before Phantom", () => {
  assert.equal(validateDisputeAward(0n, 70n), null);
  assert.equal(validateDisputeAward(70n, 70n), null);
  assert.ok(validateDisputeAward(71n, 70n));
  assert.match(parseDisputeAwardInput("", 6, 70n).error ?? "", /enter the freelancer award/i);
  assert.match(parseDisputeAwardInput("NaN", 6, 70n).error ?? "", /not a valid number/i);
  assert.match(parseDisputeAwardInput("-1", 6, 70n).error ?? "", /non-negative/i);
  assert.match(parseDisputeAwardInput("abc", 6, 70n).error ?? "", /invalid decimal/i);
  assert.match(
    parseDisputeAwardInput("1.1234567", 6, 70n * 1_000_000n).error ?? "",
    /fractional digits/
  );
  assert.match(parseDisputeAwardInput("71", 0, 70n).error ?? "", /cannot exceed/i);
  assert.equal(parseDisputeAwardInput("0", 0, 70n).amount, 0n);
  assert.equal(parseDisputeAwardInput("40", 0, 70n).amount, 40n);
});

test("resolution preview matches Rust contested split and does not call it a transfer", () => {
  const preview = resolutionPreview(
    {
      contestedAmount: 70n,
      releasedAmount: 30n,
      refundedAmount: 0n,
      withdrawnAmount: 10n,
    },
    40n
  );
  assert.equal(preview.valid, true);
  assert.equal(preview.freelancerFromDispute, 40n);
  assert.equal(preview.employerFromDispute, 30n);
  assert.equal(preview.freelancerFinal, 70n);
  assert.equal(preview.employerFinal, 30n);
  assert.equal(preview.freelancerStillToCollect, 60n);
  assert.equal(preview.employerStillToRefund, 30n);
  assert.match(RESOLVE_DISPUTE_COPY.noEscrow, /does not send the escrow to the resolver/i);
  assert.match(RESOLVE_DISPUTE_COPY.collectAfter, /Collect pay/i);
  assert.match(RESOLVE_DISPUTE_COPY.refundAfter, /Claim refund/i);
  assert.equal(resolverCopyImpliesEscrowReceipt(RESOLVE_DISPUTE_COPY.noEscrow), false);
  assert.equal(resolverCopyImpliesEscrowReceipt(RESOLVE_DISPUTE_COPY.youAre), false);
});

test("freelancer post-resolution Collect pay is shown only when claimable", () => {
  const claimable = resolvedContract();
  const none = resolvedContract({
    withdrawnAmount: 70n,
    freelancerSettlementAmount: 70n,
  });
  assert.equal(postResolutionCollectAvailable(claimable), true);
  assert.equal(postResolutionCollectAvailable(none), false);
  assert.match(POST_RESOLUTION_COLLECT_COPY.intro, /recorded your settlement/i);
  assert.match(POST_RESOLUTION_COLLECT_COPY.intro, /transfers your claimable tokens/i);
  assert.equal(
    availableActions({ wallet: WALLET_B, contract: claimable, now: 1_000 }).includes(
      "withdrawFreelancer"
    ),
    true
  );
  assert.equal(
    availableActions({ wallet: WALLET_B, contract: none, now: 1_000 }).includes(
      "withdrawFreelancer"
    ),
    false
  );
});

test("employer post-resolution Claim refund is shown only when refundable", () => {
  const refundable = resolvedContract();
  const none = resolvedContract({
    refundedAmount: 30n,
    employerRefundableAmount: 30n,
  });
  assert.equal(postResolutionRefundAvailable(refundable), true);
  assert.equal(postResolutionRefundAvailable(none), false);
  assert.match(POST_RESOLUTION_REFUND_COPY.intro, /recorded the employer refund/i);
  assert.match(POST_RESOLUTION_REFUND_COPY.intro, /transfers the claimable tokens/i);
  assert.equal(
    availableActions({ wallet: WALLET_A, contract: refundable, now: 1_000 }).includes(
      "claimEmployerRefund"
    ),
    true
  );
  assert.equal(
    availableActions({ wallet: WALLET_A, contract: none, now: 1_000 }).includes(
      "claimEmployerRefund"
    ),
    false
  );
});

test("trusted resolver uses the configured label; unknown resolver stays an address", () => {
  const trusted = presentResolver(PREMIFLOW_RESOLVER.address);
  assert.equal(trusted.roleTitle, "Designated resolver");
  assert.equal(trusted.displayName, "PREMIFLOW Resolver");
  assert.equal(trusted.isTrustedLabel, true);
  const unknown = presentResolver(RESOLVER);
  assert.equal(unknown.displayName, RESOLVER.toBase58());
  assert.equal(unknown.isTrustedLabel, false);
});

test("card hints distinguish resolver, waiting parties, and post-resolution claims", () => {
  const disputed = disputedContract();
  assert.equal(
    contractCardNextHint("resolver", disputed),
    "Next: resolve the dispute"
  );
  assert.equal(
    contractCardNextHint("employer", disputed),
    "Next: waiting for the designated resolver"
  );
  const resolved = resolvedContract();
  assert.equal(contractCardNextHint("freelancer", resolved), "Next: collect pay");
  assert.equal(contractCardNextHint("employer", resolved), "Next: claim refund");
  const settled = resolvedContract({
    withdrawnAmount: 70n,
    refundedAmount: 30n,
  });
  assert.equal(contractCardNextHint("freelancer", settled), "Dispute resolved");
  assert.equal(contractCardNextHint("employer", settled), "Dispute resolved");
});

test("state-change and unauthorized dispute errors are identified without inventing a cause", () => {
  assert.equal(
    withDisputeRaceMessage("openDispute", err(6159)).uiMessage,
    DISPUTE_NOTHING_REMAINS_MESSAGE
  );
  assert.equal(
    withDisputeRaceMessage("openDispute", err(6111)).uiMessage,
    DISPUTE_STATE_CHANGED_MESSAGE
  );
  assert.equal(
    withDisputeRaceMessage("openDispute", err(6118)).uiMessage,
    DISPUTE_UNAUTHORIZED_OPEN_MESSAGE
  );
  assert.equal(
    withDisputeRaceMessage("resolveDispute", err(6118)).uiMessage,
    DISPUTE_UNAUTHORIZED_RESOLVE_MESSAGE
  );
  assert.equal(
    withDisputeRaceMessage("resolveDispute", err(6161)).uiMessage,
    DISPUTE_INVALID_AWARD_MESSAGE
  );
  assert.equal(
    withDisputeRaceMessage("resolveDispute", err(6111)).uiMessage,
    DISPUTE_STATE_CHANGED_MESSAGE
  );
  assert.equal(withDisputeRaceMessage("acceptContract", err(6111)).uiMessage, "raw");
  assert.equal(shouldRefreshAfterDisputeFailure("openDispute"), true);
  assert.equal(shouldRefreshAfterDisputeFailure("resolveDispute"), true);
  assert.equal(shouldRefreshAfterDisputeFailure("acceptContract"), false);
});

test("dispute lifecycle guidance describes the real sequence", () => {
  assert.ok(DISPUTE_LIFECYCLE_STEPS.some((step) => /becomes Disputed/i.test(step)));
  assert.ok(DISPUTE_LIFECYCLE_STEPS.some((step) => /does not transfer tokens/i.test(step)));
  assert.ok(DISPUTE_LIFECYCLE_STEPS.some((step) => /collect/i.test(step)));
  assert.ok(DISPUTE_LIFECYCLE_STEPS.some((step) => /claim/i.test(step)));
});

test("ContractDetail wires dispute copy and does not imply resolver receives escrow", () => {
  const detail = readFileSync(
    new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
    "utf8"
  );
  assert.match(detail, /OPEN_DISPUTE_COPY/);
  assert.match(detail, /DISPUTED_STATE_COPY/);
  assert.match(detail, /RESOLVE_DISPUTE_COPY/);
  assert.match(detail, /resolutionPreview/);
  assert.match(detail, /parseDisputeAwardInput/);
  assert.match(detail, /shouldRefreshAfterDisputeFailure/);
  assert.match(detail, /POST_RESOLUTION_COLLECT_COPY/);
  assert.match(detail, /POST_RESOLUTION_REFUND_COPY/);
  assert.match(detail, /Resolver wallet/);
  assert.doesNotMatch(detail, /resolver receives the escrow/i);
  assert.doesNotMatch(detail, /employer wins|freelancer wins/i);
});
