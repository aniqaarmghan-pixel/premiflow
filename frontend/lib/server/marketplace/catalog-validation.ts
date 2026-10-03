/**
 * Validation for Marketplace profiles, gigs and search. Pure functions, no I/O.
 * Every text field is trimmed, stripped of control characters and bounded.
 */
import { PublicKey } from "@solana/web3.js";

import {
  isCategorySlug,
  matchesCategory,
  type MarketplaceCategorySlug,
} from "@/lib/app/marketplace-categories";

import { HttpError } from "../http";
import {
  JOB_PAYMENT_MODES,
  MARKETPLACE_SORTS,
  PACKAGE_TIERS,
  type GigPackage,
  type MarketplaceProfileRecord,
  type MarketplaceSort,
  PROFILE_AVAILABILITY,
  type JobPaymentMode,
  type MarketplaceSearchFilter,
  type PortfolioItem,
  type ProfileAvailability,
} from "./store";
import { normalizeGigVideoUrl } from "../../app/video-embed";

export const PROFILE_LIMITS = {
  displayName: 60,
  headline: 120,
  bio: 2_000,
  skills: 15,
  portfolio: 6,
  portfolioTitle: 80,
  portfolioDescription: 300,
  url: 500,
} as const;

export const GIG_LIMITS = { title: 120, description: 4_000, skills: 10, perFreelancer: 20 } as const;

export const SEARCH_LIMITS = { text: 80, skills: 5, maxLimit: 50 } as const;

export const JOB_SKILLS_MAX = 10;

export const GIG_MEDIA_LIMITS = {
  images: 6,
  deliveryDaysMax: 365,
  revisionsMax: 20,
  packages: 3,
  packageTitle: 60,
  packageScope: 300,
} as const;


function boundedInt(value: unknown, field: string, min: number, max: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw invalid(`${field} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

export function parseDeliveryDays(value: unknown, field = "Delivery days"): number | null {
  if (value === undefined || value === null || value === "") return null;
  return boundedInt(value, field, 1, GIG_MEDIA_LIMITS.deliveryDaysMax);
}

/** Gallery images: https URLs only (validated, never fetched or proxied), deduped, bounded. */
export function parseGigMedia(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw invalid("Gallery must be a list of image URLs.");
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim() === "") continue;
    const url = validateHttpsUrl(entry, "Gallery image", { required: true }) as string;
    if (!out.includes(url)) out.push(url);
  }
  if (out.length > GIG_MEDIA_LIMITS.images) throw invalid(`Add at most ${GIG_MEDIA_LIMITS.images} gallery images.`);
  return out;
}

/**
 * Direct https video file (mp4/webm/ogg/mov) or an allowlisted YouTube /
 * Vimeo page, normalized to a canonical URL. Shared with the browser via
 * lib/app/video-embed.ts so client and server rules never drift.
 */
export function parseVideoUrl(value: unknown): string | null {
  const url = validateHttpsUrl(value, "Video URL");
  if (url === null) return null;
  const normalized = normalizeGigVideoUrl(url);
  if (!normalized) {
    throw invalid(
      "Video URL must be a YouTube or Vimeo video link, or link directly to an .mp4, .webm, .ogg or .mov file."
    );
  }
  return normalized;
}

/** 0-3 packages, one per tier, returned in Basic, Standard, Premium order. */
export function parsePackages(value: unknown): GigPackage[] {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw invalid("Packages must be a list.");
  if (value.length > GIG_MEDIA_LIMITS.packages) throw invalid("Add at most three packages.");
  const out: GigPackage[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid("Each package must be an object.");
    const p = raw as Record<string, unknown>;
    if (typeof p.tier !== "string" || !(PACKAGE_TIERS as readonly string[]).includes(p.tier)) {
      throw invalid("Package tier must be basic, standard or premium.");
    }
    const tier = p.tier as GigPackage["tier"];
    if (out.some((x) => x.tier === tier)) throw invalid("Each package tier can be used once.");
    out.push({
      tier,
      title: cleanText(p.title, "Package title", GIG_MEDIA_LIMITS.packageTitle),
      description: cleanText(p.description, "Package scope", GIG_MEDIA_LIMITS.packageScope, {
        required: true,
        multiline: true,
      }),
      priceAmount: requiredBaseUnits(p.priceAmount, "Package price"),
      deliveryDays: boundedInt(p.deliveryDays, "Package delivery days", 1, GIG_MEDIA_LIMITS.deliveryDaysMax),
      revisions:
        p.revisions === undefined || p.revisions === null || p.revisions === ""
          ? 0
          : boundedInt(p.revisions, "Package revisions", 0, GIG_MEDIA_LIMITS.revisionsMax),
    });
  }
  return out.sort((a, b) => PACKAGE_TIERS.indexOf(a.tier) - PACKAGE_TIERS.indexOf(b.tier));
}

/** Optional listing category: empty/null means "derive from keywords". */
export function parseCategory(value: unknown): MarketplaceCategorySlug | null {
  if (value === undefined || value === null || value === "") return null;
  if (!isCategorySlug(value)) throw invalid("Choose a category from the list.");
  return value;
}

const SKILL_MAX = 32;
const U64_MAX = 18_446_744_073_709_551_615n;
// Control characters except tab, newline and carriage return.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SKILL = /^[a-z0-9][a-z0-9 +#.-]*$/;

function invalid(message: string): HttpError {
  return new HttpError(400, "invalid_marketplace_input", message);
}

export function cleanText(
  value: unknown,
  field: string,
  max: number,
  opts: { required?: boolean; multiline?: boolean } = {}
): string {
  if (value === undefined || value === null) {
    if (opts.required) throw invalid(`${field} is required.`);
    return "";
  }
  if (typeof value !== "string") throw invalid(`${field} must be text.`);
  let text = value.replace(CONTROL, "");
  if (!opts.multiline) text = text.replace(/[\r\n\t]+/g, " ");
  text = text.trim();
  if (opts.required && !text) throw invalid(`${field} is required.`);
  if (text.length > max) throw invalid(`${field} must be at most ${max} characters.`);
  return text;
}

/** Lowercase, single-spaced skill tag, or null when unusable. */
export function normalizeSkill(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const skill = raw.replace(CONTROL, "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!skill || skill.length > SKILL_MAX || !SKILL.test(skill)) return null;
  return skill;
}

/** Strict: an array or comma list of skills; any invalid entry is rejected. */
export function parseSkills(value: unknown, max: number): string[] {
  if (value === undefined || value === null || value === "") return [];
  const list = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(list)) throw invalid("Skills must be a list.");
  const out: string[] = [];
  for (const entry of list) {
    if (typeof entry === "string" && entry.trim() === "") continue;
    const skill = normalizeSkill(entry);
    if (!skill) {
      throw invalid(
        `Each skill must be 1-${SKILL_MAX} characters: letters, numbers, spaces, + # . or -.`
      );
    }
    if (!out.includes(skill)) out.push(skill);
  }
  if (out.length > max) throw invalid(`Add at most ${max} skills.`);
  return out;
}

