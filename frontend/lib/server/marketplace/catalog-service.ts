/**
 * Marketplace Phase 2: profiles, gigs and search. Off-chain only; nothing here
 * moves funds. Identity always comes from the signed wallet session, never
 * from the request body. There are deliberately no ratings or reputation.
 */
import { randomId } from "../crypto";
import { HttpError } from "../http";
import {
  GIG_LIMITS,
  isWalletAddress,
  parseSearchParams,
  validateGigInput,
  validateProfileInput,
} from "./catalog-validation";
import {
  requireMarketplaceWallet,
  toPublicJob,
  type CreateHandoff,
  type PublicJob,
} from "./service";
import type {
  GigStatus,
  JobPaymentMode,
  MarketplaceGigRecord,
  MarketplaceProfileRecord,
  MarketplaceStore,
  PortfolioItem,
  ProfileAvailability,
} from "./store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PROFILE_PAGE_JOBS_LIMIT = 50;

export type PublicProfile = {
  wallet: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string;
  bio: string;
  skills: string[];
  rateAmount: string | null;
  availability: ProfileAvailability;
  portfolio: PortfolioItem[];
  createdAt: string;
  updatedAt: string;
};

export type ProfileSummary = Pick<PublicProfile, "wallet" | "displayName" | "avatarUrl" | "headline">;

export type PublicGig = {
  id: string;
  freelancerWallet: string;
  title: string;
  description: string;
  skills: string[];
  paymentMode: JobPaymentMode;
  priceAmount: string;
  tokenMint: string;
  status: GigStatus;
  createdAt: string;
  updatedAt: string;
};

export type GigDetail = {
  gig: PublicGig;
  viewerRole: "owner" | "visitor";
  owner: ProfileSummary | null;
};

export type ProfilePage = {
  wallet: string;
  profile: PublicProfile | null;
  /** Active gigs only. */
  gigs: PublicGig[];
  /** Open jobs only. */
  openJobs: PublicJob[];
};

