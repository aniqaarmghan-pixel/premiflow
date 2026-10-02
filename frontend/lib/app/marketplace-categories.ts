/**
 * Marketplace categories. There is no category column: a job, gig or profile
 * belongs to a category when its title, description, headline, bio or skills
 * mention one of the category keywords as a whole word. Pure; shared by the
 * server (search) and the client (labels).
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
    blurb: "Models, agents, data and automation",
    keywords: ["ai", "machine learning", "ml", "llm", "llms", "gpt", "data science", "chatbot", "computer vision", "nlp", "prompt engineering", "automation", "agents"],
  },
  {
    slug: "video",
    label: "Video",
    blurb: "Editing, motion and animation",
    keywords: ["video", "videos", "animation", "motion graphics", "video editing", "youtube", "after effects", "premiere", "3d", "explainer"],
  },
  {
    slug: "marketing",
    label: "Marketing",
    blurb: "Growth, SEO, social and community",
    keywords: ["marketing", "seo", "social media", "growth", "ads", "campaign", "community management", "email marketing", "content strategy", "influencer"],
  },
  {
    slug: "writing",
    label: "Writing",
    blurb: "Copy, docs, articles and translation",
    keywords: ["writing", "writer", "copywriting", "copywriter", "blog", "article", "articles", "technical writing", "translation", "documentation", "proofreading", "whitepaper"],
  },
  {
    slug: "business",
    label: "Business",
    blurb: "Strategy, operations and finance",
    keywords: ["business", "consulting", "consultant", "strategy", "finance", "accounting", "legal", "project management", "operations", "sales", "virtual assistant", "tokenomics"],
  },
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];
export type MarketplaceCategorySlug = MarketplaceCategory["slug"];

export const CATEGORY_SLUGS: readonly MarketplaceCategorySlug[] = MARKETPLACE_CATEGORIES.map((c) => c.slug);

export function isCategorySlug(value: unknown): value is MarketplaceCategorySlug {
  return typeof value === "string" && (CATEGORY_SLUGS as readonly string[]).includes(value);
}

export function categoryBySlug(slug: MarketplaceCategorySlug): MarketplaceCategory {
  return MARKETPLACE_CATEGORIES.find((c) => c.slug === slug) as MarketplaceCategory;
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
