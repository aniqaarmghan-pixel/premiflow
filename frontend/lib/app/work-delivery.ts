/**
 * Off-chain work delivery form helpers and revision labeling.
 * Solana remains authoritative for Submit Trial / Submit Work eligibility.
 */

import { MAX_URI_LEN } from "@/lib/streampay-v2/constants";
import type { WorkUnitKind, WorkUnitView } from "@/lib/streampay-v2/types";
import { attachmentLimitsHint } from "@/lib/app/attachments-policy";

export const DELIVERY_NOTE_MAX_LENGTH = 4_000;
export const DELIVERY_LINK_MAX = 8;
export const DELIVERY_LINK_LABEL_MAX = 80;
/** Canonical work-submission attachment limits — derived from attachments-policy. */
export const DELIVERY_FILES_HINT = attachmentLimitsHint("work_submission");

/**
 * Deterministic HTTPS on-chain submission_uri when the deliverable is an uploaded
 * file (no external work link). Not a public download URL — private bytes stay
 * behind authenticated attachment download routes.
 */
export const ATTACHMENT_DELIVERABLE_URI_PREFIX =
  "https://premiflow.app/deliverable/attachment/";

const ATTACHMENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SubmissionKind = "trial" | "fixed" | "milestone";

export type DeliveryLinkDraft = {
  url: string;
  label: string;
};

export type ValidatedDeliveryLink = {
  url: string;
  label: string | null;
  position: number;
};

export type ValidatedDeliveryPayload = {
  deliveryNote: string;
  links: ValidatedDeliveryLink[];
  /** Primary HTTPS reference used as the on-chain submission_uri (≤ MAX_URI_LEN). */
  onChainSubmissionUri: string;
  uploadedAttachmentIds: string[];
};

export function submissionKindFromWorkUnit(kind: WorkUnitKind): SubmissionKind {
  if (kind === "Trial") return "trial";
  if (kind === "Fixed") return "fixed";
  return "milestone";
}

/**
 * Maps on-chain `revision_count` at submit time to a human label.
 * Initial submit keeps revision_count at 0; each Request Revision increments it
 * before the next resubmit.
 */
export function revisionLabel(revisionNumber: number): string {
  if (!Number.isInteger(revisionNumber) || revisionNumber < 0) {
    return "Submission";
  }
  if (revisionNumber === 0) return "Initial submission";
  return `Revision ${revisionNumber}`;
}

export function deliverableContextTitle(unit: Pick<WorkUnitView, "kind" | "index">): string {
  if (unit.kind === "Trial") return "Paid Trial";
  if (unit.kind === "Fixed") return "Fixed Deliverable";
  return `Milestone ${unit.index}`;
}

export function submitWorkHeading(kind: WorkUnitKind): string {
  return kind === "Trial" ? "Submit paid trial" : "Submit work";
}

export function emptyDeliveryLink(): DeliveryLinkDraft {
  return { url: "", label: "" };
}

export function attachmentDeliverableUri(attachmentId: string): string {
  return `${ATTACHMENT_DELIVERABLE_URI_PREFIX}${attachmentId}`;
}

export function validateDeliveryNote(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "Delivery note is required." };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1) {
    return { ok: false, error: "Delivery note is required." };
  }
  if (trimmed.length > DELIVERY_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Delivery note must be at most ${DELIVERY_NOTE_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, value: trimmed };
}

const BLOCKED_URL_SCHEMES = /^(javascript|data|file|vbscript|blob):/i;

/**
 * HTTPS-only delivery links. Does not fetch remote content.
 */
export function validateDeliveryUrl(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "Link URL is required." };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Link URL is required." };
  }
  if (trimmed.length > MAX_URI_LEN) {
    return {
      ok: false,
      error: `Link URL must be at most ${MAX_URI_LEN} characters.`,
    };
  }
  if (BLOCKED_URL_SCHEMES.test(trimmed)) {
    return { ok: false, error: "Only https:// links are allowed." };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Link URL is invalid." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Only https:// links are allowed." };
  }
  if (!parsed.hostname) {
    return { ok: false, error: "Link URL is invalid." };
  }
  return { ok: true, value: trimmed };
}

