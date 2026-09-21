import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import {
  ATTACHMENT_AI_POLICY,
  ATTACHMENT_MAX_BYTES,
  MESSAGE_ATTACHMENT_MAX,
  WORK_ATTACHMENT_MAX,
  sanitizeDisplayFilename,
  validateAttachmentFile,
} from "@/lib/app/attachments-policy";
import { CONTRACT_MESSAGE_AI_POLICY } from "@/lib/app/contract-messages";
import { WORK_DELIVERY_AI_POLICY } from "@/lib/app/work-delivery";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";
import { PREMIFLOW_RESOLVER } from "@/lib/app/premiflow";

import {
  AttachmentAccessError,
  AttachmentValidationError,
  assertCanReadAttachment,
  assertCanUploadAttachment,
  authorizeAttachmentDownload,
  deletePendingAttachment,
  parseAttachmentIdList,
  uploadPendingAttachment,
} from "../attachments/service";
import { createMemoryBlobStorage } from "../blob/adapter";
import { buildAttachmentObjectKey } from "../blob/keys";
import { createMemoryAttachmentStore } from "../memory-attachments";
import { createMemoryMessageStore, createMemoryRateLimitStore, createMemorySubmissionStore } from "../memory-stores";
import { createContractMessage, listContractMessages } from "../messages/service";
import {
  isAuthorizedSubmissionReader,
  isAuthorizedSubmissionWriter,
  persistConfirmedWorkSubmission,
} from "../submissions/service";

const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const OTHER = WALLET_C.toBase58();
const RESOLVER = PREMIFLOW_RESOLVER.address.toBase58();
const SIG =
  "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSVnAN";

const ROOT = join(process.cwd());

function parties() {
  return { employer: EMPLOYER, freelancer: FREELANCER };
}

function fixtureStores() {
  return {
    messages: createMemoryMessageStore(),
    rates: createMemoryRateLimitStore(),
    attachments: createMemoryAttachmentStore(),
    submissions: createMemorySubmissionStore(),
  };
}

async function uploadOn(
  stores: ReturnType<typeof fixtureStores>,
  blob: ReturnType<typeof createMemoryBlobStorage>,
  opts: {
    wallet: string;
    context: "message" | "work_submission";
    filename?: string;
    contentType?: string;
    bytes?: number;
  }
) {
  const body = Buffer.alloc(opts.bytes ?? 32, 1);
  const attachment = await uploadPendingAttachment(
    stores,
    blob,
    {
      contractAddress: CONTRACT,
      sessionWallet: opts.wallet,
      parties: parties(),
      context: opts.context,
      filename: opts.filename ?? "brief.pdf",
      contentType: opts.contentType ?? "application/pdf",
      byteSize: body.byteLength,
      body,
    }
  );
  return { attachment };
}

test("file policy accepts professional types and rejects dangerous ones", () => {
  assert.equal(
    validateAttachmentFile({
      filename: "a.pdf",
      contentType: "application/pdf",
      byteSize: 100,
    }).ok,
    true
  );
  assert.equal(
    validateAttachmentFile({
      filename: "x.exe",
      contentType: "application/pdf",
      byteSize: 100,
    }).ok,
    false
  );
  assert.equal(
    validateAttachmentFile({
      filename: "x.html",
      contentType: "text/html",
      byteSize: 100,
    }).ok,
    false
  );
  assert.equal(
    validateAttachmentFile({
      filename: "x.pdf",
      contentType: "application/pdf",
      byteSize: ATTACHMENT_MAX_BYTES + 1,
    }).ok,
    false
  );
  assert.equal(sanitizeDisplayFilename("../evil.pdf"), ".._evil.pdf");
  assert.equal(sanitizeDisplayFilename(""), null);
  assert.equal(MESSAGE_ATTACHMENT_MAX, 5);
  assert.equal(WORK_ATTACHMENT_MAX, 10);
});

