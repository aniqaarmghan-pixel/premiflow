/**
 * P4: local persistence for an unfinished Create wizard draft.
 *
 * A draft lives only in this browser, is never sent anywhere, and never
 * replaces or resets a saved create intent (the immutable record of an
 * attempted Create & Send Offer). Drafts are not saved while an intent exists.
 */
import type { CreateIntent, IntentScope, IntentStorage } from "@/lib/app/milestone-create-plan";
import {
  applyCreateDraftPatch,
  defaultCreateDraft,
  type CreateWizardDraft,
  type MilestoneDraft,
} from "@/lib/app/validation";
import { MAX_ACCEPTANCE_WINDOW } from "@/lib/streampay-v2/constants";

export const CREATE_DRAFT_VERSION = 1 as const;
export const CREATE_DRAFT_STORAGE_PREFIX = "premiflow:create-draft:v1:";
export const CREATE_DRAFT_SAVE_DEBOUNCE_MS = 600;
export const NO_WALLET_DRAFT_OWNER = "no-wallet";
export const DEFAULT_ACCEPTANCE_WINDOW_SECONDS = 172_800;
const MAX_SAVED_MILESTONES = 64;

export type SavedCreateDraft = {
  version: typeof CREATE_DRAFT_VERSION;
  step: number;
  savedAt: number;
  draft: CreateWizardDraft;
};

export function createDraftStorageKey(scope: IntentScope, owner: string | null): string {
  return `${CREATE_DRAFT_STORAGE_PREFIX}${scope.cluster}:${scope.programId}:${owner ?? NO_WALLET_DRAFT_OWNER}`;
}

export function isValidAcceptanceWindow(seconds: unknown): seconds is number {
  return (
    typeof seconds === "number" &&
    Number.isSafeInteger(seconds) &&
    seconds > 0 &&
    seconds <= MAX_ACCEPTANCE_WINDOW
  );
}

/** Old absolute deadline -> the window the user meant when the draft was saved. */
export function legacyAcceptanceWindow(local: unknown, savedAtMs: number): number | null {
  if (typeof local !== "string" || !Number.isFinite(savedAtMs) || savedAtMs <= 0) return null;
  const at = Date.parse(local);
  if (Number.isNaN(at)) return null;
  const seconds = Math.floor((at - savedAtMs) / 1000);
  return isValidAcceptanceWindow(seconds) ? seconds : null;
}

/**
 * Absolute acceptance deadline for a create attempt. An attempted setup always
 * keeps its stored deadline (immutable terms, same fingerprint); otherwise the
 * deadline is "now + accept within", computed right before the first attempt.
 */
export function resolveAcceptanceDeadline(params: {
  windowSeconds: number;
  nowSeconds: number;
  saved: Pick<CreateIntent, "createAttempted" | "request"> | null;
}): number {
  if (params.saved?.createAttempted) return params.saved.request.acceptanceDeadline;
  return params.nowSeconds + params.windowSeconds;
}

const ACCEPTANCE_WINDOW_PRESETS: readonly (readonly [number, string])[] = [
  [3_600, "1 hour"],
  [21_600, "6 hours"],
  [43_200, "12 hours"],
  [86_400, "1 day"],
  [172_800, "2 days"],
  [259_200, "3 days"],
  [604_800, "7 days"],
  [1_209_600, "14 days"],
  [2_592_000, "30 days"],
  [7_776_000, "90 days"],
];

function windowLabel(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} days`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600} hours`;
  return `${Math.max(1, Math.round(seconds / 60))} minutes`;
}

export function acceptanceWindowOptions(current: number): { seconds: number; label: string }[] {
  const options = ACCEPTANCE_WINDOW_PRESETS.filter(([s]) => s <= MAX_ACCEPTANCE_WINDOW).map(
    ([seconds, label]) => ({ seconds, label })
  );
  if (isValidAcceptanceWindow(current) && !options.some((o) => o.seconds === current)) {
    options.push({ seconds: current, label: windowLabel(current) });
    options.sort((a, b) => a.seconds - b.seconds);
  }
  return options;
}

/** Pristine drafts are not worth a restore prompt. */
export function isMeaningfulDraft(draft: CreateWizardDraft, step: number): boolean {
  if (step > 0 || draft.paymentMode !== "Fixed") return true;
  const text = [
    draft.freelancer,
    draft.totalAmountUi,
    draft.hourlyRateUi,
    draft.trialAmountUi,
    draft.title,
    draft.description,
    draft.deliverables,
  ];
  return (
    text.some((v) => v.trim() !== "") || draft.milestones.some((m) => m.amountUi.trim() !== "")
  );
}

