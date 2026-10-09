import { normalizeGigVideoUrl } from "./video-embed";

/**
 * Optional marketplace hero media. No third-party video is bundled: leave
 * MARKETPLACE_HERO_VIDEO null for the gradient hero, or point it at a video you
 * own (a /public path or an https URL). The video is decorative, muted, loops,
 * is skipped on small screens and when the user prefers reduced motion.
 */
export type HeroVideoConfig = {
  /** "/media/hero.mp4" (self-hosted) or "https://..." */
  src: string;
  /** Optional still frame shown before playback. */
  poster?: string;
  /** MIME type, e.g. "video/mp4". */
  type?: string;
};

export const MARKETPLACE_HERO_VIDEO: HeroVideoConfig | null = null;

/** Media query that must match before the hero video is rendered at all. */
export const HERO_VIDEO_MEDIA_QUERY = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";

/** Same-origin absolute path or https URL only (no data:, javascript:, http:, protocol-relative). */
export function isSafeHeroMediaSrc(src: unknown): src is string {
  if (typeof src !== "string" || src.length === 0 || src.length > 500) return false;
  if (src.startsWith("/")) return !src.startsWith("//") && !src.includes("\\");
  try {
    const url = new URL(src);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function resolveHeroVideo(config: HeroVideoConfig | null): HeroVideoConfig | null {
  if (!config || !isSafeHeroMediaSrc(config.src)) return null;
  if (config.poster !== undefined && !isSafeHeroMediaSrc(config.poster)) {
    return { src: config.src, type: config.type };
  }
  return config;
}

export { parseGigVideo, type GigVideo } from "./video-embed";

/**
 * Normalized gig video URL (direct https file or allowlisted YouTube / Vimeo
 * page), or null so callers hide play affordances instead of a broken player.
 * Same rules as the gig API (see lib/app/video-embed.ts).
 */
export function playableVideoUrl(value: unknown): string | null {
  return normalizeGigVideoUrl(value);
}

/**
 * Optional landing explainer video (modal). Null = thumbnail + placeholder
 * modal with PREMIFLOW product points (no fabricated stock footage).
 * Point at a self-hosted "/media/explainer.mp4" or https URL when ready.
 */
export type ExplainerVideoConfig = {
  src: string;
  poster?: string;
  type?: string;
};

function explainerVideoFromEnv(rawSrc: string | undefined, rawPoster: string | undefined): ExplainerVideoConfig | null {
  const src = (rawSrc ?? "").trim();
  if (!src) return null;
  const type = /\.webm(?:[?#]|$)/i.test(src) ? "video/webm" : "video/mp4";
  const poster = (rawPoster ?? "").trim();
  return poster ? { src, poster, type } : { src, type };
}

/**
 * Set NEXT_PUBLIC_MARKETPLACE_EXPLAINER_VIDEO (or MARKETPLACE_EXPLAINER_VIDEO,
 * exposed via next.config) to e.g. "/media/premiflow-demo.mp4" after adding
 * public/media/premiflow-demo.mp4. Unset = interactive product preview.
 * Optional poster: NEXT_PUBLIC_MARKETPLACE_EXPLAINER_POSTER / MARKETPLACE_EXPLAINER_POSTER.
 */
export const MARKETPLACE_EXPLAINER_VIDEO: ExplainerVideoConfig | null = explainerVideoFromEnv(
  process.env.NEXT_PUBLIC_MARKETPLACE_EXPLAINER_VIDEO || process.env.MARKETPLACE_EXPLAINER_VIDEO,
  process.env.NEXT_PUBLIC_MARKETPLACE_EXPLAINER_POSTER || process.env.MARKETPLACE_EXPLAINER_POSTER
);

export function resolveExplainerVideo(
  config: ExplainerVideoConfig | null
): ExplainerVideoConfig | null {
  return resolveHeroVideo(config);
}

/**
 * Optional prerecorded narration for the /demo product tour. Set
 * MARKETPLACE_DEMO_VOICEOVER (or NEXT_PUBLIC_MARKETPLACE_DEMO_VOICEOVER) to
 * "/media/premiflow-voiceover.mp3" after adding public/media/premiflow-voiceover.mp3.
 * Unset (or the file fails to load) = browser speech synthesis / captions only.
 */
export const MARKETPLACE_DEMO_VOICEOVER: string | null = (() => {
  const src = (process.env.NEXT_PUBLIC_MARKETPLACE_DEMO_VOICEOVER || process.env.MARKETPLACE_DEMO_VOICEOVER || "").trim();
  return src && isSafeHeroMediaSrc(src) ? src : null;
})();
