import { AI_CASE_SUMMARY_COPY, DISPUTE_CATEGORIES } from "@/lib/app/resolution-center";

import { copilotCanCallModel, getCopilotEnv } from "../copilot/env";
import { generateGuidanceText } from "../copilot/provider";
import { sanitizeUntrustedText, wrapUntrusted } from "../copilot/sanitize";
import type { PublicResolutionCase } from "./service";

/**
 * Neutral AI case summary - informational only.
 *
 * Input is ONLY the deliberately submitted Resolution Case material that the
 * caller is already allowed to read: party statements, submitted message
 * snapshots, file-evidence METADATA (file contents are never read), and
 * on-chain contract facts. The private message thread is never an input.
 *
 * It never chooses a winner, recommends an award or percentage, changes
 * controls, signs, or executes anything. Output that drifts into decision
 * language is discarded in favour of the deterministic summary.
 */
export const AI_CASE_SUMMARY_LABEL = AI_CASE_SUMMARY_COPY.label;

export type CaseSummary = {
  label: typeof AI_CASE_SUMMARY_LABEL;
  source: "model" | "fallback";
  generatedAt: string;
  claims: { employer: string[]; freelancer: string[] };
  evidence: string[];
  agreements: string[];
  disagreements: string[];
  contractFacts: string[];
  missing: string[];
  narrative: string | null;
  disclaimer: string;
};

export type CaseSummaryDeps = {
  canCallModel?: () => boolean;
  generateText?: (input: { system: string; user: string }) => Promise<string>;
  now?: Date;
};

const DECISION_PATTERNS: readonly RegExp[] = [
  /\b(winner|winning|wins?|won|prevails?|prevailed|loses|loser|at fault|in favou?r of)\b/i,
  /\b(recommend\w*|suggest\w*|advis\w*|deserv\w*|entitled)\b/i,
  /\bshould (receive|get|be (awarded|paid|refunded)|pay|refund|release)\b/i,
  /\d+(\.\d+)?\s?%|\bper ?cent\w*\b/i,
  /\b(award\w*|split the|allocat\w*)\b/i,
  /\b(sign(ed|ing)? (the )?(transaction|resolve)|execute\w*|transfer the funds)\b/i,
];

