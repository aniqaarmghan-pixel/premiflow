import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import { PREMIFLOW_RESOLVER } from "@/lib/app/premiflow";
import { AI_CASE_SUMMARY_COPY } from "@/lib/app/resolution-center";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

import { ADMIN_AUTHORITY, isAppAdminUser } from "../admin/auth";
import { authorizeAttachmentDownload } from "../attachments/service";
import type { BlobStorage } from "../blob/adapter";
import {
  containsDecisionLanguage,
  deterministicCaseSummary,
  generateCaseSummary,
} from "../cases/ai-summary";
import { addFileEvidence, authorizeCaseFileEvidenceDownload } from "../cases/file-evidence";
import {
  CaseAccessError,
  CaseStateError,
  createOrRecoverResolutionCase,
  getResolutionCase,
} from "../cases/service";
import { createMemoryAttachmentStore } from "../memory-attachments";
import { createMemoryCaseStore, createMemoryNotificationStore } from "../memory-stores";
import { listNotifications } from "../notifications/service";
import type { ContractCaseFacts, ContractFactsReader } from "../solana/read-contract-case-facts";
import type { AttachmentRecord, NotificationStore } from "../stores";
import {
  SupportNotFoundError,
  SupportValidationError,
  adminListSupportTickets,
  adminReplyToSupportTicket,
  adminSetSupportTicketStatus,
  createSupportTicket,
  getOwnSupportTicket,
  listOwnSupportTickets,
  replyToOwnSupportTicket,
} from "../support/service";
import { createMemorySupportStore } from "../support/store";

const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const UNRELATED = WALLET_C.toBase58();
const RESOLVER_WALLET = PREMIFLOW_RESOLVER.address.toBase58();

function facts(overrides: Partial<ContractCaseFacts> = {}): ContractCaseFacts {
  return {
    employer: EMPLOYER,
    freelancer: FREELANCER,
    resolver: RESOLVER_WALLET,
    status: "Disputed",
    paymentMode: "Fixed",
    disputeInitiator: "Employer",
    disputedAt: 1_700_000_100,
    terminatedAt: 0,
    contestedAmount: "90",
    freelancerSettlementAmount: "0",
    employerRefundableAmount: "0",
    releasedAmount: "10",
    withdrawnAmount: "0",
    refundedAmount: "0",
    ...overrides,
  };
}

function readerOf(value: ContractCaseFacts): ContractFactsReader {
  return { async read() { return value; } };
}

async function walletNotifications(store: NotificationStore, wallet: string) {
  const { notifications } = await listNotifications(store, { recipientWallet: wallet, cursor: null, limit: "50" });
  return notifications;
}

/* ---------------- admin authorization ---------------- */