test("storage keys are randomized and do not trust raw filenames as paths", () => {
  const a = buildAttachmentObjectKey({
    contractAddress: CONTRACT,
    context: "message",
    displayFilename: "../../etc/passwd.pdf",
    randomId: "aabb",
  });
  const b = buildAttachmentObjectKey({
    contractAddress: CONTRACT,
    context: "message",
    displayFilename: "../../etc/passwd.pdf",
    randomId: "ccdd",
  });
  assert.match(a, /^premiflow\/contracts\//);
  assert.notEqual(a, b);
  assert.doesNotMatch(a, /\.\.\//);
  assert.match(a, /passwd\.pdf$/);
});

test("participant authorization matrix for uploads and downloads", async () => {
  assert.doesNotThrow(() =>
    assertCanUploadAttachment(EMPLOYER, parties(), "message")
  );
  assert.doesNotThrow(() =>
    assertCanUploadAttachment(FREELANCER, parties(), "message")
  );
  assert.throws(
    () => assertCanUploadAttachment(RESOLVER, parties(), "message"),
    AttachmentAccessError
  );
  assert.throws(
    () => assertCanUploadAttachment(OTHER, parties(), "message"),
    AttachmentAccessError
  );
  assert.throws(
    () => assertCanUploadAttachment(EMPLOYER, parties(), "work_submission"),
    AttachmentAccessError
  );
  assert.doesNotThrow(() =>
    assertCanUploadAttachment(FREELANCER, parties(), "work_submission")
  );

  const stores = fixtureStores();
  const blob = createMemoryBlobStorage();
  const { attachment } = await uploadOn(stores, blob, {
    wallet: FREELANCER,
    context: "work_submission",
  });
  const row = await stores.attachments.getById(attachment.id);
  assert.ok(row);
  // Pending: uploader only
  assert.doesNotThrow(() => assertCanReadAttachment(FREELANCER, parties(), row!));
  assert.throws(
    () => assertCanReadAttachment(EMPLOYER, parties(), row!),
    AttachmentAccessError
  );
  assert.throws(
    () => assertCanReadAttachment(RESOLVER, parties(), row!),
    AttachmentAccessError
  );
  assert.throws(
    () => assertCanReadAttachment(OTHER, parties(), row!),
    AttachmentAccessError
  );
  assert.equal(isAuthorizedSubmissionWriter(FREELANCER, parties()), true);
  assert.equal(isAuthorizedSubmissionWriter(EMPLOYER, parties()), false);
  assert.equal(isAuthorizedSubmissionReader(RESOLVER, parties()), false);
});

test("upload creates pending metadata; delete pending works; arbitrary pathname delete is not exposed", async () => {
  const stores = fixtureStores();
  const blob = createMemoryBlobStorage();
  const { attachment } = await uploadOn(stores, blob, {
    wallet: EMPLOYER,
    context: "message",
  });
  assert.equal(attachment.status, "pending");
  assert.equal("blobPathname" in attachment, false);
  assert.match(attachment.downloadPath, /\/download$/);

  await deletePendingAttachment(stores, blob, {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    attachmentId: attachment.id,
  });
  const deleted = await stores.attachments.getById(attachment.id);
  assert.equal(deleted?.status, "deleted");

  await assert.rejects(
    () =>
      deletePendingAttachment(stores, blob, {
        contractAddress: CONTRACT,
        sessionWallet: FREELANCER,
        attachmentId: attachment.id,
      }),
    AttachmentAccessError
  );

  const adapterSrc = readFileSync(join(ROOT, "lib/server/blob/adapter.ts"), "utf8");
  assert.doesNotMatch(adapterSrc, /putFromUrl/);
  assert.match(adapterSrc, /access:\s*"private"/);
});

test("pending uploads are uploader-only until bound; active work files are employer-readable", async () => {
  const stores = fixtureStores();
  const blob = createMemoryBlobStorage();
  const { attachment } = await uploadOn(stores, blob, {
    wallet: FREELANCER,
    context: "work_submission",
  });

  await authorizeAttachmentDownload(stores, blob, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    attachmentId: attachment.id,
  });

  await assert.rejects(
    () =>
      authorizeAttachmentDownload(stores, blob, {
        contractAddress: CONTRACT,
        sessionWallet: EMPLOYER,
        parties: parties(),
        attachmentId: attachment.id,
      }),
    AttachmentAccessError
  );
  await assert.rejects(
    () =>
      authorizeAttachmentDownload(stores, blob, {
        contractAddress: CONTRACT,
        sessionWallet: OTHER,
        parties: parties(),
        attachmentId: attachment.id,
      }),
    AttachmentAccessError
  );

  await persistConfirmedWorkSubmission(stores, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    body: {
      submissionKind: "fixed",
      workUnitIndex: 0,
      revisionNumber: 0,
      deliveryNote: "Landing page delivered.",
      links: [{ url: "https://figma.example/b", label: "Figma" }],
      onChainSubmissionUri: "https://figma.example/b",
      transactionSignature:
        "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSVnBM",
      chainSubmittedAt: 1_700_000_001,
      attachmentIds: [attachment.id],
    },
  });

  const employerRead = await authorizeAttachmentDownload(stores, blob, {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    parties: parties(),
    attachmentId: attachment.id,
  });
  assert.equal(employerRead.contentType, "application/pdf");
});

