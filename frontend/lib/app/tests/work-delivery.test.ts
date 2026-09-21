import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DELIVERY_FILES_HINT,
  WORK_DELIVERY_AI_POLICY,
  WORK_DELIVERY_SYNC_WARNING,
  deliverableContextTitle,
  revisionLabel,
  submissionKindFromWorkUnit,
  validateDeliveryPayload,
  validateDeliveryUrl,
} from "../work-delivery";
import { ATTACHMENT_AI_POLICY } from "../attachments-policy";
import { CONTRACT_MESSAGE_AI_POLICY } from "../contract-messages";
import { makeWorkUnit } from "../../streampay-v2/tests/fixtures";

const DETAIL = readFileSync(
  new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
  "utf8"
);
const FORM = readFileSync(
  new URL("../../../components/contracts/SubmitWorkForm.tsx", import.meta.url),
  "utf8"
);
const HISTORY = readFileSync(
  new URL("../../../components/contracts/WorkDeliveryHistory.tsx", import.meta.url),
  "utf8"
);

test("context labels for trial, fixed, and milestone", () => {
  assert.equal(deliverableContextTitle(makeWorkUnit({ kind: "Trial", index: 0 })), "Paid Trial");
  assert.equal(deliverableContextTitle(makeWorkUnit({ kind: "Fixed", index: 0 })), "Fixed Deliverable");
  assert.equal(
    deliverableContextTitle(makeWorkUnit({ kind: "Milestone", index: 2 })),
    "Milestone 2"
  );
  assert.equal(submissionKindFromWorkUnit("Trial"), "trial");
  assert.equal(submissionKindFromWorkUnit("Fixed"), "fixed");
  assert.equal(submissionKindFromWorkUnit("Milestone"), "milestone");
});

test("revision labels map on-chain revisionCount", () => {
  assert.equal(revisionLabel(0), "Initial submission");
  assert.equal(revisionLabel(1), "Revision 1");
  assert.equal(revisionLabel(2), "Revision 2");
});

test("delivery validation accepts notes and multiple https links", () => {
  const ok = validateDeliveryPayload({
    deliveryNote: "Done with responsive spacing.",
    links: [
      { url: "https://figma.example/a", label: "Figma" },
      { url: "https://preview.example/", label: "Live" },
    ],
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.links.length, 2);
    assert.equal(ok.value.onChainSubmissionUri, "https://figma.example/a");
  }
});

test("UI includes delivery note, links, add/remove, and real file picker", () => {
  assert.match(FORM, /Delivery note/);
  assert.match(FORM, /Add another link/);
  assert.match(FORM, /Remove link/);
  assert.match(FORM, /DELIVERY_FILES_HINT/);
  assert.match(DELIVERY_FILES_HINT, /Optional private files/);
  assert.match(FORM, /type="file"/);
  assert.match(HISTORY, /Current submission/);
  assert.match(HISTORY, /Previous submissions/);
  assert.match(HISTORY, /revisionLabel/);
  assert.match(HISTORY, /noopener noreferrer/);
  assert.match(HISTORY, /submission\.attachments/);
});

test("employer review actions remain gated by availableActions in WorkUnitPanel", () => {
  assert.match(DETAIL, /actions\.map\(\(action\) =>/);
  assert.match(DETAIL, /trialEmployerDecisions\(\{ actions \}\)/);
  assert.match(DETAIL, /availableActions\(/);
  assert.match(DETAIL, /WorkDeliveryHistory/);
  assert.match(DETAIL, /SubmitWorkForm/);
});

test("failed chain tx does not persist; success then DB failure does not resend chain tx", () => {
  assert.match(DETAIL, /if \(ok\) \{/);
  assert.match(DETAIL, /persistDeliveryHistory/);
  assert.match(DETAIL, /submitDelivery &&\s*signature/);
  assert.match(DETAIL, /WORK_DELIVERY_SYNC_WARNING/);
  assert.match(DETAIL, /Retry saving history|onRetrySync/);
  assert.match(DETAIL, /pendingHistoryPayload/);
  // Persistence is after ok; retry only calls persistContractSubmission, not execute again.
  assert.match(DETAIL, /persistContractSubmission/);
  assert.equal(
    WORK_DELIVERY_SYNC_WARNING.includes("without sending another blockchain transaction"),
    true
  );
});

test("unsafe URLs rejected by shared validator", () => {
  assert.equal(validateDeliveryUrl("javascript:alert(1)").ok, false);
  assert.equal(validateDeliveryUrl("data:text/plain,hi").ok, false);
  assert.equal(validateDeliveryUrl("file:///tmp/x").ok, false);
  assert.equal(validateDeliveryUrl("http://example.com").ok, false);
  assert.equal(validateDeliveryUrl("https://example.com/work").ok, true);
});

test("Assistant privacy remains default-off for delivery history", () => {
  assert.equal(WORK_DELIVERY_AI_POLICY.autoReadDeliveryHistory, false);
  assert.equal(WORK_DELIVERY_AI_POLICY.autoSummarizeForAssistant, false);
  assert.equal(WORK_DELIVERY_AI_POLICY.autoReadAttachments, false);
  assert.equal(ATTACHMENT_AI_POLICY.autoReadAttachments, false);
  assert.equal(CONTRACT_MESSAGE_AI_POLICY.autoReadPrivateChat, false);
  assert.doesNotMatch(DETAIL, /\/api\/copilot/);
  assert.doesNotMatch(FORM, /\/api\/copilot/);
  assert.doesNotMatch(HISTORY, /\/api\/copilot/);
});
