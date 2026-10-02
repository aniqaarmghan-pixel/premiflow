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
import {
  MARKETPLACE_CATEGORIES,
  categorizeText,
  type MarketplaceCategorySlug,
} from "@/lib/app/marketplace-categories";
import type { PublicGig, PublicProfile } from "@/lib/server/marketplace/catalog-service";
import type { GigPackage, MarketplaceSort } from "@/lib/server/marketplace/store";
import type { CreateHandoff, PublicJob, PublicProposal } from "@/lib/server/marketplace/service";

/** Public discovery sections. */
export const MARKETPLACE_DISCOVER_NAV = [
  { href: "/marketplace", label: "Home" },
  { href: "/marketplace/jobs", label: "Jobs" },
  { href: "/marketplace/gigs", label: "Gigs" },
  { href: "/marketplace/freelancers", label: "Freelancers" },
] as const;

/** Signed-in management pages (unchanged destinations). */
export const MARKETPLACE_MANAGE_NAV = [
  { href: "/marketplace/post", label: "Post a job" },
  { href: "/marketplace/gigs/new", label: "Offer a gig" },
  { href: "/marketplace/my-jobs", label: "My jobs" },
  { href: "/marketplace/my-proposals", label: "My proposals" },
  { href: "/marketplace/my-gigs", label: "My gigs" },
  { href: "/marketplace/profile", label: "My profile" },
  { href: "/marketplace/saved", label: "Saved" },
] as const;

export const MARKETPLACE_NAV = [...MARKETPLACE_DISCOVER_NAV, ...MARKETPLACE_MANAGE_NAV] as const;

const MANAGE_HREFS: readonly string[] = MARKETPLACE_MANAGE_NAV.map((item) => item.href);

/**
 * Exactly one discovery tab is active for detail pages (job, gig, profile);
 * management pages and Home only match exactly.
 */
export function isMarketplaceNavActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === href) return true;
  if (href === "/marketplace" || MANAGE_HREFS.includes(href) || MANAGE_HREFS.includes(path)) return false;
  if (href === "/marketplace/freelancers") return path.startsWith("/marketplace/profiles/");
  return path.startsWith(`${href}/`);
}

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
  category: "" | MarketplaceCategorySlug;
  sort: MarketplaceSort;
};

export const EMPTY_SEARCH: SearchFormState = {
  q: "",
  skills: "",
  mode: "",
  minUi: "",
  maxUi: "",
  category: "",
  sort: "newest",
};

export const SORT_OPTIONS: ReadonlyArray<{ value: MarketplaceSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "amount_asc", label: "Price: low to high" },
  { value: "amount_desc", label: "Price: high to low" },
];

const MODES: readonly string[] = ["Fixed", "Milestone", "Streaming", "Hourly"];
const SORTS: readonly string[] = ["newest", "amount_asc", "amount_desc"];

/** Prefill the filter form from a URL; unknown values are dropped (server re-validates). */
export function searchFormFromParams(
  params: { get(name: string): string | null },
  decimals: number,
  isCategory: (value: string) => value is MarketplaceCategorySlug
): SearchFormState {
  const toUi = (value: string | null) =>
    value && /^\d{1,20}$/.test(value) ? baseUnitsToUi(value, decimals) : "";
  const mode = params.get("mode") ?? "";
  const category = params.get("category") ?? "";
  const sort = params.get("sort") ?? "newest";
  return {
    q: (params.get("q") ?? "").slice(0, 80),
    skills: (params.get("skill") ?? "").slice(0, 200),
    mode: MODES.includes(mode) ? (mode as SearchFormState["mode"]) : "",
    minUi: toUi(params.get("min")),
    maxUi: toUi(params.get("max")),
    category: isCategory(category) ? category : "",
    sort: SORTS.includes(sort) ? (sort as MarketplaceSort) : "newest",
  };
}

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
  if (form.category) params.set("category", form.category);
  if (form.sort && form.sort !== "newest") params.set("sort", form.sort);
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

/* ---------- Phase 3: discovery copy ---------- */

/** How each payment mode is delivered and paid through PREMIFLOW escrow. */
export const DELIVERY_TERMS: Record<PublicJob["paymentMode"], string> = {
  Fixed: "One delivery, paid from escrow on approval",
  Milestone: "Delivered in milestones, each approved from escrow",
  Streaming: "Paid continuously from escrow while work is active",
  Hourly: "Hours logged and approved, paid from escrow",
};

export const HOW_IT_WORKS = [
  { title: "Discover", body: "Search jobs, gigs and freelancer profiles by skill, category and budget." },
  { title: "Agree", body: "Pick a proposal or a gig. The terms prefill Create contract for you to review." },
  { title: "Escrow", body: "The employer creates and funds the contract on-chain from their own wallet." },
  { title: "Deliver", body: "The freelancer submits work against the contract's milestones, hours or stream." },
  { title: "Get paid", body: "Approved work is released from escrow to the freelancer's wallet." },
] as const;

export const TRUST_POINTS = [
  {
    title: "Escrow held by the program",
    body: "Contract funds sit in the PREMIFLOW Solana program's escrow for that contract, not in a PREMIFLOW-controlled wallet.",
  },
  {
    title: "You sign every step",
    body: "Creating, funding, approving and releasing are wallet-signed transactions you can verify on-chain.",
  },
  {
    title: "Nothing moves before escrow",
    body: "Listings, proposals and profiles are off-chain. No funds move until an employer creates and funds a contract.",
  },
  {
    title: "A path for disputes",
    body: "Disputes go to the Resolution Center for review by the contract's designated resolver. Outcomes are not guaranteed.",
  },
] as const;

export const FEATURED_NOTE =
  "Recently updated profiles with a name, headline and skills. Not ranked, reviewed or endorsed.";

export function searchPageHref(params: Record<string, string>): string {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== "")
  ).toString();
  return qs ? `/marketplace/search?${qs}` : "/marketplace/search";
}

/** Explicit job category, else the first keyword-derived one (legacy rows). */
export function jobCategory(
  job: Pick<PublicJob, "title" | "description" | "skills" | "category">
): MarketplaceCategorySlug | null {
  if (job.category) return job.category;
  const derived = categorizeText(`${job.title} ${job.description} ${(job.skills ?? []).join(" ")}`);
  return derived.length > 0 ? derived[0] : null;
}

export function categoryLabelOf(slug: MarketplaceCategorySlug): string {
  return MARKETPLACE_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

export const PACKAGE_TIER_LABELS: Record<GigPackage["tier"], string> = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
};

export function gigDeliveryLabel(days: number | null | undefined): string | null {
  return typeof days === "number" && days > 0 ? `${days}-day delivery` : null;
}

/** Card price: "From X" when several packages exist, else the single price. */
export function gigPriceLabel(gig: Pick<PublicGig, "paymentMode" | "priceAmount" | "packages">): string {
  const packages = gig.packages ?? [];
  const amount = formatMarketplaceAmount(gig.priceAmount);
  return packages.length > 1 ? `From ${amount}` : `${amountLabel(gig.paymentMode)} ${amount}`;
}

/** Explicit gig category, else keyword derivation (legacy gigs). */
export function gigCategory(
  gig: Pick<PublicGig, "title" | "description" | "skills"> & { category?: MarketplaceCategorySlug | null }
): MarketplaceCategorySlug | null {
  if (gig.category) return gig.category;
  const derived = categorizeText(`${gig.title} ${gig.description} ${gig.skills.join(" ")}`);
  return derived.length > 0 ? derived[0] : null;
}

/** Gallery textarea: one https URL per line, blank lines dropped. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
