/**
 * /demo/pitch deck structure (presentation only). Speaker script lives in
 * pitch-narration.ts.
 *
 * Real PREMIFLOW screenshots live in public/media/pitch/ at the
 * PITCH_SCREENSHOT_PATHS file names. The pitch pages also detect them on the
 * server (pitch-screenshots-server.ts); a missing file shows a labelled empty
 * slot, never generated UI. Optional studio background music:
 * public/media/pitch/background-music.mp3 (PITCH_MUSIC_PATH).
 */
import { PITCH_NARRATION, type PitchSlideId } from "@/lib/app/pitch-narration";

export const PITCH_ROUTE = "/demo/pitch";

/** Words per minute used to estimate spoken length from the script. */
export const PITCH_WORDS_PER_MINUTE = 150;
/** Short hold after each spoken line (covers the slide transition). */
export const PITCH_TRANSITION_HOLD_MS = 600;
/** Hard ceiling for the recorded video. */
export const PITCH_MAX_TOTAL_MS = 180_000;

export const PITCH_SPEECH_OVERRUN_CAP_MS = 2500;

/**
 * Per-slide slots for 11 slides (total 2:57.5, under the 3:00 ceiling). Each
 * slot is the spoken line at 150 wpm plus PITCH_TRANSITION_HOLD_MS, plus a
 * small visual hold where there is room. A slot is never shorter than its
 * spoken line plus the transition hold.
 */
const PITCH_SLIDE_TARGET_MS: Record<PitchSlideId, number> = {
  title: 12_000,
  problem: 16_500,
  solution: 11_500,
  advantage: 19_000,
  proof: 12_500,
  market: 24_000,
  team: 18_500,
  gtm: 17_000,
  funding: 17_000,
  stage: 13_500,
  closing: 16_000,
};

export type PitchScreenSlot =
  | "marketplace"
  | "create-offer"
  | "streaming-contract"
  | "hourly-contract"
  | "resolution-desk"
  | "why-premiflow"
  | "competitive-advantage"
  | "why-solana";

/** Real screenshot files (public/media/pitch/) and their pixel size. */
export const PITCH_SCREENSHOT_PATHS: Record<PitchScreenSlot, string> = {
  marketplace: "/media/pitch/marketplace.png",
  "create-offer": "/media/pitch/create-offer.png",
  "streaming-contract": "/media/pitch/streaming-contract.png",
  "hourly-contract": "/media/pitch/hourly-contract.png",
  "resolution-desk": "/media/pitch/resolution-desk.png",
  "why-premiflow": "/media/pitch/why-premiflow.png",
  "competitive-advantage": "/media/pitch/competitive-advantage.png",
  "why-solana": "/media/pitch/why-solana.png",
};

/** Native size of each committed screenshot (used for aspect-correct frames). */
export const PITCH_SCREENSHOT_SIZES: Record<PitchScreenSlot, { w: number; h: number }> = {
  marketplace: { w: 1270, h: 970 },
  "create-offer": { w: 1235, h: 975 },
  "streaming-contract": { w: 1235, h: 897 },
  "hourly-contract": { w: 1235, h: 744 },
  "resolution-desk": { w: 962, h: 700 },
  "why-premiflow": { w: 1240, h: 505 },
  "competitive-advantage": { w: 1240, h: 562 },
  "why-solana": { w: 1300, h: 485 },
};

/**
 * Static fallback when server detection is unavailable: every slot points at
 * its committed file. Set a slot to null to force the empty labelled frame.
 */
export const PITCH_SCREENSHOT_SLOTS: Record<PitchScreenSlot, string | null> = { ...PITCH_SCREENSHOT_PATHS };

const SCREENSHOT_SRC = /^\/media\/pitch\/[a-z0-9][a-z0-9-]*\.(png|webp|jpe?g)$/;

/** Local, same-origin screenshot paths under /media/pitch/ only. */
export function pitchScreenshotSrc(slot: PitchScreenSlot): string | null {
  const src = PITCH_SCREENSHOT_SLOTS[slot];
  return src && SCREENSHOT_SRC.test(src) ? src : null;
}

/** Optional studio-only background music (never downloaded or generated). */
export const PITCH_MUSIC_PATH = "/media/pitch/background-music.mp3";
/** Background music sits well under the narration (narration stays at 1.0). */
export const PITCH_MUSIC_DEFAULT_VOLUME = 0.09;
export const PITCH_MUSIC_FADE_IN_MS = 2500;
export const PITCH_MUSIC_FADE_OUT_MS = 4000;

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
  { id: "title", label: "Intro", heading: "PREMIFLOW" },
  { id: "problem", label: "Problem", heading: "Freelance work still depends on fragmented trust." },
  { id: "solution", label: "Our solution", heading: "One protected freelance workflow." },
  { id: "advantage", label: "Advantage + Why Solana", heading: "Why PREMIFLOW is different." },
  { id: "proof", label: "Product proof", heading: "A working product, not just a concept." },
  { id: "market", label: "Market", heading: "A large and growing freelance-platform market." },
  { id: "team", label: "Team", heading: "The team behind PREMIFLOW" },
  { id: "gtm", label: "Go-to-market", heading: "How PREMIFLOW enters the market." },
  { id: "funding", label: "Funding", heading: "From working Devnet product to market launch." },
  { id: "stage", label: "Current stage", heading: "Where PREMIFLOW is today." },
  { id: "closing", label: "Thank you", heading: "PREMIFLOW" },
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
