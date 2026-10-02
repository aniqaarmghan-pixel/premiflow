/**
 * Off-chain marketplace helpers. Escrow is still created only by the existing
 * on-chain Create flow, signed by the employer; nothing here sends a transaction.
 */
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { uiAmountToBaseUnits } from "@/lib/streampay-v2";
import {
  applyCreateDraftPatch,
  defaultCreateDraft,
  type CreateWizardDraft,
} from "@/lib/app/validation";
import type { PublicGig, PublicProfile } from "@/lib/server/marketplace/catalog-service";
import type { CreateHandoff, PublicJob, PublicProposal } from "@/lib/server/marketplace/service";

export const MARKETPLACE_NAV = [
  { href: "/marketplace", label: "Browse jobs" },
  { href: "/marketplace/gigs", label: "Browse gigs" },
  { href: "/marketplace/post", label: "Post a job" },
  { href: "/marketplace/gigs/new", label: "Offer a gig" },
  { href: "/marketplace/my-jobs", label: "My jobs" },
  { href: "/marketplace/my-proposals", label: "My proposals" },
  { href: "/marketplace/my-gigs", label: "My gigs" },
  { href: "/marketplace/profile", label: "My profile" },
] as const;

export const MARKETPLACE_COPY = {
  browseTitle: "Marketplace",
  browseSubtitle:
    "Open jobs posted by PREMIFLOW employers. Proposals are off-chain; escrow starts only when the employer creates the contract on-chain.",
  emptyOpenJobs: "No open jobs yet. Be the first to post one.",
  emptyMyJobs: "You have not posted any jobs yet.",
  emptyMyProposals: "You have not sent any proposals yet.",
  emptyProposals: "No proposals yet.",
  verifyWallet: "Verify wallet",
  verifyWalletNote: "Verify your connected wallet to see and manage your marketplace activity.",
  connectWallet: "Connect your wallet to continue.",
  selectionNote:
    "Selecting a proposal fills the job and declines the other submitted proposals. No funds move until you create and fund the contract on-chain.",
  handoffNote:
    "Opens Create contract with these terms prefilled. Review every step; you still approve the on-chain create in your wallet.",
  handoffIntentExists:
    "You have a saved Create setup. Finish or discard it in Create contract before starting a new one.",
  handoffSaved: "Terms saved. In Create contract, choose Use selected proposal to load them.",
  closedNote: "This job is closed and accepts no new proposals.",
  filledNote: "The employer selected a proposal for this job.",
} as const;

export function shortWallet(wallet: string): string {
  return wallet.length > 10 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;
}

/** Base units to a plain decimal string (no grouping), safe for form inputs. */
export function baseUnitsToUi(base: string, decimals: number): string {
  if (!/^\d+$/.test(base)) return "";
  const digits = base.replace(/^0+(?=\d)/, "");
  if (decimals <= 0) return digits;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function amountLabel(mode: PublicJob["paymentMode"]): string {
  return mode === "Hourly" ? "Hourly rate" : "Budget";
}

export function formatMarketplaceAmount(base: string): string {
  const locked = lockedCreatePayment();
  return `${baseUnitsToUi(base, locked.decimals)} ${locked.tokenName}`;
}

export const JOB_STATUS_LABELS: Record<PublicJob["status"], string> = {
  open: "Open",
  closed: "Closed",
  filled: "Filled",
};

export const PROPOSAL_STATUS_LABELS: Record<PublicProposal["status"], string> = {
  submitted: "Submitted",
  withdrawn: "Withdrawn",
  selected: "Selected",
  rejected: "Not selected",
};

export function marketplaceErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Something went wrong. Try again.";
}

/**
 * Only these fields cross from the marketplace into Create. Mint, resolver and
 * decimals stay locked to trusted config (applyCreateDraftPatch drops them).
 */
export function marketplaceHandoffPatch(
  handoff: CreateHandoff,
  decimals: number
): Partial<CreateWizardDraft> {
  const amountUi = baseUnitsToUi(handoff.amount, decimals);
  return {
    paymentMode: handoff.paymentMode,
    freelancer: handoff.freelancerWallet,
    title: handoff.title,
    description: handoff.description,
    ...(handoff.paymentMode === "Hourly" ? { hourlyRateUi: amountUi } : { totalAmountUi: amountUi }),
  };
}

export function marketplaceHandoffDraft(handoff: CreateHandoff): CreateWizardDraft {
  const base = defaultCreateDraft();
  return applyCreateDraftPatch(base, marketplaceHandoffPatch(handoff, base.decimals));
}

/* ---------- Phase 2: profiles, gigs, search ---------- */

export const GIG_COPY = {
  browseTitle: "Gigs",
  browseSubtitle:
    "Services offered by freelancers. Hiring a gig opens Create contract with the terms prefilled; escrow starts only when you create and fund it on-chain.",
  empty: "No active gigs match yet.",
  emptyMine: "You have not created any gigs yet.",
  pausedNote: "This gig is paused and hidden from the public until you resume it.",
  hireNote:
    "Opens Create contract with this gig's terms prefilled and the gig owner as freelancer. You review every step and approve the on-chain create in your wallet.",
  ownGig: "This is your gig. Employers can hire it from this page.",
  deleteConfirm: "Delete this gig permanently?",
} as const;

export const PROFILE_COPY = {
  emptyProfile: "This wallet has not set up a marketplace profile yet.",
  editTitle: "My profile",
  editSubtitle:
    "Your public marketplace profile, tied to your verified wallet. Avatars and portfolio links must be https URLs; nothing is uploaded.",
  saved: "Profile saved.",
} as const;

export const AVAILABILITY_LABELS: Record<PublicProfile["availability"], string> = {
  available: "Available",
  limited: "Limited availability",
  unavailable: "Not available",
};

export const GIG_STATUS_LABELS: Record<PublicGig["status"], string> = {
  active: "Active",
  paused: "Paused",
};

export function profileHref(wallet: string): string {
  return `/marketplace/profiles/${encodeURIComponent(wallet)}`;
}

export function gigHref(gigId: string): string {
  return `/marketplace/gigs/${encodeURIComponent(gigId)}`;
}

export type SearchFormState = {
  q: string;
  skills: string;
  mode: "" | PublicJob["paymentMode"];
  minUi: string;
  maxUi: string;
};

export const EMPTY_SEARCH: SearchFormState = { q: "", skills: "", mode: "", minUi: "", maxUi: "" };

/**
 * Builds the query string for the server-side search. Amounts are converted to
 * base units here; the server re-validates and bounds everything.
 */
export function buildSearchQuery(
  form: SearchFormState,
  decimals: number
): { ok: true; qs: string } | { ok: false; message: string } {
  const params = new URLSearchParams();
  const q = form.q.trim();
  if (q) params.set("q", q.slice(0, 80));
  const skills = form.skills
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (skills.length) params.set("skill", skills.join(","));
  if (form.mode) params.set("mode", form.mode);
  try {
    if (form.minUi.trim()) params.set("min", uiAmountToBaseUnits(form.minUi.trim(), decimals).toString());
    if (form.maxUi.trim()) params.set("max", uiAmountToBaseUnits(form.maxUi.trim(), decimals).toString());
  } catch {
    return { ok: false, message: "Enter amounts as plain numbers." };
  }
  const qs = params.toString();
  return { ok: true, qs: qs ? `?${qs}` : "" };
}

/** Comma list from a text input; the server normalizes and validates. */
export function splitSkills(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
