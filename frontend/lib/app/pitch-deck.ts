/**
 * /demo/pitch deck structure (presentation only). Speaker script lives in
 * pitch-narration.ts.
 *
 * Media drop-in slots:
 * - PITCH_SCREENSHOT_SLOTS: real PREMIFLOW screenshots (PNG/WebP/JPEG) saved
 *   under public/media/pitch/, e.g. marketplace: "/media/pitch/marketplace.png".
 *   null renders the real app components with sample data instead.
 * - PITCH_CLIP_SLOTS: optional muted product-demo clips ("/media/....mp4").
 */
import { PITCH_NARRATION, type PitchSlideId } from "@/lib/app/pitch-narration";

export const PITCH_ROUTE = "/demo/pitch";

/** Words per minute used to estimate slide timing from the script. */
export const PITCH_WORDS_PER_MINUTE = 150;
/** Hold after each spoken line (also covers the slide transition). */
const PITCH_SLIDE_HOLD_MS = 3000;
const PITCH_MIN_SLIDE_MS = 9000;

export const PITCH_SPEECH_OVERRUN_CAP_MS = 2500;

export type PitchClipSlot = "contract" | "product" | "closing";

/** Drop product-demo clips in later, e.g. contract: "/media/pitch-contract.mp4". */
export const PITCH_CLIP_SLOTS: Record<PitchClipSlot, string | null> = {
  contract: null,
  product: null,
  closing: null,
};

export type PitchScreenSlot =
  | "marketplace"
  | "proposals"
  | "offer"
  | "accept"
  | "work"
  | "earnings"
  | "contract"
  | "resolution"
  | "messages"
  | "notifications"
  | "pricing";

/** Suggested file for each screenshot slot (16:10 or 16:9 crop, top-aligned). */
export const PITCH_SCREENSHOT_PATHS: Record<PitchScreenSlot, string> = {
  marketplace: "/media/pitch/marketplace.png",
  proposals: "/media/pitch/proposals.png",
  offer: "/media/pitch/create-offer.png",
  accept: "/media/pitch/accept-offer.png",
  work: "/media/pitch/work-review.png",
  earnings: "/media/pitch/earnings.png",
  contract: "/media/pitch/contract-detail.png",
  resolution: "/media/pitch/resolution-desk.png",
  messages: "/media/pitch/messages.png",
  notifications: "/media/pitch/notifications.png",
  pricing: "/media/pitch/pricing.png",
};

/**
 * Set a slot to its PITCH_SCREENSHOT_PATHS entry once the real screenshot is
 * saved in public/media/pitch/. null = real-component render with sample data.
 */
export const PITCH_SCREENSHOT_SLOTS: Record<PitchScreenSlot, string | null> = {
  marketplace: null,
  proposals: null,
  offer: null,
  accept: null,
  work: null,
  earnings: null,
  contract: null,
  resolution: null,
  messages: null,
  notifications: null,
  pricing: null,
};

const SCREENSHOT_SRC = /^\/media\/pitch\/[a-z0-9][a-z0-9-]*\.(png|webp|jpe?g)$/;

/** Local, same-origin screenshot paths under /media/pitch/ only. */
export function pitchScreenshotSrc(slot: PitchScreenSlot): string | null {
  const src = PITCH_SCREENSHOT_SLOTS[slot];
  return src && SCREENSHOT_SRC.test(src) ? src : null;
}

export type PitchSlide = {
  id: PitchSlideId;
  label: string;
  heading: string;
  narration: string;
  caption: string;
  notes: string;
  durationMs: number;
};

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function pitchSlideDurationMs(narration: string): number {
  const speechMs = Math.round((wordCount(narration) / PITCH_WORDS_PER_MINUTE) * 60000);
  return Math.max(PITCH_MIN_SLIDE_MS, speechMs + PITCH_SLIDE_HOLD_MS);
}

const STRUCTURE: ReadonlyArray<{ id: PitchSlideId; label: string; heading: string }> = [
  { id: "title", label: "Title", heading: "PREMIFLOW" },
  { id: "problem", label: "The problem", heading: "Freelance work still runs on fragmented trust." },
  { id: "solution", label: "The solution", heading: "One protected freelance workflow." },
  { id: "how", label: "How it works", heading: "How it works" },
  { id: "models", label: "Four ways to get paid", heading: "Contracts that match the work." },
  { id: "protection", label: "Protection & disputes", heading: "Protection without silent contract changes." },
  { id: "solana", label: "Why Solana", heading: "Why Solana?" },
  { id: "business", label: "Business model", heading: "Simple aligned monetization." },
  { id: "product", label: "Product today", heading: "A working product, not just a concept." },
  { id: "closing", label: "Closing", heading: "PREMIFLOW" },
];

export const PITCH_SLIDES: readonly PitchSlide[] = STRUCTURE.map((s) => {
  const script = PITCH_NARRATION[s.id];
  return { ...s, ...script, durationMs: pitchSlideDurationMs(script.narration) };
});

export function pitchTotalWords(slides: readonly PitchSlide[] = PITCH_SLIDES): number {
  return slides.reduce((sum, s) => sum + wordCount(s.narration), 0);
}

export function pitchTotalMs(slides: readonly PitchSlide[] = PITCH_SLIDES): number {
  return slides.reduce((sum, s) => sum + s.durationMs, 0);
}