/** https only, no credentials, real-looking hostname. Returns the normalized URL. */
export function validateHttpsUrl(
  value: unknown,
  field: string,
  opts: { required?: boolean } = {}
): string | null {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    if (opts.required) throw invalid(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw invalid(`${field} must be a URL.`);
  const raw = value.trim();
  if (raw.length > PROFILE_LIMITS.url || /[\s\u0000-\u001F\u007F]/.test(raw)) {
    throw invalid(`${field} must be a valid https URL.`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid(`${field} must be a valid https URL.`);
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost")
  ) {
    throw invalid(`${field} must be a valid https URL.`);
  }
  return url.toString();
}

export function optionalBaseUnits(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredBaseUnits(value, field);
}

export function requiredBaseUnits(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) {
    throw invalid(`${field} must be a whole number of token base units.`);
  }
  const amount = BigInt(value);
  if (amount <= 0n) throw invalid(`${field} must be greater than zero.`);
  if (amount > U64_MAX) throw invalid(`${field} is too large.`);
  return amount.toString();
}

export function parsePaymentMode(value: unknown): JobPaymentMode {
  if (typeof value === "string" && (JOB_PAYMENT_MODES as readonly string[]).includes(value)) {
    return value as JobPaymentMode;
  }
  throw invalid("Payment mode must be Fixed, Milestone, Streaming, or Hourly.");
}

export function parseAvailability(value: unknown): ProfileAvailability {
  if (value === undefined || value === null || value === "") return "available";
  if (typeof value === "string" && (PROFILE_AVAILABILITY as readonly string[]).includes(value)) {
    return value as ProfileAvailability;
  }
  throw invalid("Availability must be available, limited, or unavailable.");
}

export function parsePortfolio(value: unknown): PortfolioItem[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid("Portfolio must be a list.");
  if (value.length > PROFILE_LIMITS.portfolio) {
    throw invalid(`Add at most ${PROFILE_LIMITS.portfolio} portfolio items.`);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw invalid(`Portfolio item ${index + 1} is invalid.`);
    const entry = item as Record<string, unknown>;
    const n = `Portfolio item ${index + 1}`;
    return {
      title: cleanText(entry.title, `${n} title`, PROFILE_LIMITS.portfolioTitle, { required: true }),
      url: validateHttpsUrl(entry.url, `${n} link`, { required: true }) as string,
      description: cleanText(
        entry.description,
        `${n} description`,
        PROFILE_LIMITS.portfolioDescription,
        { multiline: true }
      ),
    };
  });
}

