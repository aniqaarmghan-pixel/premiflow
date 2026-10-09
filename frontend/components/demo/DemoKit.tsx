"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import type { VoiceSource } from "@/lib/hooks/useNarratedSequence";

/** Shared 16:9 composition pieces for /demo and /demo/pitch (container-unit sized). */

const MARK_SRC = "/brand/premiflow-mark.png";

export function DemoMark({ h, wordmark = true }: { h: number; wordmark?: boolean }) {
  const img = (h * 512) / 114;
  return (
    <span className="inline-flex items-center" style={{ gap: `${h * 0.3}cqw` }}>
      <span
        aria-hidden="true"
        className="relative inline-block shrink-0 overflow-hidden"
        style={{ width: `${(h * 122) / 114}cqw`, height: `${h}cqw` }}
      >
        <Image
          src={MARK_SRC}
          alt=""
          width={512}
          height={512}
          sizes="40vw"
          priority
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
          style={{ width: `${img}cqw`, height: `${img}cqw`, transform: "translate(-50%, -50%)" }}
        />
      </span>
      {wordmark ? (
        <span
          className="whitespace-nowrap font-extrabold leading-none"
          style={{ fontSize: `${h * 0.62}cqw`, letterSpacing: "-0.02em" }}
        >
          <span className="text-white">PREMI</span>
          <span style={{ color: "#3BB3D0" }}>FLOW</span>
        </span>
      ) : (
        <span className="sr-only">PREMIFLOW</span>
      )}
    </span>
  );
}

export function ControlButton({
  onClick,
  icon,
  label,
  primary = false,
  pressed,
  disabled = false,
  ariaLabel,
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  primary?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "bg-[linear-gradient(135deg,#2ee6d6,#7c8cff)] text-[#04101f] hover:brightness-105"
          : pressed === false
            ? "border border-line bg-paper-2 text-ink-faint hover:text-ink"
            : "border border-line bg-card text-ink hover:bg-paper-2"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/** Caption band: bottom of the frame, title-safe margins, max ~2 lines. */
export function CaptionBand({ id, text }: { id: string; text: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-[8cqw] bottom-[3.4cqw] flex justify-center">
      <p
        key={id}
        className="pf-demo-in max-w-[78cqw] rounded-[0.8cqw] bg-black/80 px-[1.8cqw] py-[0.8cqw] text-center text-[1.9cqw] font-semibold leading-[1.3] text-white shadow-[0_1cqw_3cqw_rgba(0,0,0,.4)]"
      >
        {text}
      </p>
    </div>
  );
}

export function ProgressLine({ value }: { value: number }) {
  return (
    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[0.3cqw] bg-white/10">
      <span
        className="block h-full bg-[linear-gradient(90deg,#2ee6d6,#7c8cff)]"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </span>
  );
}

export function CountdownOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#050b16]">
      <DemoMark h={2.6} />
      <span key={label} className="pf-demo-count mt-[2cqw] text-[11cqw] font-extrabold leading-none text-white">
        {label}
      </span>
    </div>
  );
}

/** Record Mode frame: portal to <body>, letterboxed 16:9 on black, no cursor. */
export function RecordOverlay({ children }: { children: ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[2147483000] flex cursor-none items-center justify-center bg-black">
      <div className="aspect-video" style={{ width: "min(100vw, 177.7778vh)" }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function describeVoice(source: VoiceSource, voiceName: string | null, prerecordedLabel = "Prerecorded voiceover"): string {
  if (source === "audio") return prerecordedLabel;
  if (source === "speech") return `Preview voice (browser${voiceName ? `: ${voiceName}` : " default"})`;
  return "Voice unavailable in this browser \u2014 captions only";
}
