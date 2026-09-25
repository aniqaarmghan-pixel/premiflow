import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { actionsSectionGuidance } from "../view-model";

const DETAIL = readFileSync(
  new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
  "utf8"
);

test("contract detail healthy hierarchy puts Actions before Resolution Center", () => {
  const actionsIdx = DETAIL.indexOf('id="actions"');
  const workIdx = DETAIL.indexOf('id="work"');
  const paymentIdx = DETAIL.indexOf('id="payment"');
  const messagesIdx = DETAIL.indexOf('id="messages"');
  const supportIdx = DETAIL.indexOf('id="support"');
  const secondaryResolution = DETAIL.indexOf("Resolution & dispute information");
  assert.ok(actionsIdx > 0);
  assert.ok(workIdx > actionsIdx);
  assert.ok(paymentIdx > workIdx);
  assert.ok(messagesIdx > paymentIdx);
  assert.ok(supportIdx > messagesIdx);
  assert.ok(secondaryResolution > supportIdx);
});

test("contract detail does not show a same-page section jump-navigation row", () => {
  assert.doesNotMatch(DETAIL, /aria-label="Contract sections"/);
  assert.doesNotMatch(DETAIL, /\["#actions", "Actions"\]/);
  assert.doesNotMatch(DETAIL, /rounded-full border border-line px-3 py-1 text-ink-faint hover:text-ink/);
});

test("dispute-active ResolutionCenter is promoted above Actions", () => {
  const disputeBlock = DETAIL.indexOf("disputeActive ? (");
  const actionsCard = DETAIL.indexOf('<Card id="actions"');
  assert.ok(disputeBlock > 0);
  assert.ok(actionsCard > disputeBlock);
  assert.match(DETAIL, /disputeActive \? \([\s\S]*?<div id="resolution">[\s\S]*?<ResolutionCenter/);
});

test("healthy Active Fixed guidance is work-first", () => {
  assert.match(
    actionsSectionGuidance({
      status: "Active",
      role: "freelancer",
      actions: ["submitWorkUnit"],
      paymentMode: "Fixed",
      workUnitStatus: "Defined",
    }),
    /Submit your deliverable/i
  );
  assert.match(
    actionsSectionGuidance({
      status: "Active",
      role: "employer",
      actions: ["cancelActiveContract"],
      paymentMode: "Fixed",
      workUnitStatus: "Defined",
    }),
    /Waiting for the freelancer to submit/i
  );
});

test("completion-ready Fixed guidance emphasizes Mark finished, not Cancel", () => {
  assert.equal(
    actionsSectionGuidance({
      status: "Active",
      role: "employer",
      actions: ["completeContract"],
      paymentMode: "Fixed",
      workUnitStatus: "Released",
    }),
    "All deliverables are approved. Mark the contract finished when the work is complete."
  );
  assert.doesNotMatch(
    actionsSectionGuidance({
      status: "Active",
      role: "employer",
      actions: ["completeContract"],
      paymentMode: "Fixed",
      workUnitStatus: "Released",
    }),
    /Waiting for the freelancer to submit/i
  );
});
