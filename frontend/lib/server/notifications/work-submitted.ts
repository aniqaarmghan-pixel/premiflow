import type { ContractParties } from "../solana/read-contract-parties";
import type { NotificationStore } from "../stores";
import type { NotificationKind } from "./kinds";
import { createNotification } from "./service";

export const WORK_SUBMITTED_TITLE = "Work submitted";
export const WORK_SUBMITTED_BODY =
  "The freelancer submitted work for review on this contract.";

export const REVISED_WORK_SUBMITTED_TITLE = "Revised work submitted";
export const REVISED_WORK_SUBMITTED_BODY =
  "The freelancer resubmitted revised work for review on this contract.";

/** Opens the contract detail page (no chat deep-link). */
export function workSubmissionNotificationHref(contractAddress: string): string {
  return `/contracts/${contractAddress}`;
}

/**
 * Initial submit (Defined → Submitted) stores revisionNumber 0.
 * After request_revision, revision_count is >= 1 and resubmits use that value.
 */
export function workSubmissionNotificationKind(
  revisionNumber: number
): Extract<NotificationKind, "work_submitted" | "revised_work_submitted"> {
  return revisionNumber >= 1 ? "revised_work_submitted" : "work_submitted";
}

export function workSubmissionUniqueKey(
  kind: Extract<NotificationKind, "work_submitted" | "revised_work_submitted">,
  transactionSignature: string,
  employerWallet: string
): string {
  return `${kind}:${transactionSignature}:${employerWallet}`;
}

/**
 * Creates a wallet-scoped work submission notification for the employer.
 * Call only after the submission row is persisted (created or idempotent retry).
 * Failures should be swallowed by the caller so delivery history is never rolled back.
 * Paid-trial submissions notify the employer using the existing work-submission kinds.
 */
export async function notifyEmployerOfWorkSubmission(
  store: NotificationStore,
  input: {
    contractAddress: string;
    parties: ContractParties;
    submission: {
      id: string;
      submissionKind: string;
      workUnitIndex: number;
      revisionNumber: number;
      transactionSignature: string | null;
    };
  },
  now = new Date()
): Promise<{ created: boolean; skipped?: string }> {
  const recipientWallet = input.parties.employer;
  if (!recipientWallet) {
    return { created: false, skipped: "no_employer" };
  }
  if (recipientWallet === input.parties.freelancer) {
    return { created: false, skipped: "self" };
  }

  const txSignature = input.submission.transactionSignature?.trim() ?? "";
  if (!txSignature) {
    return { created: false, skipped: "missing_signature" };
  }

  const kind = workSubmissionNotificationKind(input.submission.revisionNumber);
  const isTrial = input.submission.submissionKind === "trial";

  const title = isTrial
    ? kind === "revised_work_submitted"
      ? "Revised paid trial submitted"
      : "Paid trial submitted"
    : kind === "revised_work_submitted"
      ? REVISED_WORK_SUBMITTED_TITLE
      : WORK_SUBMITTED_TITLE;

  const body = isTrial
    ? kind === "revised_work_submitted"
      ? "The freelancer resubmitted revised paid-trial work for your review."
      : "The freelancer submitted paid-trial work for your review."
    : kind === "revised_work_submitted"
      ? REVISED_WORK_SUBMITTED_BODY
      : WORK_SUBMITTED_BODY;

  const result = await createNotification(
    store,
    {
      recipientWallet,
      type: kind,
      uniqueKey: workSubmissionUniqueKey(kind, txSignature, recipientWallet),
      title,
      body,
      contractAddress: input.contractAddress,
      href: workSubmissionNotificationHref(input.contractAddress),
      payload: {
        submissionId: input.submission.id,
        workUnitIndex: input.submission.workUnitIndex,
        revisionNumber: input.submission.revisionNumber,
        transactionSignature: txSignature,
      },
    },
    now
  );

  return { created: result.created };
}
