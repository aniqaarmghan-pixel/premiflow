/**
 * Gig video rules shared by the browser and the gig API (single source of
 * truth). A gig video is either a direct https video file or a public
 * YouTube / Vimeo page on a strict host allowlist. Embeds always use the
 * privacy-friendly player host (youtube-nocookie, Vimeo dnt=1) and never
 * autoplay. No DB change: the existing video_url column stores the
 * normalized URL returned by normalizeGigVideoUrl.
 */
export const GIG_VIDEO_FILE_EXT = /\.(mp4|webm|ogg|ogv|mov|m4v)$/i;
export const GIG_VIDEO_MAX_LENGTH = 500;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[a-f0-9]{6,20}$/i;
const YOUTUBE_WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const YOUTUBE_NOCOOKIE_HOSTS = new Set(["youtube-nocookie.com", "www.youtube-nocookie.com"]);
const VIMEO_PAGE_HOSTS = new Set(["vimeo.com", "www.vimeo.com"]);

export type GigVideo =
  | { kind: "file"; url: string; src: string }
  | { kind: "youtube"; url: string; id: string; embedUrl: string; thumbnailUrl: string }
  | { kind: "vimeo"; url: string; id: string; embedUrl: string; thumbnailUrl: null };

export const GIG_VIDEO_HELP =
  "Paste a YouTube or Vimeo link (youtube.com/watch, youtu.be, vimeo.com) or a direct https .mp4 / .webm file you host.";

function youtube(id: string): GigVideo {
  return {
    kind: "youtube",
    url: `https://www.youtube.com/watch?v=${id}`,
    id,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

function vimeo(id: string, hash: string | null): GigVideo {
  const h = hash ? `&h=${hash.toLowerCase()}` : "";
  return {
    kind: "vimeo",
    url: hash ? `https://vimeo.com/${id}/${hash.toLowerCase()}` : `https://vimeo.com/${id}`,
    id,
    embedUrl: `https://player.vimeo.com/video/${id}?dnt=1${h}`,
    thumbnailUrl: null,
  };
}

/** Parses a gig video URL; null when it is not on the allowlist. */
export function parseGigVideo(value: unknown): GigVideo | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > GIG_VIDEO_MAX_LENGTH || /[\s\u0000-\u001F\u007F]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost")
  ) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);

  if (YOUTUBE_WATCH_HOSTS.has(host)) {
    if (url.pathname !== "/watch") return null;
    const id = url.searchParams.get("v") ?? "";
    return YOUTUBE_ID.test(id) ? youtube(id) : null;
  }
  if (host === "youtu.be") {
    return segments.length === 1 && YOUTUBE_ID.test(segments[0]) ? youtube(segments[0]) : null;
  }
  if (YOUTUBE_NOCOOKIE_HOSTS.has(host)) {
    return segments.length === 2 && segments[0] === "embed" && YOUTUBE_ID.test(segments[1])
      ? youtube(segments[1])
      : null;
  }
  if (VIMEO_PAGE_HOSTS.has(host)) {
    if (segments.length === 1 && VIMEO_ID.test(segments[0])) return vimeo(segments[0], null);
    if (segments.length === 2 && VIMEO_ID.test(segments[0]) && VIMEO_HASH.test(segments[1])) {
      return vimeo(segments[0], segments[1]);
    }
    return null;
  }
  if (host === "player.vimeo.com") {
    if (segments.length !== 2 || segments[0] !== "video" || !VIMEO_ID.test(segments[1])) return null;
    const h = url.searchParams.get("h");
    return vimeo(segments[1], h && VIMEO_HASH.test(h) ? h : null);
  }
  // Any other YouTube / Vimeo URL shape (shorts, channels, playlists) is rejected.
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com)$/.test(host)) return null;
  if (!GIG_VIDEO_FILE_EXT.test(url.pathname)) return null;
  const src = url.toString();
  return { kind: "file", url: src, src };
}

/** Canonical URL to store, or null when invalid. */
export function normalizeGigVideoUrl(value: unknown): string | null {
  return parseGigVideo(value)?.url ?? null;
}

export function gigVideoKindLabel(video: GigVideo): string {
  if (video.kind === "youtube") return "YouTube";
  if (video.kind === "vimeo") return "Vimeo";
  return "Video file";
}
