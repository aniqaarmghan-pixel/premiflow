/**
 * Title-specific service cover selection (display only). Picks a product
 * mockup kind from the gig title first, then its category, and derives a
 * deterministic per-listing seed so neighbouring cards do not look identical.
 * Seller-uploaded covers always win; this is only the fallback artwork.
 */
import type { MarketplaceCategorySlug } from "@/lib/app/marketplace-categories";

export type GigCoverKind =
  | "audit"
  | "dashboard"
  | "mobile"
  | "video"
  | "document"
  | "campaign"
  | "ai"
  | "analytics"
  | "board";

/** Ordered: the first matching rule wins. */
const TITLE_RULES: ReadonlyArray<readonly [GigCoverKind, RegExp]> = [
  ["video", /\b(video|videos|youtube|explainer|animation|animated|motion|edit(ing)?|footage|reel|trailer)\b/i],
  ["ai", /\b(ai|llm|llms|gpt|chatbot|assistant|agent|agents|retrieval|rag|machine learning|ml|model)\b/i],
  ["analytics", /\b(analytics|sql|python|reports?|reporting|data|metrics|bi|etl|notebook)\b/i],
  ["audit", /\b(anchor|rust|audit|review|test suite|tests|smart contracts?|program|escrow|security)\b/i],
  ["mobile", /\b(react native|mobile|ios|android|figma|onboarding|ui|ux|prototype screens?)\b/i],
  ["dashboard", /\b(next\.?js|dashboard|web app|website|site|landing|frontend|react|admin panel|portal)\b/i],
  ["mobile", /\b(wallet|app)\b/i],
  ["document", /\b(write|writing|documentation|docs|article|articles|blog|memo|policy|whitepaper|guide|quickstart|copy|translation|newsletter)\b/i],
  ["campaign", /\b(marketing|community|social|discord|growth|seo|ads|campaign|influencer|launch)\b/i],
  ["board", /\b(project management|sprint|sprints|roadmap|operations|strategy|planning|virtual assistant|support)\b/i],
];

const CATEGORY_KIND: Record<MarketplaceCategorySlug | "none", GigCoverKind> = {
  development: "dashboard",
  web3: "audit",
  design: "mobile",
  ai: "ai",
  video: "video",
  marketing: "campaign",
  writing: "document",
  business: "board",
  data: "analytics",
  finance: "analytics",
  support: "board",
  admin: "board",
  engineering: "dashboard",
  legal: "document",
  none: "board",
};

export function gigCoverKind(
  title: string,
  category: MarketplaceCategorySlug | "none" | null | undefined
): GigCoverKind {
  const text = title ?? "";
  for (const [kind, re] of TITLE_RULES) {
    if (re.test(text)) return kind;
  }
  return CATEGORY_KIND[category ?? "none"] ?? "board";
}

/** FNV-1a 32-bit hash; stable across server and client renders. */
export function gigCoverSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32) for layout details. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Short title snippet rendered inside the mockup. */
export function gigCoverSnippet(title: string, max = 34): string {
  const clean = (title ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}\u2026`;
}
