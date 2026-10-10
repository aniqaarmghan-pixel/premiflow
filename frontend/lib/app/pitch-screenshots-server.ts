/**
 * Server-only: finds real pitch screenshots saved in public/media/pitch/ at the
 * PITCH_SCREENSHOT_PATHS file names (PNG, WebP or JPEG). The static /demo/pitch
 * page checks at build time; /demo/pitch/studio checks on every request.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { PITCH_SCREENSHOT_PATHS, type PitchScreenSlot } from "@/lib/app/pitch-deck";

export type PitchScreenshotMap = Partial<Record<PitchScreenSlot, string>>;

const EXTENSIONS = [".png", ".webp", ".jpg", ".jpeg"] as const;

export function findPitchScreenshots(): PitchScreenshotMap {
  const publicDir = path.join(process.cwd(), "public");
  const found: PitchScreenshotMap = {};
  for (const slot of Object.keys(PITCH_SCREENSHOT_PATHS) as PitchScreenSlot[]) {
    const stem = PITCH_SCREENSHOT_PATHS[slot].replace(/\.(png|webp|jpe?g)$/, "");
    for (const ext of EXTENSIONS) {
      const rel = `${stem}${ext}`;
      try {
        if (existsSync(path.join(publicDir, rel))) {
          found[slot] = rel;
          break;
        }
      } catch {
        // Unreadable path: treat as missing.
      }
    }
  }
  return found;
}