export function toPublicProfile(row: MarketplaceProfileRecord): PublicProfile {
  return {
    wallet: row.wallet,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    headline: row.headline,
    bio: row.bio,
    skills: [...row.skills],
    rateAmount: row.rateAmount,
    availability: row.availability,
    portfolio: row.portfolio.map((item) => ({ ...item })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPublicGig(row: MarketplaceGigRecord): PublicGig {
  return {
    id: row.id,
    freelancerWallet: row.freelancerWallet,
    title: row.title,
    description: row.description,
    skills: [...row.skills],
    paymentMode: row.paymentMode,
    priceAmount: row.priceAmount,
    tokenMint: row.tokenMint,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function gigNotFound(): HttpError {
  return new HttpError(404, "not_found", "Gig was not found.");
}

function parseGigId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw gigNotFound();
  return value.toLowerCase();
}

/* ---------------- search ---------------- */

export async function searchJobs(
  store: MarketplaceStore,
  params: URLSearchParams
): Promise<PublicJob[]> {
  return (await store.searchOpenJobs(parseSearchParams(params))).map(toPublicJob);
}

export async function searchGigs(
  store: MarketplaceStore,
  params: URLSearchParams
): Promise<GigCard[]> {
  return withSellers(store, await store.searchActiveGigs(parseSearchParams(params)));
}

/* ---------------- discovery (Phase 3) ---------------- */

/** Public seller block shown on gig cards. */
export type GigCard = PublicGig & { seller: ProfileSummary | null };

/**
 * Safe public listing fields. Bio, portfolio and timestamps other than
 * updatedAt stay on the full profile page.
 */
export type FreelancerCard = {
  wallet: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string;
  skills: string[];
  rateAmount: string | null;
  availability: ProfileAvailability;
  updatedAt: string;
};

export const SEARCH_TYPES = ["all", "jobs", "gigs", "freelancers"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
/** Per-section cap for the unified search (the explicit limit can only lower it). */
export const UNIFIED_SECTION_LIMIT = 12;

export type UnifiedSearchResult = {
  type: SearchType;
  jobs: PublicJob[];
  gigs: GigCard[];
  freelancers: FreelancerCard[];
};

export function toFreelancerCard(row: MarketplaceProfileRecord): FreelancerCard {
  return {
    wallet: row.wallet,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    headline: row.headline,
    skills: [...row.skills],
    rateAmount: row.rateAmount,
    availability: row.availability,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(row: MarketplaceProfileRecord): ProfileSummary {
  return {
    wallet: row.wallet,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    headline: row.headline,
  };
}

async function withSellers(store: MarketplaceStore, rows: MarketplaceGigRecord[]): Promise<GigCard[]> {
  const wallets = [...new Set(rows.map((row) => row.freelancerWallet))];
  const profiles = wallets.length ? await store.getProfilesByWallets(wallets) : [];
  const byWallet = new Map(profiles.map((p) => [p.wallet, toSummary(p)]));
  return rows.map((row) => ({ ...toPublicGig(row), seller: byWallet.get(row.freelancerWallet) ?? null }));
}

/** Public. ?featured=1 keeps complete profiles (name, headline, skills), newest update first. */
export async function searchFreelancers(
  store: MarketplaceStore,
  params: URLSearchParams
): Promise<FreelancerCard[]> {
  const featured = params.get("featured");
  if (featured !== null && featured !== "1" && featured !== "0") {
    throw new HttpError(400, "invalid_marketplace_input", "featured must be 1 or 0.");
  }
  const rows = await store.searchProfiles(parseSearchParams(params), { completeOnly: featured === "1" });
  return rows.map(toFreelancerCard);
}

/** Public unified search over open jobs, active gigs and public profiles. */
export async function searchMarketplace(
  store: MarketplaceStore,
  params: URLSearchParams
): Promise<UnifiedSearchResult> {
  const typeRaw = params.get("type") ?? "all";
  if (!(SEARCH_TYPES as readonly string[]).includes(typeRaw)) {
    throw new HttpError(400, "invalid_marketplace_input", "Unknown search type.");
  }
  const type = typeRaw as SearchType;
  const parsed = parseSearchParams(params);
  const filter = { ...parsed, limit: Math.min(parsed.limit, UNIFIED_SECTION_LIMIT) };
  const want = (t: SearchType) => type === "all" || type === t;
  const [jobs, gigs, profiles] = await Promise.all([
    want("jobs") ? store.searchOpenJobs(filter) : Promise.resolve([]),
    want("gigs") ? store.searchActiveGigs(filter) : Promise.resolve([]),
    want("freelancers") ? store.searchProfiles(filter, { completeOnly: false }) : Promise.resolve([]),
  ]);
  return {
    type,
    jobs: jobs.map(toPublicJob),
    gigs: await withSellers(store, gigs),
    freelancers: profiles.map(toFreelancerCard),
  };
}

/* ---------------- profiles ---------------- */

export async function getMyProfile(
  store: MarketplaceStore,
  input: { sessionWallet: string | null }
): Promise<PublicProfile | null> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const row = await store.getProfile(wallet);
  return row ? toPublicProfile(row) : null;
}

/** Owner-only by construction: the row key is the session wallet. */
export async function saveMyProfile(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; body: Record<string, unknown> },
  now = new Date()
): Promise<PublicProfile> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const fields = validateProfileInput(input.body);
  const existing = await store.getProfile(wallet);
  const saved = await store.upsertProfile({
    wallet,
    ...fields,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  return toPublicProfile(saved);
}

export async function getProfilePage(
  store: MarketplaceStore,
  input: { wallet: unknown }
): Promise<ProfilePage> {
  if (!isWalletAddress(input.wallet)) {
    throw new HttpError(404, "not_found", "Profile was not found.");
  }
  const wallet = input.wallet;
  const [profile, gigs, jobs] = await Promise.all([
    store.getProfile(wallet),
    store.listGigsByFreelancer(wallet),
    store.listJobsByEmployer(wallet),
  ]);
  return {
    wallet,
    profile: profile ? toPublicProfile(profile) : null,
    gigs: gigs.filter((gig) => gig.status === "active").map(toPublicGig),
    openJobs: jobs
      .filter((job) => job.status === "open")
      .slice(0, PROFILE_PAGE_JOBS_LIMIT)
      .map(toPublicJob),
  };
}

/* ---------------- gigs ---------------- */

export async function createGig(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; body: Record<string, unknown>; tokenMint: string },
  now = new Date()
): Promise<PublicGig> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const fields = validateGigInput(input.body);
  const existing = await store.listGigsByFreelancer(wallet);
  if (existing.length >= GIG_LIMITS.perFreelancer) {
    throw new HttpError(
      409,
      "gig_limit",
      `You can have at most ${GIG_LIMITS.perFreelancer} gigs. Delete one first.`
    );
  }
  const saved = await store.insertGig({
    id: randomId(),
    freelancerWallet: wallet,
    ...fields,
    tokenMint: input.tokenMint,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  return toPublicGig(saved);
}

async function loadOwnedGig(
  store: MarketplaceStore,
  gigId: unknown,
  wallet: string
): Promise<MarketplaceGigRecord> {
  const gig = await store.getGig(parseGigId(gigId));
  if (!gig) throw gigNotFound();
  if (gig.freelancerWallet !== wallet) {
    // Paused gigs stay invisible to everyone but the owner.
    if (gig.status !== "active") throw gigNotFound();
    throw new HttpError(403, "forbidden", "Only the gig owner can do this.");
  }
  return gig;
}

/** Owner only: edit fields, or { action: "pause" | "resume" }. */
export async function updateGig(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; gigId: unknown; body: Record<string, unknown> },
  now = new Date()
): Promise<PublicGig> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const gig = await loadOwnedGig(store, input.gigId, wallet);
  const action = input.body.action;
  const patch =
    action === "pause"
      ? { status: "paused" as const, updatedAt: now }
      : action === "resume"
        ? { status: "active" as const, updatedAt: now }
        : action === undefined
          ? { ...validateGigInput(input.body), updatedAt: now }
          : null;
  if (!patch) {
    throw new HttpError(400, "invalid_marketplace_input", "Unknown gig action.");
  }
  const saved = await store.updateGigForOwner(gig.id, wallet, patch);
  if (!saved) throw gigNotFound();
  return toPublicGig(saved);
}

export async function deleteGig(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; gigId: unknown }
): Promise<{ deleted: true }> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const gig = await loadOwnedGig(store, input.gigId, wallet);
  if (!(await store.deleteGigForOwner(gig.id, wallet))) throw gigNotFound();
  return { deleted: true };
}

export async function listMyGigs(
  store: MarketplaceStore,
  input: { sessionWallet: string | null }
): Promise<PublicGig[]> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  return (await store.listGigsByFreelancer(wallet)).map(toPublicGig);
}

export async function getGigDetail(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; gigId: unknown }
): Promise<GigDetail> {
  const gig = await store.getGig(parseGigId(input.gigId));
  if (!gig) throw gigNotFound();
  const isOwner = Boolean(input.sessionWallet) && gig.freelancerWallet === input.sessionWallet;
  if (gig.status !== "active" && !isOwner) throw gigNotFound();
  const profile = await store.getProfile(gig.freelancerWallet);
  return {
    gig: toPublicGig(gig),
    viewerRole: isOwner ? "owner" : "visitor",
    owner: profile
      ? {
          wallet: profile.wallet,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          headline: profile.headline,
        }
      : null,
  };
}

/**
 * Employer hiring a gig: prefill data for the existing Create wizard. The
 * freelancer is always the gig owner; mint, resolver and decimals are never
 * included (Create keeps them locked to trusted config).
 */
export async function getGigHandoff(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; gigId: unknown }
): Promise<CreateHandoff> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const gig = await store.getGig(parseGigId(input.gigId));
  if (!gig) throw gigNotFound();
  if (gig.freelancerWallet === wallet) {
    throw new HttpError(403, "own_gig", "You cannot hire your own gig.");
  }
  if (gig.status !== "active") throw gigNotFound();
  return {
    source: "gig",
    gigId: gig.id,
    jobId: "",
    proposalId: "",
    title: gig.title,
    description: gig.description,
    paymentMode: gig.paymentMode,
    amount: gig.priceAmount,
    freelancerWallet: gig.freelancerWallet,
  };
}
