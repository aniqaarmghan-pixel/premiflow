"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Captions, Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";

import {
  PRODUCT_DEMO_SCENES,
  PRODUCT_DEMO_SPEECH_OVERRUN_CAP_MS,
  formatDemoTime,
} from "@/lib/app/landing-explainer";
import { MARKETPLACE_DEMO_VOICEOVER } from "@/lib/app/marketplace-media";
import { useNarratedSequence, type NarratedSequence } from "@/lib/hooks/useNarratedSequence";
import { RecordOverlay } from "./DemoKit";
import { DemoStage } from "./ProductDemoScenes";

/**
 * Inline PREMIFLOW product-demo player (landing page and /demo). Starts only
 * on an explicit Play click, plays inside the same 16:9 frame, and keeps its
 * controls (play/pause, restart, progress, voice + volume, captions, full
 * screen) visible for the whole of normal viewing. Record Mode is a separate,
 * explicit state that renders a clean full-screen copy of the stage.
 */

export type ProductDemoState = {
  seq: NarratedSequence;
  captionsOn: boolean;
  toggleCaptions: () => void;
};

export function useProductDemo({ initialVoiceOn }: { initialVoiceOn: boolean }): ProductDemoState {
  const seq = useNarratedSequence({
    items: PRODUCT_DEMO_SCENES,
    voiceoverSrc: MARKETPLACE_DEMO_VOICEOVER,
    overrunCapMs: PRODUCT_DEMO_SPEECH_OVERRUN_CAP_MS,
    initialVoiceOn,
    speechRate: 1.05,
  });
  const [captionsOn, setCaptionsOn] = useState(true);
  return { seq, captionsOn, toggleCaptions: () => setCaptionsOn((v) => !v) };
}

export function voiceStatusLabel(seq: NarratedSequence): string {
  if (!seq.voiceOn) return "Voice off";
  if (seq.voiceSource === "audio") return "Voiceover";
  if (seq.voiceSource === "speech") return "Preview voice";
  return "Captions only";
}

/** Translucent, centred play affordance used over the poster frame / first video frame. */
export function PlayOverlay({ onPlay, label, ariaLabel }: { onPlay: () => void; label: string; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={ariaLabel}
      className="group absolute inset-0 z-[2] flex flex-col items-center justify-center gap-[1.4cqw] bg-[radial-gradient(60%_60%_at_50%_50%,rgba(5,11,22,.25),rgba(5,11,22,.6))] focus-visible:outline-none"
    >
      <span className="flex size-[9cqw] min-h-14 min-w-14 items-center justify-center rounded-full border border-white/45 bg-white/[0.14] text-white shadow-[0_0.8cqw_3cqw_rgba(0,0,0,.35)] backdrop-blur-md transition duration-300 group-hover:scale-[1.04] group-hover:border-white/70 group-hover:bg-white/[0.2] group-hover:shadow-[0_0_4cqw_rgba(46,230,214,.45)] group-focus-visible:ring-4 group-focus-visible:ring-[#2ee6d6]/60">
        <Play aria-hidden="true" className="ml-[0.5cqw] size-[38%] fill-white" />
      </span>
      <span className="rounded-full bg-black/45 px-[1.4cqw] py-[0.5cqw] text-[max(12px,1.4cqw)] font-semibold text-white backdrop-blur-sm">
        {label}
      </span>
    </button>
  );
}

