/**
 * Off-chain work delivery form helpers and revision labeling.
 * Solana remains authoritative for Submit Trial / Submit Work eligibility.
 */

import { MAX_URI_LEN } from "@/lib/streampay-v2/constants";
import type { WorkUnitKind, WorkUnitView } from "@/lib/streampay-v2/types";

export const DELIVERY_NOTE_MAX_LENGTH = 4_000;
export const DELIVERY_LINK_MAX = 8;
export const DELIVERY_LINK_LABEL_MAX = 80;
export const DELIVERY_ATTACHMENTS_COMING_NEXT =
  "Attachments will be available next.";

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
  /** Primary HTTPS link used as the on-chain submission_uri (≤ MAX_URI_LEN). */
  onChainSubmissionUri: string;
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

export function validateDeliveryPayload(input: {
  deliveryNote: unknown;
  links: unknown;
}): { ok: true; value: ValidatedDeliveryPayload } | { ok: false; error: string } {
  const note = validateDeliveryNote(input.deliveryNote);
  if (!note.ok) return note;

  if (!Array.isArray(input.links)) {
    return { ok: false, error: "At least one work link is required." };
  }
  if (input.links.length < 1) {
    return { ok: false, error: "At least one work link is required." };
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
    const url = validateDeliveryUrl(record.url);
    if (!url.ok) return url;
    const label = validateDeliveryLabel(record.label);
    if (!label.ok) return label;
    links.push({ url: url.value, label: label.value, position: i });
  }

  const primary = links[0].url;
  if (primary.length > MAX_URI_LEN) {
    return {
      ok: false,
      error: `Primary delivery link must be at most ${MAX_URI_LEN} characters for on-chain recording.`,
    };
  }

  return {
    ok: true,
    value: {
      deliveryNote: note.value,
      links,
      onChainSubmissionUri: primary,
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
  autoSummarizeForAssistant: false,
} as const;