const STRING_KEYS = [
  "freelancer",
  "totalAmountUi",
  "hourlyRateUi",
  "authorizedTimeValue",
  "engagementDurationValue",
  "trialAmountUi",
  "scheduledStartLocal",
  "title",
  "description",
  "deliverables",
] as const;
const NUMBER_KEYS = [
  "durationSeconds",
  "checkpointInterval",
  "reviewDuration",
  "activationReviewDuration",
  "maxRevisions",
] as const;
const PAYMENT_MODES = ["Fixed", "Milestone", "Streaming", "Hourly"];
const START_MODES = ["OnActivation", "Scheduled"];
const TIME_UNITS = ["minutes", "hours", "days", "weeks"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMilestones(value: unknown): MilestoneDraft[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SAVED_MILESTONES) {
    return null;
  }
  const out: MilestoneDraft[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.label !== "string" ||
      typeof item.amountUi !== "string" ||
      typeof item.dueOffsetSeconds !== "number" ||
      !Number.isSafeInteger(item.dueOffsetSeconds) ||
      item.dueOffsetSeconds < 0
    ) {
      return null;
    }
    out.push({ label: item.label, amountUi: item.amountUi, dueOffsetSeconds: item.dueOffsetSeconds });
  }
  return out;
}

/**
 * Defensive parse. Corrupt or foreign data returns null. Unknown or mistyped
 * fields fall back to defaults; locked token/resolver are re-applied.
 */
export function parseCreateDraft(raw: string | null, maxStep: number): SavedCreateDraft | null {
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== CREATE_DRAFT_VERSION || !isRecord(parsed.draft)) {
    return null;
  }
  const saved = parsed.draft;
  const savedAt =
    typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0;
  const step =
    typeof parsed.step === "number" &&
    Number.isInteger(parsed.step) &&
    parsed.step >= 0 &&
    parsed.step <= maxStep
      ? parsed.step
      : 0;
  const partial: Record<string, unknown> = {};
  for (const key of STRING_KEYS) {
    if (typeof saved[key] === "string") partial[key] = saved[key];
  }
  for (const key of NUMBER_KEYS) {
    const v = saved[key];
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) partial[key] = v;
  }
  if (typeof saved.paymentMode === "string" && PAYMENT_MODES.includes(saved.paymentMode)) {
    partial.paymentMode = saved.paymentMode;
  }
  if (typeof saved.startMode === "string" && START_MODES.includes(saved.startMode)) {
    partial.startMode = saved.startMode;
  }
  for (const key of ["authorizedTimeUnit", "engagementDurationUnit"] as const) {
    const v = saved[key];
    if (typeof v === "string" && TIME_UNITS.includes(v)) partial[key] = v;
  }
  if (typeof saved.trialEnabled === "boolean") partial.trialEnabled = saved.trialEnabled;
  const milestones = parseMilestones(saved.milestones);
  if (milestones) partial.milestones = milestones;
  partial.acceptanceWindowSeconds = isValidAcceptanceWindow(saved.acceptanceWindowSeconds)
    ? saved.acceptanceWindowSeconds
    : legacyAcceptanceWindow(saved.acceptanceDeadlineLocal, savedAt) ??
      DEFAULT_ACCEPTANCE_WINDOW_SECONDS;
  if (partial.paymentMode === "Hourly") partial.startMode = "OnActivation";
  const draft = applyCreateDraftPatch(defaultCreateDraft(), partial as Partial<CreateWizardDraft>);
  return { version: CREATE_DRAFT_VERSION, step, savedAt, draft };
}

export function serializeCreateDraft(draft: CreateWizardDraft, step: number, nowMs: number): string {
  // Locked payment fields are never stored; they are re-applied on restore.
  const rest: Partial<CreateWizardDraft> = { ...draft };
  delete rest.mint;
  delete rest.resolver;
  delete rest.decimals;
  delete rest.acceptanceDeadlineLocal;
  return JSON.stringify({ version: CREATE_DRAFT_VERSION, step, savedAt: nowMs, draft: rest });
}

/** Never throws. A corrupt stored draft is dropped. */
export function loadCreateDraft(
  storage: IntentStorage | null,
  scope: IntentScope,
  owner: string | null,
  maxStep: number
): SavedCreateDraft | null {
  if (!storage) return null;
  const key = createDraftStorageKey(scope, owner);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  const parsed = parseCreateDraft(raw, maxStep);
  if (raw != null && !parsed) clearCreateDraft(storage, scope, owner);
  return parsed && isMeaningfulDraft(parsed.draft, parsed.step) ? parsed : null;
}

/** Returns true when written. Never writes while a create intent exists. */
export function saveCreateDraft(
  storage: IntentStorage | null,
  scope: IntentScope,
  owner: string | null,
  params: { draft: CreateWizardDraft; step: number; nowMs: number; intentExists: boolean }
): boolean {
  if (!storage || params.intentExists) return false;
  if (!isMeaningfulDraft(params.draft, params.step)) {
    clearCreateDraft(storage, scope, owner);
    return false;
  }
  try {
    storage.setItem(
      createDraftStorageKey(scope, owner),
      serializeCreateDraft(params.draft, params.step, params.nowMs)
    );
    return true;
  } catch {
    return false;
  }
}

/** Removes only the local draft; never touches a saved create intent. */
export function clearCreateDraft(
  storage: IntentStorage | null,
  scope: IntentScope,
  owner: string | null
): void {
  if (!storage) return;
  try {
    storage.removeItem(createDraftStorageKey(scope, owner));
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/** Clears the employer's draft and any draft started before a wallet connected. */
export function clearAllCreateDrafts(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string
): void {
  clearCreateDraft(storage, scope, employer);
  clearCreateDraft(storage, scope, NO_WALLET_DRAFT_OWNER);
}
