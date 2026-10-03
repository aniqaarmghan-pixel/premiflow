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
