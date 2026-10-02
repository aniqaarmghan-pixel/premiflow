/**
 * Pending Marketplace -> Create handoff, stored apart from the P4 draft.
 *
 * Scoped to cluster + program + employer wallet (never walletless). The Create
 * wizard applies it only after an explicit "Use selected proposal" choice and
 * consumes it on any decision (import, keep current draft, dismiss), so it
 * cannot reappear after reload or wallet reconnect. It never touches a saved
 * create intent and never sends anything.
 */
import { NO_WALLET_DRAFT_OWNER } from "@/lib/app/create-draft-store";
import { marketplaceHandoffDraft } from "@/lib/app/marketplace";
import type { IntentScope, IntentStorage } from "@/lib/app/milestone-create-plan";
import type { CreateWizardDraft } from "@/lib/app/validation";
import type { CreateHandoff } from "@/lib/server/marketplace/service";

export const MARKETPLACE_HANDOFF_VERSION = 1 as const;
export const MARKETPLACE_HANDOFF_PREFIX = "premiflow:marketplace-handoff:v1:";

export const HANDOFF_COPY = {
  title: "Selected marketplace terms",
  note: "Nothing was sent on-chain; using it only refills the form for your review.",
  replaceWarning: "Using it replaces your unfinished draft. Keep current draft discards these proposal terms instead.",
  blockedByIntent:
    "You have a saved Create setup. Finish or discard it before using the selected proposal; it was left untouched.",
  imported: "Selected proposal loaded. Review each step, then press Create & Send Offer when ready.",
} as const;

export type PendingHandoff = { handoff: CreateHandoff; savedAt: number };
export type HandoffChoice = "import" | "keep" | "dismiss";
export type HandoffPromptKind = "none" | "blocked_by_intent" | "replace_or_keep" | "import_or_dismiss";
export type HandoffChoiceResult = {
  draft: CreateWizardDraft | null;
  consumed: boolean;
  blocked: boolean;
};

const MODES: readonly string[] = ["Fixed", "Milestone", "Streaming", "Hourly"];

function validOwner(owner: unknown): owner is string {
  return typeof owner === "string" && owner.trim() !== "" && owner !== NO_WALLET_DRAFT_OWNER;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function isCreateHandoff(value: unknown): value is CreateHandoff {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const source =
    v.source === "gig"
      ? nonEmpty(v.gigId) && v.jobId === "" && v.proposalId === ""
      : (v.source === undefined || v.source === "job") &&
        nonEmpty(v.jobId) &&
        nonEmpty(v.proposalId);
  return (
    source &&
    nonEmpty(v.title) &&
    nonEmpty(v.description) &&
    typeof v.paymentMode === "string" &&
    MODES.includes(v.paymentMode) &&
    typeof v.amount === "string" &&
    /^\d{1,20}$/.test(v.amount) &&
    BigInt(v.amount) > 0n &&
    nonEmpty(v.freelancerWallet)
  );
}

/** Only the known fields; anything else (e.g. mint/resolver) is dropped. */
function pickHandoff(h: CreateHandoff): CreateHandoff {
  return {
    ...(h.source === "gig" ? { source: "gig" as const, gigId: h.gigId } : {}),
    jobId: h.jobId,
    proposalId: h.proposalId,
    title: h.title,
    description: h.description,
    paymentMode: h.paymentMode,
    amount: h.amount,
    freelancerWallet: h.freelancerWallet,
  };
}

export function marketplaceHandoffKey(scope: IntentScope, employer: string): string {
  return `${MARKETPLACE_HANDOFF_PREFIX}${scope.cluster}:${scope.programId}:${employer}`;
}

/** Returns true when written. Refuses walletless owners and invalid handoffs. */
export function savePendingHandoff(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null,
  handoff: CreateHandoff,
  nowMs: number
): boolean {
  if (!storage || !validOwner(employer) || !isCreateHandoff(handoff)) return false;
  try {
    storage.setItem(
      marketplaceHandoffKey(scope, employer),
      JSON.stringify({
        version: MARKETPLACE_HANDOFF_VERSION,
        savedAt: nowMs,
        handoff: pickHandoff(handoff),
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearPendingHandoff(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null
): void {
  if (!storage || !validOwner(employer)) return;
  try {
    storage.removeItem(marketplaceHandoffKey(scope, employer));
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/** Never throws. Corrupt records are dropped. */
export function loadPendingHandoff(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null
): PendingHandoff | null {
  if (!storage || !validOwner(employer)) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(marketplaceHandoffKey(scope, employer));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; savedAt?: unknown; handoff?: unknown };
    if (parsed?.version === MARKETPLACE_HANDOFF_VERSION && isCreateHandoff(parsed.handoff)) {
      return {
        handoff: pickHandoff(parsed.handoff),
        savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
      };
    }
  } catch {
    // fall through to drop
  }
  clearPendingHandoff(storage, scope, employer);
  return null;
}

export function handoffPromptKind(input: {
  pending: boolean;
  draftExists: boolean;
  intentExists: boolean;
}): HandoffPromptKind {
  if (!input.pending) return "none";
  if (input.intentExists) return "blocked_by_intent";
  return input.draftExists ? "replace_or_keep" : "import_or_dismiss";
}

/**
 * Applies the user's explicit choice. Import is refused while a create intent
 * exists (the handoff stays pending); every other path consumes the handoff.
 * Only the handoff key is ever removed; drafts and intents are not touched.
 */
export function resolveHandoffChoice(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null,
  choice: HandoffChoice,
  params: { intentExists: boolean }
): HandoffChoiceResult {
  if (choice === "import") {
    if (params.intentExists) return { draft: null, consumed: false, blocked: true };
    const pending = loadPendingHandoff(storage, scope, employer);
    if (!pending) return { draft: null, consumed: false, blocked: false };
    clearPendingHandoff(storage, scope, employer);
    return { draft: marketplaceHandoffDraft(pending.handoff), consumed: true, blocked: false };
  }
  clearPendingHandoff(storage, scope, employer);
  return { draft: null, consumed: true, blocked: false };
}