export function containsDecisionLanguage(text: string): boolean {
  return DECISION_PATTERNS.some((pattern) => pattern.test(text));
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function sentences(body: string | null | undefined, max = 4): string[] {
  if (!body || !body.trim()) return [];
  const parts = body
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.slice(0, max).map((item) => clip(item, 240));
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

function categoryLabel(id: string | null): string | null {
  if (!id) return null;
  return DISPUTE_CATEGORIES.find((item) => item.id === id)?.label ?? null;
}

/** Deterministic, provider-free summary built only from submitted case material. */
export function deterministicCaseSummary(view: PublicResolutionCase, now = new Date()): CaseSummary {
  const employer = view.employerStatement?.body ?? null;
  const freelancer = view.freelancerStatement?.body ?? null;
  const files = view.fileEvidence ?? [];

  const evidence = [
    ...view.evidence.map(
      (item) =>
        `Message snapshot submitted by the ${item.submittedByRole} on ${day(item.submittedAt)}: "${clip(item.bodySnapshot, 160)}"`
    ),
    ...files.map(
      (item) =>
        `File "${item.filename}" (${item.contentType}, ${sizeLabel(item.byteSize)}) submitted by the ${item.submittedByRole} on ${day(item.submittedAt)}. File contents are not read by the assistant.`
    ),
  ];

  const category = categoryLabel(view.disputeCategory);
  const contractFacts = [
    `On-chain status: ${view.chainStatus}.`,
    `Payment mode: ${view.paymentMode}.`,
    `Dispute opened by: ${view.disputeOpener} on ${day(view.openedAt)}.`,
    `Disputed remainder (raw token units, on-chain): ${view.contestedAmount}.`,
    `Already released: ${view.releasedAmount}; withdrawn: ${view.withdrawnAmount}; refunded: ${view.refundedAmount} (raw token units).`,
    `Designated resolver wallet: ${view.resolverWallet}.`,
  ];

  const agreements = [
    "Both parties are bound by the same on-chain contract facts listed in this summary.",
  ];
  const disagreements = [
    "The contract is in dispute: the parties have not agreed how the disputed remainder should be settled.",
  ];
  if (category) disagreements.push(`Disagreement category selected when the dispute was opened: ${category}.`);
  if (employer && freelancer) {
    agreements.push("Points of agreement are not inferred automatically here; compare both statements directly.");
  }

  const missing: string[] = [];
  if (!employer) missing.push("The employer has not submitted a statement.");
  if (!freelancer) missing.push("The freelancer has not submitted a statement.");
  if (view.evidence.length === 0 && files.length === 0) missing.push("No evidence has been submitted to the case.");
  if (!view.disputeDescription) missing.push("No dispute description was recorded when the dispute was opened.");

  return {
    label: AI_CASE_SUMMARY_LABEL,
    source: "fallback",
    generatedAt: now.toISOString(),
    claims: { employer: sentences(employer), freelancer: sentences(freelancer) },
    evidence,
    agreements,
    disagreements,
    contractFacts,
    missing,
    narrative: null,
    disclaimer: AI_CASE_SUMMARY_COPY.disclaimer,
  };
}

const SYSTEM_PROMPT = [
  "You are a neutral case clerk for PREMIFLOW dispute files.",
  "Summarize ONLY the submitted case material you are given.",
  "Organize: each party's claims, the evidence listed, points of agreement, points of disagreement, contract facts, and missing information.",
  "Never choose a winner. Never say who is right or at fault. Never recommend, suggest or estimate any award, refund, split, amount or percentage.",
  "Never invent evidence or facts. Never claim to have read file contents.",
  "Never instruct anyone to sign, execute or transfer anything. The human designated resolver decides.",
  "Write plain neutral prose under 220 words. No headings, no markdown tables.",
].join("\n");

function safeUntrusted(text: string): string {
  try {
    return sanitizeUntrustedText(text, 1_500).text;
  } catch {
    // URLs are data, never fetched: neutralize them instead of failing.
    return sanitizeUntrustedText(text.replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link]"), 1_500).text;
  }
}

function modelPrompt(view: PublicResolutionCase): string {
  const block = (label: string, text: string) => wrapUntrusted(label, safeUntrusted(text) || "(none)");
  const files = (view.fileEvidence ?? [])
    .map((item) => `- ${item.submittedByRole}: ${item.filename} (${item.contentType})`)
    .join("\n");
  const snapshots = view.evidence
    .map((item) => `- submitted by ${item.submittedByRole}: ${item.bodySnapshot}`)
    .join("\n");
  return [
    `Contract facts: status ${view.chainStatus}; payment mode ${view.paymentMode}; dispute opened by ${view.disputeOpener}; disputed remainder ${view.contestedAmount} raw token units; category ${categoryLabel(view.disputeCategory) ?? "none"}.`,
    block("dispute_description", view.disputeDescription ?? ""),
    block("employer_statement", view.employerStatement?.body ?? ""),
    block("freelancer_statement", view.freelancerStatement?.body ?? ""),
    block("submitted_message_snapshots", snapshots),
    block("submitted_file_metadata", files),
  ].join("\n\n");
}

export async function generateCaseSummary(
  view: PublicResolutionCase,
  deps: CaseSummaryDeps = {}
): Promise<CaseSummary> {
  const now = deps.now ?? new Date();
  const base = deterministicCaseSummary(view, now);
  const canCall = deps.canCallModel ?? (() => copilotCanCallModel(getCopilotEnv()));
  if (!canCall()) return base;
  const generate =
    deps.generateText ?? ((input: { system: string; user: string }) => generateGuidanceText(input));
  try {
    const text = (await generate({ system: SYSTEM_PROMPT, user: modelPrompt(view) })).trim();
    if (!text || containsDecisionLanguage(text)) return base;
    return { ...base, source: "model", narrative: clip(text, 2_000) };
  } catch {
    return base;
  }
}
