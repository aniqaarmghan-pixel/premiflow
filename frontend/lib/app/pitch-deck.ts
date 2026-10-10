/**
 * /demo/pitch deck structure (presentation only). Speaker script lives in
 * pitch-narration.ts.
 *
 * Media drop-in slots:
 * - Real PREMIFLOW screenshots saved at the PITCH_SCREENSHOT_PATHS file names
 *   in public/media/pitch/ (PNG, WebP or JPEG) are picked up automatically by
 *   the pitch pages. PITCH_SCREENSHOT_SLOTS can also point at a file directly.
 *   Without a file, slide 3 renders the real app components with sample data
 *   and the product-proof slide shows an empty, labelled screenshot slot.
 * - PITCH_CLIP_SLOTS: optional muted product-demo clips ("/media/....mp4").
 */
import { PITCH_NARRATION, type PitchSlideId } from "@/lib/app/pitch-narration";

export const PITCH_ROUTE = "/demo/pitch";

/** Words per minute used to estimate spoken length from the script. */
export const PITCH_WORDS_PER_MINUTE = 150;
/** Short hold after each spoken line (covers the slide transition). */
export const PITCH_TRANSITION_HOLD_MS = 800;
/** Hard ceiling for the recorded video. */
export const PITCH_MAX_TOTAL_MS = 180_000;

export const PITCH_SPEECH_OVERRUN_CAP_MS = 2500;

/**
 * Per-slide slots, scaled from the requested timing (12/18/17/20/20/23/14/22/
 * 24/18 s = 3:08) down to about 2:57.5 so the deck stays under 3:00. The team
 * slide got a longer line, so slides 3, 4, 5 and 9 give up spare hold time. A
 * slot is never shorter than its spoken line plus PITCH_TRANSITION_HOLD_MS.
 */
const PITCH_SLIDE_TARGET_MS: Record<PitchSlideId, number> = {
  title: 12_000,
  problem: 17_000,
  solution: 13_500,
  advantage: 17_000,
  proof: 15_500,
  market: 25_000,
  team: 21_500,
  gtm: 20_000,
  funding: 19_500,
  closing: 16_500,
};

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
  contract: "/media/pitch/active-contract.png",
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

export function pitchSpeechMs(narration: string): number {
  return Math.round((wordCount(narration) / PITCH_WORDS_PER_MINUTE) * 60000);
}

export function pitchSlideDurationMs(id: PitchSlideId, narration: string): number {
  return Math.max(PITCH_SLIDE_TARGET_MS[id], pitchSpeechMs(narration) + PITCH_TRANSITION_HOLD_MS);
}

const STRUCTURE: ReadonlyArray<{ id: PitchSlideId; label: string; heading: string }> = [
  { id: "title", label: "Title", heading: "PREMIFLOW" },
  { id: "problem", label: "The problem", heading: "Freelance work still depends on fragmented trust." },
  { id: "solution", label: "The solution", heading: "One protected freelance workflow." },
  { id: "advantage", label: "Competitive advantage", heading: "Why PREMIFLOW is different." },
  { id: "proof", label: "Product proof", heading: "A working product, not just a concept." },
  { id: "market", label: "Market opportunity", heading: "A large and growing freelance-platform market." },
  { id: "team", label: "Team", heading: "The team behind PREMIFLOW" },
  { id: "gtm", label: "Go-to-market", heading: "How PREMIFLOW enters the market." },
  { id: "funding", label: "Funding & use of funds", heading: "From working Devnet product to market launch." },
  { id: "closing", label: "Ambition", heading: "PREMIFLOW" },
];

export const PITCH_SLIDES: readonly PitchSlide[] = STRUCTURE.map((s) => {
  const script = PITCH_NARRATION[s.id];
  return { ...s, ...script, durationMs: pitchSlideDurationMs(s.id, script.narration) };
});

export function pitchTotalWords(slides: readonly PitchSlide[] = PITCH_SLIDES): number {
  return slides.reduce((sum, s) => sum + wordCount(s.narration), 0);
}

export function pitchTotalMs(slides: readonly PitchSlide[] = PITCH_SLIDES): number {
  return slides.reduce((sum, s) => sum + s.durationMs, 0);
}
