import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { availableActions } from "../../streampay-v2/actions";
import { makeContract, WALLET_A, WALLET_B } from "../../streampay-v2/tests/fixtures";
import { NOTICE_CATALOG, noticeKindForAction } from "../notices";
import { OFFER_EXIT_COPY, expireOfferConfirmation } from "../offer-exit";
import { actionLabel, clientMethodForAction, confirmTitle } from "../view-model";
import { shouldAttemptCaseRecover, shouldRecoverAfterAction } from "../resolution-case";

const detail = readFileSync(
  new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
  "utf8"
);

test("expire offer is distinct from decline, cancel, and dispute", () => {
  assert.equal(actionLabel("expireAcceptance"), "Expire offer");
  assert.equal(confirmTitle("expireAcceptance"), "Expire offer?");
  assert.equal(clientMethodForAction("expireAcceptance"), "expireAcceptance");
  assert.notEqual(actionLabel("expireAcceptance"), actionLabel("cancelActiveContract"));
  assert.notEqual(actionLabel("expireAcceptance"), actionLabel("openDispute"));
  assert.notEqual(actionLabel("expireAcceptance"), actionLabel("declineContract"));
  assert.match(detail, /case "expireAcceptance":/);
  assert.match(detail, /client\.expireAcceptance\(contract\.address\)/);
  assert.match(detail, /expireOfferConfirmation/);
});

test("lapsed PendingAcceptance and Milestone Draft expose Expire offer to the employer", () => {
  const pending = makeContract({
    status: "PendingAcceptance",
    acceptanceDeadline: 500,
  });
  const employer = availableActions({ wallet: WALLET_A, contract: pending, now: 1_000 });
  assert.ok(employer.includes("expireAcceptance"));
  const freelancer = availableActions({ wallet: WALLET_B, contract: pending, now: 1_000 });
  assert.ok(!freelancer.includes("expireAcceptance"));
  assert.ok(freelancer.includes("declineContract"));
  assert.ok(!freelancer.includes("acceptContract"));

  const draft = makeContract({
    status: "Draft",
    paymentMode: "Milestone",
    acceptanceDeadline: 500,
  });
  const draftEmployer = availableActions({ wallet: WALLET_A, contract: draft, now: 1_000 });
  assert.ok(draftEmployer.includes("expireAcceptance"));
  assert.ok(!draftEmployer.includes("finalizeTerms"));
});

test("expire confirmation and notices explain refund later, not immediate transfer", () => {
  const copy = expireOfferConfirmation({
    contract: makeContract({ totalAmount: 1_000n }),
    decimals: 0,
  });
  assert.equal(copy.fundedAmountLabel, "1000");
  assert.ok(copy.points.some((line) => /acceptance deadline has passed/i.test(line)));
  assert.ok(copy.points.includes(OFFER_EXIT_COPY.laterRefund));
  assert.match(OFFER_EXIT_COPY.expireBody, /does not transfer tokens immediately/i);
  assert.match(OFFER_EXIT_COPY.expireBody, /does not open a dispute|No dispute/i);
  assert.equal(noticeKindForAction("expireAcceptance"), "offer_expired");
  assert.match(NOTICE_CATALOG.offer_expired.body, /Claim refund/i);
  assert.match(NOTICE_CATALOG.contract_declined.body, /before work started/i);
  assert.match(NOTICE_CATALOG.contract_declined.body, /Claim refund/i);
  assert.equal(shouldRecoverAfterAction("expireAcceptance", "Expired"), false);
  assert.equal(shouldRecoverAfterAction("declineContract", "Declined"), false);
  assert.equal(shouldAttemptCaseRecover("Expired", "employer"), false);
  assert.equal(shouldAttemptCaseRecover("Declined", "employer"), false);
});