export function validateDeliveryLabel(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: "Link label is invalid." };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > DELIVERY_LINK_LABEL_MAX) {
    return {
      ok: false,
      error: `Link label must be at most ${DELIVERY_LINK_LABEL_MAX} characters.`,
    };
  }
  return { ok: true, value: trimmed };
}

function parseUploadedAttachmentIds(raw: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Uploaded attachments are invalid." };
  }
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !ATTACHMENT_ID_RE.test(item)) {
      return { ok: false, error: "Uploaded attachments are invalid." };
    }
    ids.push(item);
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Uploaded attachments are invalid." };
  }
  return { ok: true, value: ids };
}

function isBlankLinkRow(record: Record<string, unknown>): boolean {
  const url = typeof record.url === "string" ? record.url.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  return !url && !label;
}

/**
 * Confirm / persist rule:
 * - delivery note required
 * - at least one deliverable reference: valid HTTPS link OR successfully uploaded attachment
 * - additional links must be valid if supplied
 * - blank link rows are ignored (form starts with one empty row)
 * - pending/failed attachments must not be passed as uploadedAttachmentIds
 */
export function validateDeliveryPayload(input: {
  deliveryNote: unknown;
  links: unknown;
  uploadedAttachmentIds?: unknown;
}): { ok: true; value: ValidatedDeliveryPayload } | { ok: false; error: string } {
  const note = validateDeliveryNote(input.deliveryNote);
  if (!note.ok) return note;

  const attachments = parseUploadedAttachmentIds(input.uploadedAttachmentIds);
  if (!attachments.ok) return attachments;

  if (!Array.isArray(input.links)) {
    return { ok: false, error: "Work links are invalid." };
  }
  if (input.links.length > DELIVERY_LINK_MAX) {
    return {
      ok: false,
      error: `At most ${DELIVERY_LINK_MAX} work links are allowed.`,
    };
  }

  const links: ValidatedDeliveryLink[] = [];
  for (let i = 0; i < input.links.length; i += 1) {
    const row = input.links[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, error: "Each work link must be an object." };
    }
    const record = row as Record<string, unknown>;
    if (isBlankLinkRow(record)) continue;
    const url = validateDeliveryUrl(record.url);
    if (!url.ok) return url;
    const label = validateDeliveryLabel(record.label);
    if (!label.ok) return label;
    links.push({ url: url.value, label: label.value, position: links.length });
  }

  if (links.length < 1 && attachments.value.length < 1) {
    return {
      ok: false,
      error: "Add at least one https:// work link or upload a file.",
    };
  }

  let onChainSubmissionUri: string;
  if (links.length > 0) {
    onChainSubmissionUri = links[0]!.url;
  } else {
    onChainSubmissionUri = attachmentDeliverableUri(attachments.value[0]!);
  }

  if (onChainSubmissionUri.length > MAX_URI_LEN) {
    return {
      ok: false,
      error: `Primary delivery reference must be at most ${MAX_URI_LEN} characters for on-chain recording.`,
    };
  }

  return {
    ok: true,
    value: {
      deliveryNote: note.value,
      links,
      onChainSubmissionUri,
      uploadedAttachmentIds: attachments.value,
    },
  };
}

export function formatSubmissionTimestamp(isoOrUnix: string | number | Date): string {
  const date =
    typeof isoOrUnix === "number"
      ? new Date(isoOrUnix * 1000)
      : isoOrUnix instanceof Date
        ? isoOrUnix
        : new Date(isoOrUnix);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const WORK_DELIVERY_SYNC_WARNING =
  "Your on-chain submission succeeded, but PREMIFLOW could not save the delivery note and links yet. You can retry saving history without sending another blockchain transaction.";

export const WORK_DELIVERY_AI_POLICY = {
  autoReadDeliveryHistory: false,
  autoReadAttachments: false,
  autoSummarizeForAssistant: false,
} as const;