test("message send binds pending attachments; list returns authorized download paths", async () => {
  const stores = fixtureStores();
  const blob = createMemoryBlobStorage();
  const { attachment } = await uploadOn(stores, blob, {
    wallet: EMPLOYER,
    context: "message",
  });
  const message = await createContractMessage(stores, {
    contractAddress: CONTRACT,
    wallet: EMPLOYER,
    body: "Please review the attached brief.",
    attachmentIds: [attachment.id],
  });
  assert.equal(message.attachments.length, 1);
  assert.equal(message.attachments[0]!.displayFilename, "brief.pdf");

  const listed = await listContractMessages(
    stores.messages,
    {
      contractAddress: CONTRACT,
      cursor: null,
      limit: null,
      wallet: FREELANCER,
    },
    stores.attachments
  );
  assert.equal(listed.messages[0]!.attachments.length, 1);

  const downloaded = await authorizeAttachmentDownload(stores, blob, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    attachmentId: attachment.id,
  });
  assert.equal(downloaded.contentType, "application/pdf");

  await assert.rejects(
    () =>
      authorizeAttachmentDownload(stores, blob, {
        contractAddress: CONTRACT,
        sessionWallet: OTHER,
        parties: parties(),
        attachmentId: attachment.id,
      }),
    AttachmentAccessError
  );
});

test("attachment count limits and invalid ids are rejected", () => {
  assert.throws(
    () => parseAttachmentIdList(Array.from({ length: 6 }, () => crypto.randomUUID()), "message"),
    AttachmentValidationError
  );
  assert.throws(
    () => parseAttachmentIdList(["not-a-uuid"], "message"),
    AttachmentValidationError
  );
  assert.equal(parseAttachmentIdList([], "message").length, 0);
});

test("work submission binds attachments only after confirmed persist; tx sig remains idempotent", async () => {
  const stores = fixtureStores();
  const blob = createMemoryBlobStorage();
  const { attachment } = await uploadOn(stores, blob, {
    wallet: FREELANCER,
    context: "work_submission",
  });

  const first = await persistConfirmedWorkSubmission(stores, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    body: {
      submissionKind: "fixed",
      workUnitIndex: 0,
      revisionNumber: 0,
      deliveryNote: "Landing page delivered.",
      links: [{ url: "https://figma.example/a", label: "Figma" }],
      onChainSubmissionUri: "https://figma.example/a",
      transactionSignature: SIG,
      chainSubmittedAt: 1_700_000_000,
      attachmentIds: [attachment.id],
    },
  });
  assert.equal(first.created, true);
  assert.equal(first.submission.attachments.length, 1);

  const second = await persistConfirmedWorkSubmission(stores, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: parties(),
    body: {
      submissionKind: "fixed",
      workUnitIndex: 0,
      revisionNumber: 0,
      deliveryNote: "Landing page delivered.",
      links: [{ url: "https://figma.example/a", label: "Figma" }],
      onChainSubmissionUri: "https://figma.example/a",
      transactionSignature: SIG,
      chainSubmittedAt: 1_700_000_000,
      attachmentIds: [attachment.id],
    },
  });
  assert.equal(second.created, false);
  assert.equal(second.submission.id, first.submission.id);
  assert.equal(second.submission.attachments.length, 1);
});

