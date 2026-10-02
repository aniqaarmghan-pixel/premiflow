/**
 * Off-chain marketplace helpers. Escrow is still created only by the existing
 * on-chain Create flow, signed by the employer; nothing here sends a transaction.
 */
import { lockedCreatePayment } from "@/lib/app/premiflow";
import {
  applyCreateDraftPatch,
  defaultCreateDraft,
  type CreateWizardDraft,
} from "@/lib/app/validation";
import type { CreateHandoff, PublicJob, PublicProposal } from "@/lib/server/marketplace/service";

export const MARKETPLACE_NAV = [
  { href: "/marketplace", label: "Browse jobs" },
  { href: "/marketplace/post", label: "Post a job" },
  { href: "/marketplace/my-jobs", label: "My jobs" },
  { href: "/marketplace/my-proposals", label: "My proposals" },
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