function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`flex size-10 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2ee6d6] ${
        pressed === false ? "text-white/45 hover:bg-white/10 hover:text-white" : "text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

export function ProductDemoPlayer({ demo, className = "" }: { demo: ProductDemoState; className?: string }) {
  const { seq, captionsOn, toggleCaptions } = demo;
  const frameRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(frameRef.current) && document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    const el = frameRef.current;
    if (el && typeof el.requestFullscreen === "function") el.requestFullscreen().catch(() => undefined);
  };

  const { status, index, elapsed, position, totalMs, voiceOn, volume, recordMode, countdownLabel } = seq;
  const started = status !== "idle" || position > 0;
  const playing = status === "playing";
  const stage = (
    <DemoStage
      index={index}
      t={elapsed}
      captionsOn={captionsOn}
      paused={status === "paused"}
      countdownLabel={countdownLabel}
      progress={null}
    />
  );

  return (
    <div
      ref={frameRef}
      className={`w-full min-w-0 overflow-hidden bg-[#050b16] ${
        fullscreen ? "flex h-full flex-col" : "rounded-[20px] border border-line shadow-[var(--shadow)]"
      } ${className}`}
    >
      {seq.voiceover ? (
        <audio ref={seq.audioRef} src={seq.voiceover} preload="auto" onError={seq.onAudioError} hidden />
      ) : null}

      <div className={fullscreen ? "flex min-h-0 flex-1 items-center justify-center" : ""}>
        <div
          className="pf-demo relative w-full"
          style={fullscreen ? { width: "min(100%, calc((100vh - 3.5rem) * 16 / 9))" } : undefined}
        >
          {recordMode ? (
            <div className="aspect-video w-full bg-[#050b16]" aria-hidden="true" />
          ) : started ? (
            stage
          ) : (
            <>
              {/* Poster: a real product frame, static until Play. */}
              <div aria-hidden="true">
                <DemoStage index={1} t={2700} captionsOn={false} paused countdownLabel={null} progress={null} />
              </div>
              <PlayOverlay
                onPlay={seq.play}
                label={`${formatDemoTime(totalMs)} product demo`}
                ariaLabel="Play the PREMIFLOW product demo"
              />
            </>
          )}
        </div>
      </div>

      <div
        role="toolbar"
        aria-label="Demo player controls"
        className="flex min-w-0 items-center gap-1 border-t border-white/10 bg-[#07101e] px-2 py-1 text-white sm:gap-2 sm:px-3"
      >
        <IconButton label={playing ? "Pause" : status === "ended" ? "Replay" : "Play"} onClick={playing ? seq.pause : seq.play}>
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" className="fill-white" />}
        </IconButton>
        <IconButton label="Restart" onClick={seq.restart}>
          <RotateCcw size={16} aria-hidden="true" />
        </IconButton>
        <input
          type="range"
          aria-label="Demo progress"
          min={0}
          max={totalMs}
          step={100}
          value={Math.min(position, totalMs)}
          onChange={(e) => seq.seek(Number(e.currentTarget.value))}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-[#2ee6d6]"
        />
        <span className="shrink-0 text-[11px] tabular-nums text-white/70 sm:text-xs">
          {formatDemoTime(position)} / {formatDemoTime(totalMs)}
        </span>
        <IconButton label={voiceOn ? "Turn voice off" : "Turn voice on"} onClick={seq.toggleVoice} pressed={voiceOn}>
          {voiceOn ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
        </IconButton>
        <input
          type="range"
          aria-label="Voice volume"
          min={0}
          max={1}
          step={0.05}
          value={voiceOn ? volume : 0}
          onChange={(e) => seq.setVolume(Number(e.currentTarget.value))}
          className="hidden h-1 w-16 shrink-0 cursor-pointer accent-[#2ee6d6] sm:block"
        />
        <span className="hidden shrink-0 text-[11px] text-white/55 md:inline" aria-live="polite">
          {voiceStatusLabel(seq)}
        </span>
        <IconButton label={captionsOn ? "Turn captions off" : "Turn captions on"} onClick={toggleCaptions} pressed={captionsOn}>
          <Captions size={18} aria-hidden="true" />
        </IconButton>
        <IconButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
          {fullscreen ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
        </IconButton>
      </div>

      {recordMode ? (
        <RecordOverlay>
          <DemoStage
            index={index}
            t={elapsed}
            captionsOn={captionsOn}
            paused={status === "paused"}
            countdownLabel={countdownLabel}
            progress={null}
          />
        </RecordOverlay>
      ) : null}
    </div>
  );
}
