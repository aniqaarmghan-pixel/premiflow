import type { BlobStorage } from "../blob/adapter";
import { randomId } from "../crypto";
import { createNotification } from "../notifications/service";
import { RATE_LIMITS, consumeRateLimit } from "../rate-limit";
import type {
  AttachmentStore,
  CaseFileEvidenceRecord,
  CaseStore,
  NotificationStore,
  RateLimitStore,
} from "../stores";
import type { ContractCaseFacts, ContractFactsReader } from "../solana/read-contract-case-facts";
import { casePartyRoleFromChain } from "./authorize";
import {
  CASE_EVENT_TYPES,
  CaseAccessError,
  CaseStateError,
  CaseValidationError,
  isUniqueViolation,
  parseContractAddress,
  recordEvent,
  toPublicFileEvidence,
  type PublicCaseFileEvidence,
} from "./service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CASE_FILE_EVIDENCE_CONTEXT = "case_evidence" as const;

function requireFileEvidenceStore(store: CaseStore) {
  if (
    !store.insertFileEvidence ||
    !store.listFileEvidence ||
    !store.getFileEvidenceByAttachment ||
    !store.getFileEvidenceById
  ) {
    throw new CaseStateError("unsupported", "File evidence is not available.");
  }
  return store as Required<
    Pick<
      CaseStore,
      "insertFileEvidence" | "listFileEvidence" | "getFileEvidenceByAttachment" | "getFileEvidenceById"
    >
  > &
    CaseStore;
}

/**
 * Notify the other party and the designated resolver about NEW file evidence.
 * Unique keys make retries idempotent (one row per evidence per recipient).
 */
export async function notifyFileEvidenceSubmitted(
  notifications: NotificationStore | undefined,
  input: { evidence: CaseFileEvidenceRecord; facts: ContractCaseFacts },
  now = new Date()
): Promise<number> {
  if (!notifications) return 0;
  const { evidence, facts } = input;
  const other = evidence.submittedByRole === "employer" ? facts.freelancer : facts.employer;
  const recipients = new Set([other, facts.resolver]);
  recipients.delete(evidence.submittedBy);
  const who = evidence.submittedByRole === "employer" ? "The employer" : "The freelancer";
  let created = 0;
  for (const recipient of recipients) {
    try {
      const result = await createNotification(
        notifications,
        {
          recipientWallet: recipient,
          type: "dispute_opened",
          uniqueKey: `case_file_evidence:${evidence.id}:${recipient}`,
          title: "New dispute evidence submitted",
          body: `${who} added a file to the Resolution Case.`,
          contractAddress: evidence.contractAddress,
          href: `/contracts/${evidence.contractAddress}#resolution`,
          payload: { caseId: evidence.caseId, fileEvidenceId: evidence.id },
        },
        now
      );
      if (result.created) created += 1;
    } catch {
      // Best effort: the immutable evidence record is the source of truth.
    }
  }
  return created;
}

/**
 * Party-only: turn the uploader's own pending `case_evidence` attachment into
 * an immutable Resolution Case evidence record. Retrying with the same
 * attachment returns the existing record and never re-notifies.
 */
