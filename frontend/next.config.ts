import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const dir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: dir,
  },
  // Landing explainer video (display only). Unset = interactive preview.
  env: {
    MARKETPLACE_EXPLAINER_VIDEO: process.env.MARKETPLACE_EXPLAINER_VIDEO ?? "",
    MARKETPLACE_EXPLAINER_POSTER: process.env.MARKETPLACE_EXPLAINER_POSTER ?? "",
    // Optional prerecorded /demo narration (e.g. /media/premiflow-voiceover.mp3).
    MARKETPLACE_DEMO_VOICEOVER: process.env.MARKETPLACE_DEMO_VOICEOVER ?? "",
    // Optional prerecorded /demo/pitch narration (e.g. /media/premiflow-pitch-voiceover.mp3).
    MARKETPLACE_PITCH_VOICEOVER: process.env.MARKETPLACE_PITCH_VOICEOVER ?? "",
  },
};

export default nextConfig;
