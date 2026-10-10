/**
 * Pitch studio voice choice (browser speech synthesis). Only voices the
 * browser actually reports are used; nothing is hard-coded to exist.
 */
import { pickNarrationVoice } from "@/lib/app/landing-explainer";

export type PitchVoiceLike = { name: string; lang: string; voiceURI: string; default: boolean };

/** Preferred natural female English voices, in order. */
export const PITCH_PREFERRED_VOICE_NAMES = ["Ava", "Aria", "Jenny", "Samantha", "Sonia", "Libby", "Zira", "Karen"] as const;

export const PITCH_VOICE_STORAGE_KEY = "premiflow.pitch.voice";
export const PITCH_RATE_STORAGE_KEY = "premiflow.pitch.rate";
export const PITCH_RATE_MIN = 0.85;
export const PITCH_RATE_MAX = 1.15;
export const PITCH_RATE_DEFAULT = 1;
export const PITCH_VOICE_SAMPLE = "This is the PREMIFLOW pitch voice. Freelance work. Protected on Solana.";

const NATURAL = /natural|neural/i;

export function englishVoices<T extends PitchVoiceLike>(voices: readonly T[]): T[] {
  return voices.filter((v) => /^en([-_]|$)/i.test(v.lang ?? ""));
}

/**
 * Default voice: preferred names in order, Natural / Online (Natural) / Neural
 * variants first; otherwise the best available en-* voice; otherwise null.
 */
export function pickPitchVoice<T extends PitchVoiceLike>(voices: readonly T[]): T | null {
  const en = englishVoices(voices);
  if (en.length === 0) return null;
  const named = (name: string) => en.filter((v) => new RegExp(`\\b${name}\\b`, "i").test(v.name));
  for (const name of PITCH_PREFERRED_VOICE_NAMES) {
    const natural = named(name).find((v) => NATURAL.test(v.name));
    if (natural) return natural;
  }
  for (const name of PITCH_PREFERRED_VOICE_NAMES) {
    const any = named(name)[0];
    if (any) return any;
  }
  return pickNarrationVoice(en) ?? en[0];
}

export function clampPitchRate(rate: number): number {
  if (!Number.isFinite(rate)) return PITCH_RATE_DEFAULT;
  return Math.min(PITCH_RATE_MAX, Math.max(PITCH_RATE_MIN, Math.round(rate * 100) / 100));
}