export async function addFileEvidence(
  stores: {
    cases: CaseStore;
    attachments: AttachmentStore;
    notifications?: NotificationStore;
    rates?: RateLimitStore;
  },
  reader: ContractFactsReader,
  input: { contractAddress: string; sessionWallet: string; attachmentId: unknown },
  now = new Date()
): Promise<{ evidence: PublicCaseFileEvidence; created: boolean }> {
  const contractAddress = parseContractAddress(input.contractAddress);
  if (typeof input.attachmentId !== "string" || !UUID_RE.test(input.attachmentId)) {
    throw new CaseValidationError("A file is required.");
  }
  const attachmentId = input.attachmentId.toLowerCase();
  const cases = requireFileEvidenceStore(stores.cases);

  if (stores.rates) {
    await consumeRateLimit(
      stores.rates,
      `case-file-evidence:${input.sessionWallet}:${contractAddress}`,
      RATE_LIMITS.sendMax,
      RATE_LIMITS.sendWindowMs,
      now
    );
  }

  const facts = await reader.read(contractAddress);
  const role = casePartyRoleFromChain(input.sessionWallet, facts);
  if (role !== "employer" && role !== "freelancer") {
    throw new CaseAccessError();
  }
  if (facts.status !== "Disputed") {
    throw new CaseStateError(
      "not_disputed",
      "File evidence can be submitted only while the contract is Disputed."
    );
  }
  const existingCase = await cases.getCaseByContract(contractAddress);
  if (!existingCase) {
    throw new CaseStateError("case_not_found", "Resolution Case was not found.");
  }

  const previous = await cases.getFileEvidenceByAttachment(attachmentId);
  if (previous) {
    if (previous.caseId !== existingCase.id || previous.submittedBy !== input.sessionWallet) {
      throw new CaseAccessError("That file is not available for this case.");
    }
    await stores.attachments.activateCaseEvidence?.(attachmentId);
    return { evidence: toPublicFileEvidence(previous), created: false };
  }

  const attachment = await stores.attachments.getById(attachmentId);
  if (
    !attachment ||
    attachment.contractAddress !== contractAddress ||
    attachment.uploaderWallet !== input.sessionWallet ||
    attachment.context !== CASE_FILE_EVIDENCE_CONTEXT ||
    attachment.status !== "pending"
  ) {
    throw new CaseAccessError("That file is not available for this case.");
  }

  const row: CaseFileEvidenceRecord = {
    id: randomId(),
    caseId: existingCase.id,
    contractAddress,
    attachmentId,
    submittedBy: input.sessionWallet,
    submittedByRole: role,
    displayFilename: attachment.displayFilename,
    contentType: attachment.contentType,
    byteSize: attachment.byteSize,
    submittedAt: now,
  };

  let saved: CaseFileEvidenceRecord;
  try {
    saved = await cases.insertFileEvidence(row);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await cases.getFileEvidenceByAttachment(attachmentId);
    if (!raced) throw err;
    return { evidence: toPublicFileEvidence(raced), created: false };
  }

  await stores.attachments.activateCaseEvidence?.(attachmentId);
  await recordEvent(cases, {
    caseId: existingCase.id,
    eventType: CASE_EVENT_TYPES.evidenceAdded,
    actorWallet: input.sessionWallet,
    payload: { kind: "file", fileEvidenceId: saved.id, attachmentId },
    now,
  });
  await notifyFileEvidenceSubmitted(stores.notifications, { evidence: saved, facts }, now);
  return { evidence: toPublicFileEvidence(saved), created: true };
}

/**
 * Read one evidence file: employer, freelancer, or the designated resolver.
 * This serves only the submitted file, never the private message thread.
 */
export async function authorizeCaseFileEvidenceDownload(
  stores: { cases: CaseStore; attachments: AttachmentStore },
  blob: BlobStorage,
  input: { contractAddress: string; viewerWallet: string; facts: ContractCaseFacts; evidenceId: unknown }
) {
  const contractAddress = parseContractAddress(input.contractAddress);
  if (casePartyRoleFromChain(input.viewerWallet, input.facts) === null) {
    throw new CaseAccessError("Not a party or the resolver on this contract.");
  }
  if (typeof input.evidenceId !== "string" || !UUID_RE.test(input.evidenceId)) {
    throw new CaseAccessError("Evidence was not found.");
  }
  const cases = requireFileEvidenceStore(stores.cases);
  const existingCase = await cases.getCaseByContract(contractAddress);
  const record = await cases.getFileEvidenceById(input.evidenceId.toLowerCase());
  if (!existingCase || !record || record.caseId !== existingCase.id) {
    throw new CaseAccessError("Evidence was not found.");
  }
  const attachment = await stores.attachments.getById(record.attachmentId);
  if (!attachment || attachment.contractAddress !== contractAddress || attachment.status === "deleted") {
    throw new CaseAccessError("Evidence was not found.");
  }
  const payload = await blob.getPrivate(attachment.blobPathname);
  if (!payload) throw new CaseAccessError("Evidence was not found.");
  const safeName = record.displayFilename.replace(/["\r\n]/g, "");
  return {
    stream: payload.stream,
    contentType: record.contentType,
    contentDisposition: `attachment; filename="${safeName}"`,
    byteSize: record.byteSize,
  };
}
