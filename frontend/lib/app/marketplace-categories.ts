/**
 * Marketplace categories. Listings may store an explicit category slug, or
 * belong to a category when title/description/skills match keywords.
 * Pure; shared by server (search) and client (labels). Old slugs `video` and
 * `writing` are kept so existing rows migrate by label only.
 */
export const MARKETPLACE_CATEGORIES = [
  {
    slug: "development",
    label: "Development",
    blurb: "Web, mobile and backend engineering",
    keywords: ["developer", "development", "react", "next.js", "nextjs", "node", "node.js", "typescript", "javascript", "python", "frontend", "backend", "full stack", "fullstack", "api", "mobile", "ios", "android", "web app", "website"],
  },
  {
    slug: "web3",
    label: "Web3",
    blurb: "Solana, smart contracts and wallets",
    keywords: ["web3", "solana", "rust", "anchor", "smart contract", "smart contracts", "blockchain", "crypto", "defi", "nft", "dapp", "ethereum", "solidity", "spl"],
  },
  {
    slug: "design",
    label: "Design",
    blurb: "UI, UX, brand and illustration",
    keywords: ["design", "designer", "ui", "ux", "figma", "logo", "branding", "brand identity", "illustration", "graphic design", "product design"],
  },
  {
    slug: "ai",
    label: "AI",
    blurb: "Models, agents and automation",
    keywords: ["ai", "machine learning", "ml", "llm", "llms", "gpt", "chatbot", "computer vision", "nlp", "prompt engineering", "agents"],
  },
  {
    slug: "video",
    label: "Video & Animation",
    blurb: "Editing, motion and animation",
    keywords: ["video", "videos", "animation", "motion graphics", "video editing", "youtube", "after effects", "premiere", "3d", "explainer", "animator"],
  },
  {
    slug: "marketing",
    label: "Marketing",
    blurb: "Growth, SEO, social and community",
    keywords: ["marketing", "seo", "social media", "growth", "ads", "campaign", "community management", "email marketing", "content strategy", "influencer"],
  },
  {
    slug: "writing",
    label: "Writing & Translation",
    blurb: "Copy, docs, articles and translation",
    keywords: ["writing", "writer", "copywriting", "copywriter", "blog", "article", "articles", "technical writing", "translation", "translator", "documentation", "proofreading", "whitepaper"],
  },
  {
    slug: "business",
    label: "Business",
    blurb: "Strategy, operations and sales",
    keywords: ["business", "strategy", "operations", "sales", "business development", "bizdev", "okr", "process improvement"],
  },
  {
    slug: "data",
    label: "Data & Analytics",
    blurb: "Analytics, dashboards and data engineering",
    keywords: ["data", "analytics", "data science", "data engineering", "dashboard", "tableau", "power bi", "sql", "etl", "bi", "reporting"],
  },
  {
    slug: "finance",
    label: "Finance & Accounting",
    blurb: "Bookkeeping, FP&A and financial modeling",
    keywords: ["finance", "accounting", "bookkeeping", "bookkeeper", "cfo", "financial modeling", "fp&a", "tax", "payroll", "quickbooks"],
  },
  {
    slug: "support",
    label: "Customer Support",
    blurb: "Help desks, chat and customer success",
    keywords: ["customer support", "customer service", "help desk", "helpdesk", "zendesk", "intercom", "customer success", "cs agent"],
  },
  {
    slug: "admin",
    label: "Admin & Virtual Assistant",
    blurb: "Scheduling, research and admin ops",
    keywords: ["virtual assistant", "va", "admin", "administrative", "executive assistant", "scheduling", "calendar management", "data entry"],
  },
  {
    slug: "engineering",
    label: "Engineering",
    blurb: "Hardware, firmware and systems",
    keywords: ["engineering", "engineer", "firmware", "hardware", "mechanical", "electrical", "cad", "pcb", "embedded", "devops", "sre", "infrastructure"],
  },
  {
    slug: "legal",
    label: "Legal & Consulting",
    blurb: "Contracts, compliance and advisory",
    keywords: ["legal", "lawyer", "attorney", "compliance", "consulting", "consultant", "contract review", "privacy", "gdpr", "policy"],
  },
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];
export type MarketplaceCategorySlug = MarketplaceCategory["slug"];

export const CATEGORY_SLUGS: readonly MarketplaceCategorySlug[] = MARKETPLACE_CATEGORIES.map((c) => c.slug);

/** Homepage grid: eight primary categories; the rest live behind "View all". */
export const FEATURED_CATEGORY_SLUGS: readonly MarketplaceCategorySlug[] = [
  "development",
  "web3",
  "design",
  "ai",
  "video",
  "marketing",
  "writing",
  "data",
] as const;

export function isCategorySlug(value: unknown): value is MarketplaceCategorySlug {
  return typeof value === "string" && (CATEGORY_SLUGS as readonly string[]).includes(value);
}

export function categoryBySlug(slug: MarketplaceCategorySlug): MarketplaceCategory {
  return MARKETPLACE_CATEGORIES.find((c) => c.slug === slug) as MarketplaceCategory;
}

/**
 * Safe migration for stored / query values. Known slugs pass through; unknown
 * strings map to null so filters fall back to keyword derivation.
 */
export function normalizeCategorySlug(value: unknown): MarketplaceCategorySlug | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim().toLowerCase();
  if (isCategorySlug(raw)) return raw;
  // Legacy display labels people may have typed into URLs.
  if (raw === "video & animation" || raw === "video-and-animation") return "video";
  if (raw === "writing & translation" || raw === "writing-and-translation") return "writing";
  if (raw === "data & analytics" || raw === "data-and-analytics") return "data";
  if (raw === "finance & accounting" || raw === "finance-and-accounting") return "finance";
  if (raw === "customer support") return "support";
  if (raw === "admin & virtual assistant" || raw === "admin-and-virtual-assistant") return "admin";
  if (raw === "legal & consulting" || raw === "legal-and-consulting") return "legal";
  return null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word, case-insensitive pattern built only from the constant keyword
 * list (never from user input). The same string works in JavaScript (flag "i")
 * and in PostgreSQL `~*`, where it is sent as a bound parameter.
 */
export function categoryPattern(slug: MarketplaceCategorySlug): string {
  const words = categoryBySlug(slug).keywords.map(escapeRegex).join("|");
  return `(^|[^a-z0-9])(${words})([^a-z0-9]|$)`;
}

export function matchesCategory(text: string, slug: MarketplaceCategorySlug): boolean {
  return new RegExp(categoryPattern(slug), "i").test(text);
}

/** Categories mentioned by a listing, in display order. */
export function categorizeText(text: string): MarketplaceCategorySlug[] {
  return CATEGORY_SLUGS.filter((slug) => matchesCategory(text, slug));
}

/** Stable 0–11 seed from a title so same-category covers are not identical. */
export function coverSeedFromTitle(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i += 1) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return h % 12;
}