test("admin: server allowlist only; browser flags and unverified emails never grant admin", () => {
  const env = { PREMIFLOW_ADMIN_USER_IDS: "user-admin, other", PREMIFLOW_ADMIN_EMAILS: "Ops@Premiflow.app" };
  assert.equal(isAppAdminUser({ id: "user-admin" }, env), true);
  assert.equal(isAppAdminUser({ id: "user-x", email: "ops@premiflow.app", emailVerified: true }, env), true);
  assert.equal(isAppAdminUser({ id: "user-x", email: "ops@premiflow.app", emailVerified: false }, env), false);
  assert.equal(isAppAdminUser({ id: "user-x", admin: true, role: "admin" } as never, env), false);
  assert.equal(isAppAdminUser({ id: "user-admin" }, {}), false);
  assert.equal(isAppAdminUser(null, env), false);
  assert.equal(ADMIN_AUTHORITY.settlement, false);
  assert.equal(ADMIN_AUTHORITY.privateContractMessages, false);
  const routes = [
    "app/api/admin/support/tickets/route.ts",
    "app/api/admin/support/tickets/[id]/route.ts",
  ].map((p) => readFileSync(p, "utf8"));
  for (const src of routes) {
    assert.match(src, /requireAppAdmin\(request\)/);
    assert.doesNotMatch(src, /resolveDispute|resolve_dispute|messages/);
  }
  assert.doesNotMatch(readFileSync("lib/server/admin/auth.ts", "utf8"), /headers\.get\(|searchParams|cookie/i);
});

/* ---------------- Help Desk tickets ---------------- */

test("support: create validates, owners see only their tickets, others get not-found", async () => {
  const store = createMemorySupportStore();
  await assert.rejects(
    createSupportTicket(store, { userId: "u1", requesterEmail: null, body: { category: "nope", subject: "Help me", description: "Something broke here." } }),
    SupportValidationError
  );
  await assert.rejects(
    createSupportTicket(store, { userId: "u1", requesterEmail: null, body: { category: "wallet", subject: "Hi", description: "Something broke here." } }),
    SupportValidationError
  );
  await assert.rejects(
    createSupportTicket(store, { userId: "u1", requesterEmail: null, body: { category: "wallet", subject: "Wallet", description: "Broken wallet.", contractAddress: "not-a-key" } }),
    SupportValidationError
  );
  const created = await createSupportTicket(store, {
    userId: "u1",
    requesterEmail: "u1@example.com",
    body: { category: "contract", subject: "Contract stuck", description: "My contract is not activating.", contractAddress: CONTRACT },
  });
  assert.equal(created.ticket.status, "open");
  assert.equal(created.ticket.contractAddress, CONTRACT);
  assert.equal("requesterEmail" in created.ticket, false);
  assert.equal((await listOwnSupportTickets(store, "u1")).length, 1);
  assert.equal((await listOwnSupportTickets(store, "u2")).length, 0);
  await assert.rejects(getOwnSupportTicket(store, "u2", created.ticket.id), SupportNotFoundError);
  await assert.rejects(getOwnSupportTicket(store, "u1", "../etc"), SupportNotFoundError);
});

test("support: admin reply + status change notify the owner once; retries and unchanged status do not duplicate", async () => {
  const support = createMemorySupportStore();
  const notifications = createMemoryNotificationStore();
  const recipients = async (userId: string) => (userId === "u1" ? [EMPLOYER, FREELANCER] : []);
  const { ticket } = await createSupportTicket(support, {
    userId: "u1",
    requesterEmail: null,
    body: { category: "payment", subject: "Refund question", description: "Where is my refund shown?" },
  });

  const replied = await adminReplyToSupportTicket(
    { support, notifications },
    { adminUserId: "admin", ticketId: ticket.id, body: "Open the contract page.", recipients },
    new Date("2026-10-07T10:00:00Z")
  );
  assert.equal(replied.messages.length, 1);
  assert.equal(replied.messages[0]!.authorRole, "admin");
  assert.equal((await walletNotifications(notifications, EMPLOYER)).length, 1);
  assert.equal((await walletNotifications(notifications, FREELANCER)).length, 1);
  assert.equal((await walletNotifications(notifications, EMPLOYER))[0]!.type, "support_ticket_updated");

  const t1 = new Date("2026-10-07T11:00:00Z");
  const changed = await adminSetSupportTicketStatus({ support, notifications }, { ticketId: ticket.id, status: "in_progress", recipients }, t1);
  assert.equal(changed.changed, true);
  const again = await adminSetSupportTicketStatus({ support, notifications }, { ticketId: ticket.id, status: "in_progress", recipients }, t1);
  assert.equal(again.changed, false);
  assert.equal((await walletNotifications(notifications, EMPLOYER)).length, 2);

  const resolved = await adminSetSupportTicketStatus(
    { support, notifications },
    { ticketId: ticket.id, status: "resolved", recipients },
    new Date("2026-10-07T12:00:00Z")
  );
  assert.equal(resolved.detail.ticket.status, "resolved");
  assert.equal((await walletNotifications(notifications, EMPLOYER)).length, 3);
  await assert.rejects(
    adminSetSupportTicketStatus({ support, notifications }, { ticketId: ticket.id, status: "closed", recipients }),
    SupportValidationError
  );

  assert.deepEqual((await adminListSupportTickets(support, { status: "resolved" })).map((t) => t.id), [ticket.id]);
  assert.equal((await adminListSupportTickets(support, { status: "open" })).length, 0);

  const reopened = await replyToOwnSupportTicket(support, { userId: "u1", ticketId: ticket.id, body: "Still missing." });
  assert.equal(reopened.ticket.status, "open");
  assert.deepEqual(reopened.messages.map((m) => m.authorRole), ["admin", "user"]);
  await assert.rejects(replyToOwnSupportTicket(support, { userId: "u2", ticketId: ticket.id, body: "x" }), SupportNotFoundError);
  assert.equal((await walletNotifications(notifications, EMPLOYER)).length, 3, "own reply does not notify");
});

/* ---------------- dispute file evidence ---------------- */

function memoryBlob(): BlobStorage {
  const files = new Map<string, string>();
  return {
    async putPrivate(input) {
      files.set(input.pathname, String(input.body));
      return { pathname: input.pathname, url: `blob://${input.pathname}`, contentType: input.contentType, size: input.byteSize, contentDisposition: "attachment" } as never;
    },
    async getPrivate(pathname) {
      if (!files.has(pathname)) return null;
      return { stream: new Blob([files.get(pathname)!]).stream(), contentType: "application/pdf", size: 3 } as never;
    },
    async deletePrivate(pathname) {
      files.delete(pathname);
    },
  };
}

async function evidenceSetup() {
  const cases = createMemoryCaseStore();
  const attachments = createMemoryAttachmentStore();
  const notifications = createMemoryNotificationStore();
  const blob = memoryBlob();
  const reader = readerOf(facts());
  await createOrRecoverResolutionCase({ cases }, reader, { contractAddress: CONTRACT, sessionWallet: EMPLOYER });
  let n = 0;
  async function pending(uploader: string, context: AttachmentRecord["context"] = "case_evidence") {
    n += 1;
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const pathname = `premiflow/contracts/${CONTRACT}/${context}/${id}/proof.pdf`;
    await blob.putPrivate({ pathname, body: "pdf", contentType: "application/pdf", byteSize: 3 });
    await attachments.insertPending({
      id,
      contractAddress: CONTRACT,
      uploaderWallet: uploader,
      context,
      blobPathname: pathname,
      blobUrl: `blob://${pathname}`,
      displayFilename: "proof.pdf",
      contentType: "application/pdf",
      byteSize: 3,
      status: "pending",
      createdAt: new Date(),
      deletedAt: null,
    });
    return id;
  }
  return { cases, attachments, notifications, blob, reader, pending };
}

test("evidence: party submits an immutable file record; retry is idempotent and notifies other party + resolver once", async () => {
  const { cases, attachments, notifications, reader, pending, blob } = await evidenceSetup();
  const id = await pending(FREELANCER);
  const first = await addFileEvidence({ cases, attachments, notifications }, reader, { contractAddress: CONTRACT, sessionWallet: FREELANCER, attachmentId: id });
  assert.equal(first.created, true);
  assert.equal(first.evidence.submittedByRole, "freelancer");
  assert.equal(first.evidence.submittedBy, FREELANCER);
  assert.match(first.evidence.downloadPath, new RegExp(`/api/contracts/${CONTRACT}/case/evidence/files/`));
  assert.ok(first.evidence.submittedAt);
  assert.equal((await attachments.getById(id))!.status, "active");

  const retry = await addFileEvidence({ cases, attachments, notifications }, reader, { contractAddress: CONTRACT, sessionWallet: FREELANCER, attachmentId: id });
  assert.equal(retry.created, false);
  assert.equal(retry.evidence.id, first.evidence.id);

  assert.equal((await walletNotifications(notifications, EMPLOYER)).length, 1);
  assert.equal((await walletNotifications(notifications, RESOLVER_WALLET)).length, 1);
  assert.equal((await walletNotifications(notifications, FREELANCER)).length, 0);

  const view = await getResolutionCase(cases, reader, { contractAddress: CONTRACT, sessionWallet: RESOLVER_WALLET }, new Date(), { allowResolver: true });
  assert.equal(view.viewerRole, "resolver");
  assert.equal(view.fileEvidence.length, 1);
  assert.equal(view.evidence.length, 0, "message snapshots stay separate");

  // Resolver + other party can download; unrelated wallet cannot.
  for (const viewer of [RESOLVER_WALLET, EMPLOYER, FREELANCER]) {
    const out = await authorizeCaseFileEvidenceDownload({ cases, attachments }, blob, { contractAddress: CONTRACT, viewerWallet: viewer, facts: facts(), evidenceId: first.evidence.id });
    assert.match(out.contentDisposition, /proof\.pdf/);
  }
  await assert.rejects(
    authorizeCaseFileEvidenceDownload({ cases, attachments }, blob, { contractAddress: CONTRACT, viewerWallet: UNRELATED, facts: facts(), evidenceId: first.evidence.id }),
    CaseAccessError
  );
  // Active evidence attachments cannot be discarded through the attachment API.
  await assert.rejects(
    authorizeAttachmentDownload({ attachments }, blob, { contractAddress: CONTRACT, sessionWallet: UNRELATED, parties: { employer: EMPLOYER, freelancer: FREELANCER } as never, attachmentId: id })
  );
});

test("evidence: resolver/unrelated cannot submit, foreign or wrong-context uploads rejected, only while Disputed", async () => {
  const { cases, attachments, notifications, reader, pending } = await evidenceSetup();
  const employerFile = await pending(EMPLOYER);
  for (const wallet of [RESOLVER_WALLET, UNRELATED]) {
    await assert.rejects(
      addFileEvidence({ cases, attachments, notifications }, reader, { contractAddress: CONTRACT, sessionWallet: wallet, attachmentId: employerFile }),
      CaseAccessError
    );
  }
  await assert.rejects(
    addFileEvidence({ cases, attachments, notifications }, reader, { contractAddress: CONTRACT, sessionWallet: FREELANCER, attachmentId: employerFile }),
    CaseAccessError,
    "cannot claim another party's upload"
  );
  const messageFile = await pending(EMPLOYER, "message");
  await assert.rejects(
    addFileEvidence({ cases, attachments, notifications }, reader, { contractAddress: CONTRACT, sessionWallet: EMPLOYER, attachmentId: messageFile }),
    CaseAccessError
  );
  await assert.rejects(
    addFileEvidence({ cases, attachments, notifications }, readerOf(facts({ status: "Resolved" })), { contractAddress: CONTRACT, sessionWallet: EMPLOYER, attachmentId: employerFile }),
    CaseStateError
  );
});

test("evidence: unsafe file types stay rejected by the shared policy", async () => {
  const { validateAttachmentFile } = await import("@/lib/app/attachments-policy");
  for (const filename of ["run.exe", "x.js", "page.html", "img.svg", "s.sh"]) {
    const result = validateAttachmentFile({ filename, contentType: "application/octet-stream", byteSize: 10 } as never);
    assert.equal(result.ok, false, filename);
  }
  const big = validateAttachmentFile({ filename: "a.pdf", contentType: "application/pdf", byteSize: 10 * 1024 * 1024 + 1 } as never);
  assert.equal(big.ok, false);
  const ok = validateAttachmentFile({ filename: "a.pdf", contentType: "application/pdf", byteSize: 1000 } as never);
  assert.equal(ok.ok, true);
});

/* ---------------- AI case summary ---------------- */

async function summaryView() {
  const { cases, reader, attachments, notifications, pending } = await evidenceSetup();
  const id = await pending(EMPLOYER);
  await addFileEvidence({ cases, attachments, notifications }, reader, { contractAddress: CONTRACT, sessionWallet: EMPLOYER, attachmentId: id });
  return getResolutionCase(cases, reader, { contractAddress: CONTRACT, sessionWallet: EMPLOYER });
}

test("AI summary: deterministic fallback, exact label, missing info, file metadata only", async () => {
  const view = await summaryView();
  const summary = await generateCaseSummary(view, { canCallModel: () => false });
  assert.equal(summary.label, "AI case summary \u2014 informational only");
  assert.equal(AI_CASE_SUMMARY_COPY.label, summary.label);
  assert.equal(summary.source, "fallback");
  assert.ok(summary.evidence.some((line) => /proof\.pdf/.test(line) && /not read/.test(line)));
  assert.ok(summary.missing.some((line) => /employer has not submitted a statement/i.test(line)));
  assert.ok(summary.contractFacts.some((line) => /Disputed remainder/.test(line)));
  const { claims, evidence, agreements, disagreements, contractFacts, missing } = deterministicCaseSummary(view);
  const text = JSON.stringify({ claims, evidence, agreements, disagreements, contractFacts, missing });
  assert.equal(containsDecisionLanguage(text), false, "generated sections carry no decision language");
  assert.doesNotMatch(summary.disclaimer + summary.agreements.join(" "), /should receive|winner is/i);
});

test("AI summary: model output with winner/award/percentage language is discarded; neutral text kept", async () => {
  const view = await summaryView();
  for (const bad of ["The freelancer wins.", "I recommend a 60% split.", "The employer should receive the refund.", "Award 40 to the freelancer."]) {
    const out = await generateCaseSummary(view, { canCallModel: () => true, generateText: async () => bad });
    assert.equal(out.source, "fallback", bad);
    assert.equal(out.narrative, null);
  }
  let prompt = "";
  const good = await generateCaseSummary(view, {
    canCallModel: () => true,
    generateText: async (input) => {
      prompt = input.system + input.user;
      return "The employer submitted one file. The freelancer has not yet submitted a statement.";
    },
  });
  assert.equal(good.source, "model");
  assert.match(good.narrative ?? "", /one file/);
  assert.match(prompt, /Never choose a winner/);
  assert.match(prompt, /untrusted/);
  const failing = await generateCaseSummary(view, { canCallModel: () => true, generateText: async () => { throw new Error("down"); } });
  assert.equal(failing.source, "fallback");
  const src = readFileSync("lib/server/cases/ai-summary.ts", "utf8");
  assert.doesNotMatch(src, /listMessages|getMessage\(|messages\./, "never reads the private thread");
  assert.doesNotMatch(src, /resolveDispute|signTransaction|sendTransaction/);
});
