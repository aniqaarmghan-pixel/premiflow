"use client";

import { createContext, useContext, type CSSProperties } from "react";
import { ImageIcon } from "lucide-react";

import { PITCH_SCREENSHOT_PATHS, PITCH_SCREENSHOT_SIZES, pitchScreenshotSrc, type PitchScreenSlot } from "@/lib/app/pitch-deck";

/**
 * Pitch screenshots: real PREMIFLOW screenshots from public/media/pitch/ only.
 * Images are shown whole (object-contain, never stretched or cropped) inside a
 * subtle frame. A missing file shows a labelled empty slot, never generated UI.
 */

/** Real screenshots found in public/media/pitch/ by the pitch page (server side). */
export const PitchScreenshotsContext = createContext<Partial<Record<PitchScreenSlot, string>>>({});

const LOCAL_SHOT = /^\/media\/pitch\/[a-z0-9][a-z0-9-]*\.(png|webp|jpe?g)$/;

export function useScreenshot(slot: PitchScreenSlot): string | null {
  const found = useContext(PitchScreenshotsContext)[slot];
  if (found && LOCAL_SHOT.test(found)) return found;
  return pitchScreenshotSrc(slot);
}

/** CSS aspect ratio of a committed screenshot. */
export function shotAspect(slot: PitchScreenSlot): string {
  const { w, h } = PITCH_SCREENSHOT_SIZES[slot];
  return `${w} / ${h}`;
}

/**
 * One real screenshot in a frame. label: optional slim header (kept outside the
 * image so it never covers product UI). focus: optional display window on the
 * left/right half of a wide screenshot (the file itself is never altered).
 */
export function ScreenshotSlot({
  slot,
  title,
  label,
  dark = false,
  focus,
  className = "",
  style,
}: {
  slot: PitchScreenSlot;
  /** Alt text name, e.g. "Marketplace". */
  title: string;
  label?: string;
  dark?: boolean;
  focus?: "left" | "right";
  className?: string;
  style?: CSSProperties;
}) {
  const shot = useScreenshot(slot);
  return (
    <figure
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[0.9cqw] border border-white/15 shadow-[0_1.2cqw_3cqw_-0.6cqw_rgba(0,0,0,.6),0_0_2.4cqw_-0.8cqw_rgba(46,230,214,.35)] ${
        dark ? "bg-[#050b16]" : "bg-[#f1f4f9]"
      } ${className}`}
      style={style}
    >
      {label ? (
        <figcaption className="flex shrink-0 items-center gap-[0.5cqw] bg-[#0c1b2e] px-[0.8cqw] py-[0.35cqw] text-[0.95cqw] font-semibold text-white/90">
          <span className="size-[0.5cqw] rounded-full bg-[#2ee6d6]" aria-hidden="true" />
          {label}
        </figcaption>
      ) : null}
      {shot ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot}
            alt={`PREMIFLOW ${title} screen`}
            decoding="async"
            className={`absolute inset-0 h-full w-full ${
              focus ? `object-cover ${focus === "left" ? "object-left" : "object-right"}` : "object-contain"
            }`}
          />
        </div>
      ) : (
        <div className="relative m-[0.7cqw] flex min-h-0 flex-1 flex-col items-center justify-center gap-[0.6cqw] rounded-[0.7cqw] border-[0.12cqw] border-dashed border-white/15 bg-[#0b1526] text-center">
          <ImageIcon className="size-[2.2cqw] text-white/35" aria-hidden="true" />
          <span className="text-[1.05cqw] font-semibold text-white/70">Screenshot slot</span>
          <span className="font-mono text-[0.85cqw] text-white/40">public{PITCH_SCREENSHOT_PATHS[slot]}</span>
        </div>
      )}
    </figure>
  );
}
