/**
 * Server-only: finds real pitch screenshots saved in public/media/pitch/ at the
 * PITCH_SCREENSHOT_PATHS file names (PNG, WebP or JPEG), and the optional
 * studio background music file. The static /demo/pitch page checks at build
 * time; /demo/pitch/studio checks on every request.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { PITCH_MUSIC_PATH, PITCH_SCREENSHOT_PATHS, type PitchScreenSlot } from "@/lib/app/pitch-deck";

export type PitchScreenshotMap = Partial<Record<PitchScreenSlot, string>>;

const EXTENSIONS = [".png", ".webp", ".jpg", ".jpeg"] as const;

function publicFileExists(rel: string): boolean {
  try {
    return existsSync(path.join(process.cwd(), "public", rel));
  } catch {
    // Unreadable path: treat as missing.
    return false;
  }
}

export function findPitchScreenshots(): PitchScreenshotMap {
  const found: PitchScreenshotMap = {};
  for (const slot of Object.keys(PITCH_SCREENSHOT_PATHS) as PitchScreenSlot[]) {
    const stem = PITCH_SCREENSHOT_PATHS[slot].replace(/\.(png|webp|jpe?g)$/, "");
    for (const ext of EXTENSIONS) {
      const rel = `${stem}${ext}`;
      if (publicFileExists(rel)) {
        found[slot] = rel;
        break;
      }
    }
  }
  return found;
}

/** Studio only: the optional background music file, or null when not installed. */
export function findPitchMusic(): string | null {
  return publicFileExists(PITCH_MUSIC_PATH) ? PITCH_MUSIC_PATH : null;
}