export type ProfileInput = {
  displayName: string;
  avatarUrl: string | null;
  headline: string;
  bio: string;
  skills: string[];
  rateAmount: string | null;
  availability: ProfileAvailability;
  portfolio: PortfolioItem[];
};

/** Only known fields are read; any wallet/owner field in the body is ignored. */
export function validateProfileInput(body: Record<string, unknown>): ProfileInput {
  return {
    displayName: cleanText(body.displayName, "Display name", PROFILE_LIMITS.displayName),
    avatarUrl: validateHttpsUrl(body.avatarUrl, "Avatar URL"),
    headline: cleanText(body.headline, "Headline", PROFILE_LIMITS.headline),
    bio: cleanText(body.bio, "Bio", PROFILE_LIMITS.bio, { multiline: true }),
    skills: parseSkills(body.skills, PROFILE_LIMITS.skills),
    rateAmount: optionalBaseUnits(body.rateAmount, "Rate"),
    availability: parseAvailability(body.availability),
    portfolio: parsePortfolio(body.portfolio),
  };
}

export type GigInput = {
  title: string;
  description: string;
  skills: string[];
  paymentMode: JobPaymentMode;
  priceAmount: string;
  category: MarketplaceCategorySlug | null;
  coverUrl: string | null;
  media: string[];
  videoUrl: string | null;
  deliveryDays: number | null;
  packages: GigPackage[];
};

/**
 * Either packages (the listing price becomes the lowest package price) or the
 * legacy single price is required.
 */
export function validateGigInput(body: Record<string, unknown>): GigInput {
  const packages = parsePackages(body.packages);
  const lowest = packages.reduce<GigPackage | null>(
    (min, p) => (!min || BigInt(p.priceAmount) < BigInt(min.priceAmount) ? p : min),
    null
  );
  const fastest = packages.reduce<number | null>((min, p) => (min === null || p.deliveryDays < min ? p.deliveryDays : min), null);
  return {
    title: cleanText(body.title, "Title", GIG_LIMITS.title, { required: true }),
    description: cleanText(body.description, "Description", GIG_LIMITS.description, {
      required: true,
      multiline: true,
    }),
    skills: parseSkills(body.skills, GIG_LIMITS.skills),
    paymentMode: parsePaymentMode(body.paymentMode),
    priceAmount: lowest ? lowest.priceAmount : requiredBaseUnits(body.priceAmount, "Price"),
    category: parseCategory(body.category),
    coverUrl: validateHttpsUrl(body.coverUrl, "Cover image"),
    media: parseGigMedia(body.media),
    videoUrl: parseVideoUrl(body.videoUrl),
    deliveryDays: parseDeliveryDays(body.deliveryDays) ?? fastest,
    packages,
  };
}

/** Escapes LIKE wildcards; the value is always sent as a bound parameter. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function searchAmount(value: string | null, field: string): string | null {
  if (value === null || value.trim() === "") return null;
  const raw = value.trim();
  if (!/^\d{1,20}$/.test(raw) || BigInt(raw) > U64_MAX) {
    throw invalid(`${field} must be a whole number of token base units.`);
  }
  return BigInt(raw).toString();
}

/** Lenient for text/skills (truncate, drop unusable), strict for mode and amounts. */
export function parseSearchParams(params: URLSearchParams): MarketplaceSearchFilter {
  const rawText = (params.get("q") ?? "").replace(CONTROL, "").replace(/\s+/g, " ").trim();
  const text = rawText ? rawText.slice(0, SEARCH_LIMITS.text) : null;

  const skills: string[] = [];
  for (const entry of params.getAll("skill").flatMap((v) => v.split(","))) {
    const skill = normalizeSkill(entry);
    if (skill && !skills.includes(skill)) skills.push(skill);
    if (skills.length >= SEARCH_LIMITS.skills) break;
  }

  const modeRaw = params.get("mode");
  const paymentMode = modeRaw ? parsePaymentMode(modeRaw) : null;

  const minAmount = searchAmount(params.get("min"), "Minimum amount");
  const maxAmount = searchAmount(params.get("max"), "Maximum amount");
  if (minAmount && maxAmount && BigInt(minAmount) > BigInt(maxAmount)) {
    throw invalid("Minimum amount cannot exceed maximum amount.");
  }

  const categoryRaw = params.get("category");
  let category: MarketplaceSearchFilter["category"] = null;
  if (categoryRaw) {
    if (!isCategorySlug(categoryRaw)) throw invalid("Unknown category.");
    category = categoryRaw;
  }

  const sortRaw = params.get("sort");
  let sort: MarketplaceSort = "newest";
  if (sortRaw) {
    if (!(MARKETPLACE_SORTS as readonly string[]).includes(sortRaw)) throw invalid("Unknown sort order.");
    sort = sortRaw as MarketplaceSort;
  }

  const limitRaw = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), SEARCH_LIMITS.maxLimit)
    : SEARCH_LIMITS.maxLimit;

  return { text, skills, paymentMode, minAmount, maxAmount, category, sort, limit };
}

