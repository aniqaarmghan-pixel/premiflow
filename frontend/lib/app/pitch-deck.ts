/**
 * /demo/pitch deck structure (presentation only). Speaker script lives in
 * pitch-narration.ts. Clip slots accept a local "/media/....mp4" (or https)
 * path from the separate product demo; null shows the built-in mockup.
 */
import { PITCH_NARRATION, type PitchSlideId } from "@/lib/app/pitch-narration";

export const PITCH_ROUTE = "/demo/pitch";

/** Words per minute used to estimate slide timing from the script. */
export const PITCH_WORDS_PER_MINUTE = 150;
const PITCH_SLIDE_PAUSE_MS = 1800;
const PITCH_MIN_SLIDE_MS = 9000;

export const PITCH_SPEECH_OVERRUN_CAP_MS = 4000;

export type PitchClipSlot = "contract" | "product" | "closing";

/** Drop product-demo clips in later, e.g. contract: "/media/pitch-contract.mp4". */
export const PITCH_CLIP_SLOTS: Record<PitchClipSlot, string | null> = {
  contract: null,
  product: null,
  closing: null,
};

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
  return Math.max(PITCH_MIN_SLIDE_MS, speechMs + PITCH_SLIDE_PAUSE_MS);
}

const STRUCTURE: ReadonlyArray<{ id: PitchSlideId; label: string; heading: string }> = [
  { id: "title", label: "Title", heading: "PREMIFLOW" },
  { id: "problem", label: "Problem", heading: "Freelance work needs better payment coordination." },
  { id: "solution", label: "Solution", heading: "Marketplace discovery meets protected contracts." },
  { id: "models", label: "Payment models", heading: "One platform. Four ways to work." },
  { id: "product", label: "Product", heading: "Built for the full freelance lifecycle." },
  { id: "protection", label: "Protection", heading: "Protection without hiding the human decision." },
  { id: "solana", label: "Why Solana", heading: "Why Solana?" },
  { id: "business", label: "Business model", heading: "Simple plans for both sides of the marketplace." },
  { id: "current", label: "Current product", heading: "More than a prototype." },
  { id: "closing", label: "Closing", heading: "Work differently." },
];

export const PITCH_SLIDES: readonly PitchSlide[] = STRUCTURE.map((s) => {
  const script = PITCH_NARRATION[s.id];
  return { ...s, ...script, durationMs: pitchSlideDurationMs(script.narration) };
});

export function pitchTotalWords(slides: readonly PitchSlide[] = PITCH_SLIDES): number {
  return slides.reduce((sum, s) => sum + wordCount(s.narration), 0);
}