test("AI privacy: attachments are never auto-read or forwarded to Copilot", () => {
  assert.equal(ATTACHMENT_AI_POLICY.autoReadAttachments, false);
  assert.equal(ATTACHMENT_AI_POLICY.autoForwardToCopilot, false);
  assert.equal(ATTACHMENT_AI_POLICY.assistantCanExecuteAttachmentActions, false);
  assert.equal(CONTRACT_MESSAGE_AI_POLICY.autoReadAttachments, false);
  assert.equal(WORK_DELIVERY_AI_POLICY.autoReadAttachments, false);

  const copilot = readFileSync(join(ROOT, "lib/server/copilot/context.ts"), "utf8");
  assert.match(copilot, /privateMessagesIncluded:\s*false/);
  assert.doesNotMatch(copilot, /attachment/);

  const panel = readFileSync(join(ROOT, "components/contracts/ContractMessages.tsx"), "utf8");
  assert.doesNotMatch(panel, /\/api\/copilot/);
});

test("migration 0003 is additive with expected tables and constraints; prior migrations untouched", () => {
  const sql = readFileSync(join(ROOT, "drizzle/0003_contract_attachments.sql"), "utf8");
  assert.match(sql, /CREATE TABLE "contract_attachments"/);
  assert.match(sql, /CREATE TABLE "message_attachments"/);
  assert.match(sql, /CREATE TABLE "work_submission_attachments"/);
  assert.match(sql, /FOREIGN KEY/);
  assert.match(sql, /contract_attachments_pathname_uidx/);
  assert.match(sql, /message_attachments_attachment_uidx/);
  assert.match(sql, /work_submission_attachments_attachment_uidx/);
  assert.doesNotMatch(sql, /DROP TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);

  const zero = readFileSync(join(ROOT, "drizzle/0000_h4b_contract_messages.sql"), "utf8");
  const one = readFileSync(join(ROOT, "drizzle/0001_r2_resolution_cases.sql"), "utf8");
  const two = readFileSync(join(ROOT, "drizzle/0002_work_delivery_history.sql"), "utf8");
  assert.match(zero, /contract_messages/);
  assert.match(one, /resolution_cases/);
  assert.match(two, /contract_work_submissions/);

  const journal = readFileSync(join(ROOT, "drizzle/meta/_journal.json"), "utf8");
  assert.match(journal, /0003_contract_attachments/);
});

test("attachment routes enforce origin/session participant guards in source", () => {
  const upload = readFileSync(
    join(ROOT, "app/api/contracts/[address]/attachments/route.ts"),
    "utf8"
  );
  const download = readFileSync(
    join(ROOT, "app/api/contracts/[address]/attachments/[id]/download/route.ts"),
    "utf8"
  );
  const discard = readFileSync(
    join(ROOT, "app/api/contracts/[address]/attachments/[id]/route.ts"),
    "utf8"
  );
  assert.match(upload, /requireMutatingOrigin/);
  assert.match(upload, /requireMessageParticipant/);
  assert.match(download, /requireMessageParticipant/);
  assert.match(discard, /requireMutatingOrigin/);
  assert.match(discard, /deletePendingAttachment/);
  assert.doesNotMatch(upload, /BLOB_READ_WRITE_TOKEN/);
  assert.doesNotMatch(download, /BLOB_READ_WRITE_TOKEN/);
});

test("UI no longer advertises attachments coming next", () => {
  const dialog = readFileSync(join(ROOT, "components/contracts/ContractChatDialog.tsx"), "utf8");
  const form = readFileSync(join(ROOT, "components/contracts/SubmitWorkForm.tsx"), "utf8");
  const panel = readFileSync(join(ROOT, "components/contracts/ContractMessages.tsx"), "utf8");
  assert.doesNotMatch(dialog, /Attachments coming next/);
  assert.doesNotMatch(form, /Attachments will be available next/);
  assert.match(dialog, /type="file"/);
  assert.match(form, /type="file"/);
  assert.match(panel, /uploadContractAttachment/);
  assert.match(panel, /sendFailed/);
});