/** Reference matcher (memory store + tests); mirrors the SQL conditions. */
export function matchesSearch(
  row: {
    title: string;
    description: string;
    paymentMode: JobPaymentMode;
    amount: string;
    skills: string[] | null;
    /** Jobs only: explicit category wins over keyword derivation. */
    category?: MarketplaceCategorySlug | null;
    /** Jobs only: rows without skills (pre-0010) match skills by keyword. */
    skillFallback?: boolean;
  },
  filter: MarketplaceSearchFilter
): boolean {
  const haystack = `${row.title}\n${row.description}`.toLowerCase();
  if (filter.text && !haystack.includes(filter.text.toLowerCase())) return false;
  const useKeywordSkills = !row.skills || (row.skillFallback === true && row.skills.length === 0);
  for (const skill of filter.skills) {
    const ok = useKeywordSkills ? haystack.includes(skill) : (row.skills ?? []).includes(skill);
    if (!ok) return false;
  }
  if (filter.paymentMode && row.paymentMode !== filter.paymentMode) return false;
  if (filter.category) {
    const ok = row.category
      ? row.category === filter.category
      : matchesCategory(`${row.title} ${row.description} ${(row.skills ?? []).join(" ")}`, filter.category);
    if (!ok) return false;
  }
  const amount = BigInt(row.amount);
  if (filter.minAmount && amount < BigInt(filter.minAmount)) return false;
  if (filter.maxAmount && amount > BigInt(filter.maxAmount)) return false;
  return true;
}

export function isWalletAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

/** Reference matcher for the public profile listing (memory store + tests). */
export function matchesProfileSearch(
  row: MarketplaceProfileRecord,
  filter: MarketplaceSearchFilter,
  opts: { completeOnly: boolean }
): boolean {
  if (opts.completeOnly && (!row.displayName || !row.headline || row.skills.length === 0)) return false;
  const haystack = `${row.displayName}\n${row.headline}\n${row.bio}\n${row.skills.join(" ")}`.toLowerCase();
  if (filter.text && !haystack.includes(filter.text.toLowerCase())) return false;
  for (const skill of filter.skills) {
    if (!row.skills.includes(skill)) return false;
  }
  if (
    filter.category &&
    !matchesCategory(`${row.headline} ${row.bio} ${row.skills.join(" ")}`, filter.category)
  ) {
    return false;
  }
  if (filter.minAmount || filter.maxAmount) {
    if (!row.rateAmount) return false;
    const rate = BigInt(row.rateAmount);
    if (filter.minAmount && rate < BigInt(filter.minAmount)) return false;
    if (filter.maxAmount && rate > BigInt(filter.maxAmount)) return false;
  }
  return true;
}

/** Reference ordering shared by the memory store; SQL mirrors it. */
export function compareForSort<T extends { createdAt: Date; id: string }>(
  sort: MarketplaceSort,
  amountOf: (row: T) => string | null
): (a: T, b: T) => number {
  const newest = (a: T, b: T) =>
    b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  if (sort === "newest") return newest;
  const dir = sort === "amount_asc" ? 1 : -1;
  return (a, b) => {
    const x = amountOf(a);
    const y = amountOf(b);
    if (x === null || y === null) return x === y ? newest(a, b) : x === null ? 1 : -1;
    const diff = BigInt(x) - BigInt(y);
    return diff === 0n ? newest(a, b) : diff > 0n ? dir : -dir;
  };
}
