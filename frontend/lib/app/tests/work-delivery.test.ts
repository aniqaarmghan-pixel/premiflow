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
  attachmentDeliverableUri,
  savedTransactionSignature,
  submittedWorkDisplay,
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

test("delivery validation: note + uploaded attachment without links", () => {
  const attachmentId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const ok = validateDeliveryPayload({
    deliveryNote: "Final PNG deliverable attached.",
    links: [{ url: "", label: "" }],
    uploadedAttachmentIds: [attachmentId],
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.links.length, 0);
    assert.equal(
      ok.value.onChainSubmissionUri,
      `https://premiflow.app/deliverable/attachment/${attachmentId}`
    );
  }
});

test("delivery validation rejects note-only and attachment-only without note", () => {
  assert.equal(
    validateDeliveryPayload({
      deliveryNote: "Note only.",
      links: [{ url: "", label: "" }],
      uploadedAttachmentIds: [],
    }).ok,
    false
  );
  assert.equal(
    validateDeliveryPayload({
      deliveryNote: "   ",
      links: [{ url: "https://example.com/work", label: "" }],
    }).ok,
    false
  );
  assert.equal(
    validateDeliveryPayload({
      deliveryNote: "Has note",
      links: [],
      uploadedAttachmentIds: [],
    }).ok,
    false
  );
  const pendingDoesNotCount = validateDeliveryPayload({
    deliveryNote: "Has note",
    links: [{ url: "", label: "" }],
    // callers must only pass successfully uploaded ids
    uploadedAttachmentIds: [],
  });
  assert.equal(pendingDoesNotCount.ok, false);
});

test("delivery validation prefers primary HTTPS link over attachment uri", () => {
  const attachmentId = "11111111-2222-3333-4444-555555555555";
  const ok = validateDeliveryPayload({
    deliveryNote: "Both link and file.",
    links: [{ url: "https://figma.example/primary", label: "Figma" }],
    uploadedAttachmentIds: [attachmentId],
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.onChainSubmissionUri, "https://figma.example/primary");
  }
});

test("UI includes delivery note, links, add/remove, real file picker, and session verify gate", () => {
  assert.match(FORM, /Delivery note/);
  assert.match(FORM, /Add another link/);
  assert.match(FORM, /Remove link/);
  assert.match(FORM, /DELIVERY_FILES_HINT/);
  assert.match(DELIVERY_FILES_HINT, /Optional private files/);
  assert.match(DELIVERY_FILES_HINT, /Max 10 files/);
  assert.match(FORM, /type="file"/);
  assert.match(FORM, /at least one https:\/\/ link or upload a file/i);
  assert.match(FORM, /DELIVERY_SESSION_COPY/);
  assert.match(FORM, /aria-label="Verify wallet"/);
  assert.match(DETAIL, /ensureMessagingSession/);
  assert.match(DETAIL, /uploadedDeliveryAttachmentIds/);
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

const UPLOAD_ID = "123e4567-e89b-12d3-a456-426614174000";
const SAVED_SIG = "5".repeat(88);

test("submitted work display: https link is clickable, upload placeholder is not", () => {
  const link = submittedWorkDisplay("https://figma.example/file/1");
  assert.equal(link.kind, "link");
  assert.equal(link.label, "Submitted work link");
  assert.equal(link.kind === "link" && link.href, "https://figma.example/file/1");

  const placeholder = submittedWorkDisplay(attachmentDeliverableUri(UPLOAD_ID));
  assert.equal(placeholder.kind, "attachment");
  assert.equal("href" in placeholder, false);
  assert.match(placeholder.text, /uploaded file/i);
  assert.doesNotMatch(placeholder.text, /https?:/);

  const empty = submittedWorkDisplay("");
  assert.equal(empty.kind, "none");
  assert.equal(empty.text, "Not submitted yet");

  for (const raw of ["ipfs://bafyMainSubmission", "javascript:alert(1)", "http://plain.example/x"]) {
    const other = submittedWorkDisplay(raw);
    assert.equal(other.kind, "text");
    assert.equal("href" in other, false);
  }
});

test("submitted work wording never claims a transaction or blockchain proof", () => {
  for (const raw of ["", "https://figma.example/a", attachmentDeliverableUri(UPLOAD_ID)]) {
    const display = submittedWorkDisplay(raw);
    assert.doesNotMatch(
      `${display.label} ${display.text}`,
      /transaction|blockchain proof|on-chain reference/i
    );
  }
});

test("saved transaction signature is only returned when a real one was saved", () => {
  assert.equal(savedTransactionSignature(SAVED_SIG), SAVED_SIG);
  assert.equal(savedTransactionSignature(` ${SAVED_SIG} `), SAVED_SIG);
  assert.equal(savedTransactionSignature(null), null);
  assert.equal(savedTransactionSignature(undefined), null);
  assert.equal(savedTransactionSignature(""), null);
  assert.equal(savedTransactionSignature("not-a-signature"), null);
  assert.equal(savedTransactionSignature("0".repeat(88)), null);
  assert.equal(savedTransactionSignature("https://figma.example/a"), null);
});

test("delivery history shows View transaction only for a saved signature via explorerTxUrl", () => {
  assert.match(HISTORY, /import \{ explorerTxUrl \} from "@\/lib\/network";/);
  assert.match(HISTORY, /savedTransactionSignature\(submission\.transactionSignature\)/);
  assert.match(
    HISTORY,
    /\{txSignature \? \([\s\S]*?href=\{explorerTxUrl\(txSignature\)\}[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"[\s\S]*?View transaction \u2197[\s\S]*?\) : null\}/
  );
  assert.equal((HISTORY.match(/explorerTxUrl\(/g) ?? []).length, 1);
});

test("work unit card uses friendly submitted work wording, not on-chain jargon", () => {
  assert.match(DETAIL, /submittedWorkDisplay\(unit\.submissionUri\)/);
  assert.match(DETAIL, /Technical details/);
  assert.match(DETAIL, /Work log link or note \(optional\)/);
  assert.match(
    DETAIL,
    /display\.kind === "link"[\s\S]*?href=\{display\.href\}[\s\S]*?rel="noopener noreferrer"/
  );
  assert.match(FORM, /saved with the contract as your submitted work link/);
  const resolutionUi = readFileSync(
    new URL("../../../components/contracts/ResolutionCenter.tsx", import.meta.url),
    "utf8"
  );
  for (const source of [DETAIL, FORM, HISTORY, resolutionUi]) {
    assert.doesNotMatch(source, /on-chain reference/i);
    assert.doesNotMatch(source, /Submission reference/);
  }
});
