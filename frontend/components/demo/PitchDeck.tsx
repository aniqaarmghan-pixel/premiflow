"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Handshake,
  Layers,
  Megaphone,
  MessageSquare,
  Minus,
  Pause,
  Play,
  Puzzle,
  Repeat,
  RotateCcw,
  ShieldAlert,
  StickyNote,
  Store,
  UserRound,
  Users,
  Video,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";

import { formatDemoTime } from "@/lib/app/landing-explainer";
import { MARKETPLACE_PITCH_VOICEOVER, isSafeHeroMediaSrc } from "@/lib/app/marketplace-media";
import {
  PITCH_CLIP_SLOTS,
  PITCH_MAX_TOTAL_MS,
  PITCH_SCREENSHOT_PATHS,
  PITCH_SLIDES,
  PITCH_SPEECH_OVERRUN_CAP_MS,
  pitchSpeechMs,
  pitchTotalWords,
  type PitchClipSlot,
  type PitchScreenSlot,
} from "@/lib/app/pitch-deck";
import type { PitchScreenshotMap } from "@/lib/app/pitch-screenshots-server";
import { useNarratedSequence } from "@/lib/hooks/useNarratedSequence";
import { CaptionBand, ControlButton, CountdownOverlay, DemoMark, RecordOverlay, describeVoice } from "./DemoKit";
import { PitchScreenshotsContext, ProductScreen, ScreenshotSlot } from "./PitchScreens";

/**
 * PREMIFLOW pitch deck (/demo/pitch): 10 slides in one 16:9 composition for
 * live presenting and one-take screen recording (target 2:45-2:58, max 3:00).
 * Product proof uses real screenshots from public/media/pitch/ only; slide 3
 * falls back to the real app components with sample data. Presentation only.
 */

const SLIDES = PITCH_SLIDES;

/**
 * studio=false: clean presentation view (/demo/pitch).
 * studio=true: internal /demo/pitch/studio with Record Presentation, Autoplay,
 * slide timing, narration script and speaker notes.
 */
export function PitchDeck({
  studio = false,
  screenshots = {},
}: { studio?: boolean; screenshots?: PitchScreenshotMap } = {}) {
  const [autoplay, setAutoplay] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [notesOn, setNotesOn] = useState(true);
  const seq = useNarratedSequence({
    items: SLIDES,
    voiceoverSrc: MARKETPLACE_PITCH_VOICEOVER,
    overrunCapMs: PITCH_SPEECH_OVERRUN_CAP_MS,
    // Record Mode always runs as one continuous take.
    autoAdvance: !studio || autoplay,
  });
  const { status, index, elapsed, position, totalMs, voiceOn, recordMode, countdownLabel, jumpTo, play } = seq;
  const slide = SLIDES[index];
  const manual = studio && !autoplay && !recordMode;

  /** Manual (Autoplay off): moving to a slide narrates it, then holds. */
  const go = (i: number) => {
    if (i < 0 || i >= SLIDES.length) return;
    const resume = manual && status === "paused";
    jumpTo(i);
    if (resume) play();
  };

  // Keyboard: arrows / Page keys move between slides; Home / End jump.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(index + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(index - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(SLIDES.length - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const stage = (
    <PitchStage
      index={index}
      t={elapsed}
      captionsOn={captionsOn}
      paused={status === "paused"}
      countdownLabel={countdownLabel}
      showProgress={!recordMode}
    />
  );

  const missingShots = PROOF_SHOTS.filter((x) => !screenshots[x.slot]);

  return (
    <PitchScreenshotsContext.Provider value={screenshots}>
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {seq.voiceover ? (
        <audio ref={seq.audioRef} src={seq.voiceover} preload="auto" onError={seq.onAudioError} hidden />
      ) : null}
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        {studio ? "Internal \u00b7 Pitch studio" : "Pitch presentation"}
      </p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
        PREMIFLOW pitch presentation
      </h1>

      <div className="mt-5 overflow-hidden rounded-[20px] border border-line shadow-[var(--shadow)]">
        {recordMode ? <div className="aspect-video w-full bg-[#050b16]" aria-hidden="true" /> : stage}
      </div>
      {recordMode ? <RecordOverlay>{stage}</RecordOverlay> : null}

      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2" role="toolbar" aria-label="Presentation controls">
        <ControlButton
          onClick={() => go(index - 1)}
          disabled={index === 0}
          icon={<ChevronLeft size={16} aria-hidden="true" />}
          label="Previous"
        />
        {status === "playing" ? (
          <ControlButton onClick={seq.pause} icon={<Pause size={16} aria-hidden="true" />} label="Pause" primary />
        ) : (
          <ControlButton
            onClick={play}
            icon={<Play size={16} aria-hidden="true" />}
            label={status === "paused" ? "Resume" : "Play narrated"}
            primary
          />
        )}
        <ControlButton
          onClick={() => go(index + 1)}
          disabled={index === SLIDES.length - 1}
          icon={<ChevronRight size={16} aria-hidden="true" />}
          label="Next"
        />
        <ControlButton onClick={seq.restart} icon={<RotateCcw size={16} aria-hidden="true" />} label="Restart Presentation" />
        <ControlButton
          onClick={seq.toggleVoice}
          pressed={voiceOn}
          icon={voiceOn ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
          label={voiceOn ? "Voice On" : "Voice Off"}
        />
        <ControlButton
          onClick={() => setCaptionsOn((v) => !v)}
          pressed={captionsOn}
          icon={<FileText size={16} aria-hidden="true" />}
          label={captionsOn ? "Captions On" : "Captions Off"}
        />
        {studio ? (
          <>
            <ControlButton
              onClick={() => setAutoplay((v) => !v)}
              pressed={autoplay}
              icon={<Repeat size={16} aria-hidden="true" />}
              label={autoplay ? "Autoplay On" : "Autoplay Off"}
            />
            <ControlButton
              onClick={() => setNotesOn((v) => !v)}
              pressed={notesOn}
              icon={<StickyNote size={16} aria-hidden="true" />}
              label="Speaker notes"
            />
            <ControlButton onClick={seq.startRecordMode} icon={<Video size={16} aria-hidden="true" />} label="Record Presentation" />
          </>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-ink-faint" aria-live="polite">
        Slide {index + 1} of {SLIDES.length}: {slide.label}
        {" \u00b7 "}
        <span className="tabular-nums">
          {formatDemoTime(position)} / {formatDemoTime(totalMs)}
        </span>
        {studio ? (
          <>
            {" \u00b7 "}
            <span className="tabular-nums">
              Slide {formatDemoTime(Math.min(elapsed, slide.durationMs))} / {formatDemoTime(slide.durationMs)}
            </span>
            {" \u00b7 "}
            {voiceOn ? describeVoice(seq.voiceSource, seq.voiceName) : "Voice off \u2014 captions only"}
            {" \u00b7 "}
            {autoplay ? "Autoplay: slides advance on their own" : "Autoplay off: each slide narrates, then waits for \u2192 / Next"}
            {" \u00b7 "}Keys: {"\u2190"} {"\u2192"} Home End, Esc exits Record Mode
          </>
        ) : (
          <>
            {" \u00b7 "}
            {!voiceOn ? "Voice off" : seq.voiceSource === "audio" ? "Voiceover" : seq.voiceSource === "speech" ? "Preview voice" : "Captions only"}
          </>
        )}
      </p>

      {studio ? (
        <ol className="mt-4 flex min-w-0 flex-wrap gap-1.5" aria-label="Slides">
          {SLIDES.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === index ? "step" : undefined}
                className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  i === index ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-paper-2"
                }`}
              >
                {i + 1}. {s.label} <span className="font-normal tabular-nums opacity-70">{formatDemoTime(s.durationMs)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {studio && notesOn ? (
        <section aria-label="Speaker notes" className="mt-5 rounded-[16px] border border-line bg-card p-4 text-sm leading-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Narration {"\u00b7"} {slide.label}</p>
          <p className="mt-1 text-ink">{slide.narration}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Notes</p>
          <p className="mt-1 text-ink-soft">{slide.notes}</p>
          <p className="mt-3 text-xs text-ink-faint">
            This slide: spoken line about {formatDemoTime(pitchSpeechMs(slide.narration))} at 150 words per minute, slot{" "}
            {formatDemoTime(slide.durationMs)}. Full script: {pitchTotalWords()} words, total {formatDemoTime(totalMs)}{" "}
            (maximum {formatDemoTime(PITCH_MAX_TOTAL_MS)}). Record Mode counts down 3, 2, 1, plays every slide once with
            narration and captions, and ends on the closing slide.
          </p>
          <p className="mt-2 text-xs text-ink-faint">
            {missingShots.length === 0
              ? "All product-proof screenshots found in public/media/pitch/."
              : `Product-proof screenshots still needed: ${missingShots
                  .map((x) => `public${PITCH_SCREENSHOT_PATHS[x.slot]} (${x.capture})`)
                  .join("; ")}.`}
          </p>
        </section>
      ) : null}
    </div>
    </PitchScreenshotsContext.Provider>
  );
}

/* =============================== Composition =============================== */

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function PitchStage({
  index,
  t,
  captionsOn,
  paused,
  countdownLabel,
  showProgress,
}: {
  index: number;
  t: number;
  captionsOn: boolean;
  paused: boolean;
  countdownLabel: string | null;
  showProgress: boolean;
}) {
  const slide = SLIDES[index];
  const brand = slide.id === "title" || slide.id === "closing";
  return (
    <div
      role="region"
      aria-label="PREMIFLOW pitch presentation"
      className={`pf-demo relative aspect-video w-full overflow-hidden bg-[#050b16] text-white ${paused ? "pf-demo-paused" : ""}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(70%_60%_at_85%_0%,rgba(46,230,214,.16),transparent_60%),radial-gradient(60%_60%_at_0%_100%,rgba(79,140,255,.18),transparent_60%),linear-gradient(160deg,#050b16,#0b1d33)]"
      />
      {/* Persistent frame branding: shown on every slide, never tied to playback state. */}
      <div className="absolute left-[5cqw] right-[5cqw] top-[2.4cqw] flex items-center justify-between">
        {brand ? <span /> : <DemoMark h={2} />}
        <span className="text-[1cqw] font-semibold tabular-nums text-white/50">
          {String(index + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
        </span>
      </div>

      <div
        key={slide.id}
        className={`pf-demo-in absolute left-[5cqw] right-[5cqw] flex flex-col ${
          brand ? "top-[5cqw] bottom-[9cqw]" : "top-[6.6cqw] bottom-[11cqw]"
        }`}
      >
        {!brand ? (
          <h2 className="mb-[1.6cqw] max-w-[84cqw] text-[3.4cqw] font-bold leading-[1.08] tracking-[-0.03em]">{slide.heading}</h2>
        ) : null}
        <div className="relative min-h-0 flex-1">
          <SlideBody id={slide.id} t={t} />
        </div>
      </div>

      {captionsOn && slide.caption ? <CaptionBand id={slide.id} text={slide.caption} /> : null}

      {showProgress ? (
        <div aria-hidden="true" className="absolute inset-x-[5cqw] bottom-[1.2cqw] flex gap-[0.4cqw]">
          {SLIDES.map((s, i) => (
            <span key={s.id} className={`h-[0.25cqw] flex-1 rounded-full transition-colors duration-500 ${i <= index ? "bg-[#2ee6d6]" : "bg-white/15"}`} />
          ))}
        </div>
      ) : null}

      {countdownLabel ? <CountdownOverlay label={countdownLabel} /> : null}
    </div>
  );
}

/* ----------------------------- building blocks ----------------------------- */

const CARD = "rounded-[1.2cqw] border border-white/10 bg-white/[0.06] p-[1.4cqw]";
const ACCENT = "linear-gradient(135deg,#2ee6d6,#4f8cff)";
const MODELS = ["Fixed", "Milestone", "Streaming", "Hourly"] as const;
const ramp = (t: number, start: number, length: number) => Math.min(1, Math.max(0, (t - start) / length));

/** Product-proof screenshots (real files only) and what to capture for each. */
const PROOF_SHOTS: ReadonlyArray<{ slot: PitchScreenSlot; title: string; capture: string }> = [
  { slot: "marketplace", title: "Marketplace", capture: "Marketplace / Find Work page with job cards" },
  { slot: "offer", title: "Create & Send Offer", capture: "Create & Send Offer review step" },
  { slot: "contract", title: "Active contract", capture: "Active contract with payment progress" },
  { slot: "resolution", title: "Resolution Desk", capture: "Resolution Desk case with statements, evidence and AI case summary" },
  { slot: "pricing", title: "Pricing", capture: "Pricing page with Free, Pro and Premium plans" },
];

function Appear({ at, t, children, className = "" }: { at: number; t: number; children: ReactNode; className?: string }) {
  if (t < at) return <div className={`${className} invisible`} aria-hidden="true">{children}</div>;
  return <div className={`pf-demo-in ${className}`}>{children}</div>;
}

/** Optional product-demo clip; falls back to the built-in visual. */
function ClipSlot({ slot, children }: { slot: PitchClipSlot; children: ReactNode }) {
  const src = PITCH_CLIP_SLOTS[slot];
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => true);
  if (!src || !isSafeHeroMediaSrc(src)) return <>{children}</>;
  return (
    <div className="h-full overflow-hidden rounded-[1.2cqw] border border-white/15 bg-black">
      <video src={src} muted loop playsInline autoPlay={!reduced} controls={reduced} preload="metadata" className="h-full w-full object-cover" />
    </div>
  );
}

function DevnetPill() {
  return (
    <span className="inline-flex items-center gap-[0.6cqw] rounded-full border border-[#2ee6d6]/40 bg-[#2ee6d6]/10 px-[1.3cqw] py-[0.5cqw] text-[1.2cqw] font-semibold text-[#7ff3ea]">
      <span className="pf-preview-dot size-[0.6cqw] rounded-full bg-[#2ee6d6]" aria-hidden="true" /> Running on Solana Devnet
    </span>
  );
}

function ModelChips({ size = 1.35 }: { size?: number }) {
  return (
    <span className="flex items-center gap-[0.8cqw]">
      {MODELS.map((m, i) => (
        <span key={m} className="flex items-center gap-[0.8cqw]">
          {i > 0 ? <span className="text-[1.4cqw] text-[#2ee6d6]" aria-hidden="true">{"\u2022"}</span> : null}
          <span className="rounded-full border border-white/20 bg-white/5 px-[1.4cqw] py-[0.5cqw] font-semibold" style={{ fontSize: `${size}cqw` }}>
            {m}
          </span>
        </span>
      ))}
    </span>
  );
}

function Glow({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(46,230,214,.18),transparent_65%)] ${className}`}
    />
  );
}

function TitleSlide({ t }: { t: number }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center text-center">
      <Glow className="top-[38%] size-[34cqw]" />
      <DemoMark h={7.4} />
      <p className="mt-[2.2cqw] text-[3.3cqw] font-bold tracking-[-0.025em]">Freelance work. Protected on Solana.</p>
      <p className="mt-[0.8cqw] text-[1.7cqw] text-white/70">One freelance marketplace. Four ways to get paid.</p>
      <Appear at={1200} t={t} className="mt-[2cqw]">
        <ModelChips />
      </Appear>
      <Appear at={2200} t={t} className="mt-[1.8cqw]">
        <DevnetPill />
      </Appear>
    </div>
  );
}

function ClosingSlide({ t }: { t: number }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center text-center">
      <Glow className="top-[30%] size-[46cqw]" />
      <DemoMark h={5.6} />
      <p className="mt-[1.2cqw] text-[2.4cqw] font-bold tracking-[-0.025em] text-white/90">Freelance work. Protected on Solana.</p>
      <Appear at={600} t={t} className="mt-[2.2cqw] max-w-[76cqw]">
        <p className="bg-[linear-gradient(135deg,#ffffff,#7ff3ea_55%,#8fb4ff)] bg-clip-text text-[3.1cqw] font-extrabold leading-[1.15] tracking-[-0.025em] text-transparent">
          {"\u201c"}Our ambition is to make protected, flexible freelance agreements as easy to create as sending a proposal.{"\u201d"}
        </p>
      </Appear>
      <Appear at={6500} t={t} className="mt-[2cqw] flex flex-col items-center gap-[1.1cqw]">
        <p className="text-[1.6cqw] font-semibold text-white/80">One marketplace. Four payment models. A global way to work.</p>
        <ModelChips size={1.2} />
        <DevnetPill />
      </Appear>
      <Appear at={11000} t={t} className="mt-[1.4cqw]">
        <p className="text-[1.2cqw] font-semibold uppercase tracking-[0.24em] text-[#7ff3ea]/80">From first proposal to final payment</p>
      </Appear>
    </div>
  );
}

function Person({ icon: Icon, label }: { icon: typeof Briefcase; label: string }) {
  return (
    <span className="flex shrink-0 flex-col items-center gap-[0.6cqw]">
      <span className="flex size-[5.2cqw] items-center justify-center rounded-full border border-white/15 bg-[linear-gradient(135deg,rgba(46,230,214,.2),rgba(79,140,255,.2))]">
        <Icon className="size-[2.4cqw] text-white" aria-hidden="true" />
      </span>
      <span className="text-[1.15cqw] font-semibold text-white/80">{label}</span>
    </span>
  );
}

type Support = "yes" | "varies";

function Mark({ v, strong = false }: { v: Support; strong?: boolean }) {
  if (v === "yes") {
    return (
      <span className={`inline-flex size-[1.8cqw] items-center justify-center rounded-full ${strong ? "bg-[#2ee6d6] text-[#04101f]" : "bg-white/15 text-white/85"}`}>
        <CheckCircle2 className="size-[1.3cqw]" aria-hidden="true" />
        <span className="sr-only">Commonly available</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-[0.3cqw] text-[0.95cqw] font-semibold text-white/50">
      <Minus className="size-[1cqw]" aria-hidden="true" /> Varies
    </span>
  );
}

/* --------------------------------- slides --------------------------------- */

function SlideBody({ id, t }: { id: (typeof SLIDES)[number]["id"]; t: number }) {
  switch (id) {
    case "title":
      return <TitleSlide t={t} />;

    case "problem": {
      const problems = [
        { icon: Layers, text: "Hiring, contracts and payments often live in separate systems" },
        { icon: Wallet, text: "Freelancers worry about getting paid" },
        { icon: ShieldAlert, text: "Employers want protection before releasing payment" },
        { icon: Puzzle, text: "One payment structure does not fit every kind of freelance work" },
      ];
      const tools = [
        { icon: Store, label: "Job board" },
        { icon: MessageSquare, label: "Chat app" },
        { icon: FileText, label: "Contract docs" },
        { icon: CreditCard, label: "Payment app" },
      ];
      return (
        <div className="grid h-full grid-cols-[1.15fr_1fr] gap-[2cqw]">
          <div className="grid grid-cols-2 grid-rows-2 gap-[1.2cqw]">
            {problems.map(({ icon: Icon, text }, i) => (
              <Appear key={text} at={i * 900} t={t} className={`${CARD} flex flex-col`}>
                <span className="flex size-[3.4cqw] items-center justify-center rounded-[0.9cqw] bg-[#2ee6d6]/12">
                  <Icon className="size-[1.9cqw] text-[#2ee6d6]" aria-hidden="true" />
                </span>
                <p className="mt-auto text-[1.55cqw] font-semibold leading-snug">{text}</p>
              </Appear>
            ))}
          </div>
          <div className={`${CARD} flex items-center justify-between gap-[1cqw]`}>
            <Person icon={Briefcase} label="Employer" />
            <div className="flex flex-1 flex-col gap-[1cqw]">
              {tools.map(({ icon: Icon, label }, i) => (
                <Appear key={label} at={500 + i * 600} t={t} className="flex items-center gap-[0.5cqw]">
                  <span className="h-0 flex-1 border-t-[0.15cqw] border-dashed border-white/25" />
                  <span className="flex items-center gap-[0.5cqw] rounded-full border border-white/15 bg-[#0c1b2e] px-[1cqw] py-[0.45cqw] text-[1.1cqw] font-semibold text-white/80">
                    <Icon className="size-[1.2cqw] text-white/60" aria-hidden="true" /> {label}
                  </span>
                  <span className="h-0 w-[1.2cqw] border-t-[0.15cqw] border-dashed border-white/25" />
                  <span className="text-[1cqw] font-bold text-[#ff8a8a]/80" aria-hidden="true">{"\u00d7"}</span>
                  <span className="h-0 flex-1 border-t-[0.15cqw] border-dashed border-white/25" />
                </Appear>
              ))}
            </div>
            <Person icon={UserRound} label="Freelancer" />
          </div>
        </div>
      );
    }

    case "solution": {
      const flow = ["Discover", "Proposal", "Protected Offer", "Work", "Approval", "Payment"];
      const lit = Math.min(flow.length, Math.floor(t / 1300) + 1);
      const points = [
        "Marketplace discovery",
        "Protected contract funding",
        "Four payment models",
        "Work submission and review",
        "Safe revisions",
        "Dispute resolution",
      ];
      return (
        <div className="flex h-full flex-col gap-[1.4cqw]">
          <div className="flex items-center gap-[0.5cqw]">
            {flow.map((s, i) => (
              <div key={s} className="flex flex-1 items-center gap-[0.5cqw]">
                <div
                  className={`flex min-h-[3.8cqw] flex-1 items-center justify-center rounded-full border px-[0.8cqw] text-center text-[1.25cqw] font-semibold transition duration-500 ${
                    i < lit ? "border-[#2ee6d6]/60 bg-[#2ee6d6]/12 text-white" : "border-white/10 text-white/35"
                  }`}
                >
                  {s}
                </div>
                {i < flow.length - 1 ? <ArrowRight className="size-[1.3cqw] shrink-0 text-white/40" aria-hidden="true" /> : null}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_1fr_0.66fr] gap-[1.4cqw]">
            <ProductScreen slot="marketplace" title="Marketplace" className="h-full" />
            <ClipSlot slot="contract">
              <ProductScreen slot="contract" title="Contract" className="h-full" />
            </ClipSlot>
            <ul className="flex flex-col justify-center gap-[0.7cqw]">
              {points.map((p, i) => (
                <Appear key={p} at={i * 500} t={t} className="flex items-center gap-[0.7cqw] rounded-[0.8cqw] bg-white/[0.06] px-[1cqw] py-[0.65cqw]">
                  <CheckCircle2 className="size-[1.4cqw] shrink-0 text-[#2ee6d6]" aria-hidden="true" />
                  <span className="text-[1.2cqw] font-semibold">{p}</span>
                </Appear>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    case "advantage": {
      // Generalized categories, not specific products. "varies" = support differs by provider.
      const rows: ReadonlyArray<[string, Support, Support]> = [
        ["Marketplace discovery", "yes", "varies"],
        ["Protected programmable funding", "varies", "yes"],
        ["Fixed payments", "yes", "yes"],
        ["Milestone payments", "yes", "varies"],
        ["Streaming payments", "varies", "varies"],
        ["Hourly payments", "yes", "varies"],
        ["Safe funded-offer revision", "varies", "varies"],
        ["Integrated work review", "yes", "varies"],
        ["AI-assisted dispute organization", "varies", "varies"],
        ["Human final resolution", "yes", "varies"],
        ["One connected workflow", "varies", "varies"],
      ];
      return (
        <div className="grid h-full grid-cols-[1.75fr_1fr] gap-[1.8cqw]">
          <div className="flex min-h-0 flex-col">
            <div className="grid grid-cols-[1.7fr_1fr_1fr_1fr] items-end gap-x-[0.6cqw] pb-[0.6cqw] text-center text-[1cqw] font-bold uppercase leading-tight tracking-[0.1em] text-white/60">
              <span />
              <span>Traditional freelance marketplace</span>
              <span>Basic crypto escrow</span>
              <span className="rounded-t-[0.8cqw] bg-[#2ee6d6]/15 py-[0.5cqw] text-[#7ff3ea]">PREMIFLOW</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {rows.map(([label, a, b], i) => (
                <Appear
                  key={label}
                  at={i * 220}
                  t={t}
                  className="grid min-h-0 flex-1 grid-cols-[1.7fr_1fr_1fr_1fr] items-center gap-x-[0.6cqw] border-t border-white/10"
                >
                  <span className="text-[1.15cqw] font-semibold">{label}</span>
                  <span className="flex justify-center"><Mark v={a} /></span>
                  <span className="flex justify-center"><Mark v={b} /></span>
                  <span className={`flex h-full items-center justify-center bg-[#2ee6d6]/10 ${i === rows.length - 1 ? "rounded-b-[0.8cqw]" : ""}`}>
                    <Mark v="yes" strong />
                  </span>
                </Appear>
              ))}
            </div>
            <p className="pt-[0.5cqw] text-[0.85cqw] text-white/45">
              Generalized categories, not specific products. Varies = support differs by provider.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-[1.4cqw]">
            <Appear at={5500} t={t} className="rounded-[1.4cqw] border border-[#2ee6d6]/50 bg-[linear-gradient(160deg,rgba(46,230,214,.16),rgba(79,140,255,.10))] p-[1.8cqw]">
              <p className="text-[2.5cqw] font-extrabold leading-[1.12] tracking-[-0.02em]">
                Marketplace <span className="text-[#7ff3ea]">+</span> flexible contracts <span className="text-[#7ff3ea]">+</span> protected settlement
              </p>
            </Appear>
            <Appear at={10500} t={t} className={`${CARD} flex flex-col gap-[0.9cqw]`}>
              <p className="text-[1.6cqw] font-bold">Four payment models. One workflow.</p>
              <ModelChips size={1} />
            </Appear>
          </div>
        </div>
      );
    }

    case "proof":
      return (
        <div className="flex h-full flex-col gap-[1cqw]">
          <div className="grid min-h-0 flex-1 grid-cols-[1.5fr_1fr_1fr] grid-rows-2 gap-[1cqw]">
            {PROOF_SHOTS.map((x, i) => (
              <Appear key={x.slot} at={i * 450} t={t} className={`min-h-0 ${i === 0 ? "row-span-2" : ""}`}>
                <ScreenshotSlot slot={x.slot} title={x.title} className="h-full" />
              </Appear>
            ))}
          </div>
          <div className="flex items-center justify-center gap-[0.8cqw]">
            {["Marketplace", "Protected contracts", "Four payment models", "Work review", "Resolution"].map((x, i) => (
              <span key={x} className="flex items-center gap-[0.8cqw] text-[1.15cqw] font-semibold text-white/75">
                {i > 0 ? <span className="text-[#2ee6d6]" aria-hidden="true">{"\u2022"}</span> : null}
                {x}
              </span>
            ))}
          </div>
        </div>
      );

    case "market": {
      const cards = [
        { tag: "TAM", value: "$8.35B", body: "Global freelance-platform market in 2025", at: 1500, size: 1, assumption: false },
        { tag: "SAM", value: "~$3.05B", body: "Asia-Pacific + Middle East + Africa freelance-platform market in 2025", at: 10500, size: 0.82, assumption: false },
        { tag: "SOM", value: "~$15M", body: "PREMIFLOW long-term target at 0.5% of the defined SAM", at: 16500, size: 0.64, assumption: true },
      ];
      return (
        <div className="flex h-full flex-col gap-[1.1cqw]">
          <div className="grid min-h-0 flex-1 grid-cols-3 gap-[1.4cqw]">
            {cards.map((c) => (
              <Appear
                key={c.tag}
                at={c.at}
                t={t}
                className={`relative flex flex-col overflow-hidden rounded-[1.4cqw] p-[1.6cqw] ${
                  c.assumption ? "border-[0.15cqw] border-dashed border-[#8fb4ff]/50 bg-[#4f8cff]/[0.08]" : "border border-white/10 bg-white/[0.06]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-[4cqw] -top-[4cqw] rounded-full bg-[radial-gradient(circle,rgba(46,230,214,.22),transparent_65%)]"
                  style={{ width: `${16 * c.size}cqw`, height: `${16 * c.size}cqw` }}
                />
                <p className="flex items-center justify-between text-[1.2cqw] font-bold uppercase tracking-[0.22em] text-white/60">
                  {c.tag}
                  <span
                    className={`rounded-full px-[0.8cqw] py-[0.25cqw] text-[0.8cqw] font-semibold normal-case tracking-normal ${
                      c.assumption ? "bg-[#4f8cff]/20 text-[#c3d6ff]" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {c.assumption ? "PREMIFLOW internal target assumption" : "Published market data"}
                  </span>
                </p>
                <p className={`mt-[0.8cqw] text-[5cqw] font-extrabold leading-none tracking-[-0.03em] ${c.assumption ? "text-[#c3d6ff]" : "text-[#7ff3ea]"}`}>
                  {c.value}
                </p>
                <p className="mt-auto text-[1.3cqw] font-semibold leading-snug text-white/80">{c.body}</p>
              </Appear>
            ))}
          </div>
          <Appear at={6000} t={t} className="grid grid-cols-2 gap-[1.4cqw]">
            <p className="flex items-baseline gap-[1cqw] rounded-[1cqw] bg-white/[0.05] px-[1.4cqw] py-[0.8cqw]">
              <span className="text-[2.4cqw] font-extrabold tracking-[-0.02em] text-[#7ff3ea]">$20.12B</span>
              <span className="text-[1.15cqw] text-white/75">projected global freelance-platform market by 2030</span>
            </p>
            <p className="flex items-baseline gap-[1cqw] rounded-[1cqw] bg-white/[0.05] px-[1.4cqw] py-[0.8cqw]">
              <span className="text-[2.4cqw] font-extrabold tracking-[-0.02em] text-white">154M{"\u2013"}435M</span>
              <span className="text-[1.15cqw] text-white/75">estimated global online gig workers</span>
            </p>
          </Appear>
          <p className="text-[0.9cqw] text-white/50">
            Market data: The Business Research Company, 2026 report; World Bank, Working Without Borders. SOM is a
            PREMIFLOW internal target assumption.
          </p>
        </div>
      );
    }

    case "team": {
      const people = [
        {
          name: "Aniqa Armghan",
          initials: "AA",
          role: "Founder & Full-Stack Solana Developer",
          badge: "Founder / Primary Builder",
          background: null,
          items: [
            "Product vision and architecture",
            "Full-stack development",
            "Solana integration",
            "Marketplace and contract workflows",
            "Frontend and backend implementation",
            "Product UX decisions",
            "Testing and QA",
            "Business-model implementation",
            "Overall PREMIFLOW execution",
          ],
          line: "Founder and primary builder of PREMIFLOW \u2014 taking the product from concept to a working Solana Devnet application.",
          until: 9000,
        },
        {
          name: "Armghan Ashraf",
          initials: "AA",
          role: "Business & Financial Strategy Advisor",
          badge: null,
          background:
            "16 years of professional experience across banking and telecommunications, including financial advisory, financial products, customer relationships, sales and business development.",
          items: [
            "Financial-product perspective",
            "Payment and monetization strategy",
            "Customer requirements",
            "Business-model feedback",
            "Marketplace and commercial strategy",
            "Business development guidance",
          ],
          line: "Deep financial-services and customer-facing experience supporting PREMIFLOW\u2019s payment and marketplace strategy.",
          until: 14500,
        },
        {
          name: "Rabia Noor",
          initials: "RN",
          role: "CTO / Developer & DevOps Engineer",
          badge: null,
          background: null,
          items: [
            "Technical architecture support",
            "Development",
            "DevOps",
            "Deployment workflows",
            "Infrastructure",
            "Reliability",
            "Engineering support",
            "Technical execution",
          ],
          line: "Engineering and DevOps capability supporting PREMIFLOW\u2019s technical delivery and infrastructure.",
          until: Infinity,
        },
      ];
      const active = people.findIndex((p) => t < p.until);
      return (
        <div className="flex h-full flex-col gap-[0.9cqw]">
          <p className="-mt-[0.8cqw] text-[1.45cqw] font-semibold text-white/70">Product, engineering and financial-domain experience.</p>
          <div className="grid min-h-0 flex-1 grid-cols-[1.38fr_1fr_1fr] gap-[1.1cqw]">
            {people.map((p, i) => {
              const founder = i === 0;
              return (
                <Appear
                  key={p.name}
                  at={i * 600}
                  t={t}
                  className={`relative flex min-h-0 flex-col overflow-hidden rounded-[1.3cqw] border p-[1.2cqw] transition duration-500 ${
                    founder
                      ? "border-[#2ee6d6]/60 bg-[linear-gradient(165deg,rgba(46,230,214,.16),rgba(79,140,255,.08))]"
                      : "border-white/10 bg-white/[0.05]"
                  } ${i === active ? "shadow-[0_1.4cqw_3cqw_-1.4cqw_rgba(46,230,214,.55)]" : ""}`}
                >
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[0.3cqw]" style={{ background: founder ? ACCENT : "rgba(255,255,255,.18)" }} />
                  <div className="flex items-center gap-[0.9cqw]">
                    <span
                      aria-hidden="true"
                      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${
                        founder ? "size-[4.4cqw] text-[1.6cqw] text-[#04101f]" : "size-[3.4cqw] border border-white/20 bg-white/10 text-[1.2cqw] text-white"
                      }`}
                      style={founder ? { background: ACCENT } : undefined}
                    >
                      {p.initials}
                    </span>
                    <div className="min-w-0">
                      <p className={`font-bold leading-tight tracking-[-0.01em] ${founder ? "text-[1.9cqw]" : "text-[1.55cqw]"}`}>{p.name}</p>
                      <p className="mt-[0.15cqw] text-[1cqw] font-semibold leading-snug text-[#7ff3ea]">{p.role}</p>
                    </div>
                  </div>
                  {p.badge ? (
                    <span className="mt-[0.7cqw] inline-flex w-fit rounded-full px-[0.9cqw] py-[0.25cqw] text-[0.9cqw] font-bold text-[#04101f]" style={{ background: ACCENT }}>
                      {p.badge}
                    </span>
                  ) : null}
                  {p.background ? <p className="mt-[0.6cqw] text-[0.88cqw] leading-snug text-white/70">{p.background}</p> : null}
                  <ul className="mt-[0.7cqw] flex flex-wrap content-start gap-[0.35cqw]">
                    {p.items.map((x) => (
                      <li key={x} className="rounded-full border border-white/12 bg-white/[0.06] px-[0.65cqw] py-[0.2cqw] text-[0.86cqw] font-semibold text-white/85">
                        {x}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-auto border-t border-white/10 pt-[0.6cqw] text-[0.92cqw] font-medium italic leading-snug text-white/75">
                    {"\u201c"}{p.line}{"\u201d"}
                  </p>
                </Appear>
              );
            })}
          </div>
          <Appear at={15500} t={t} className="flex items-baseline justify-between gap-[1.4cqw]">
            <p className="text-[1.65cqw] font-extrabold tracking-[-0.015em]">
              Built by a founder-developer, <span className="text-[#7ff3ea]">supported by finance and engineering expertise.</span>
            </p>
            <p className="shrink-0 text-[1.05cqw] font-semibold text-white/60">From concept to a working Solana Devnet product.</p>
          </Appear>
        </div>
      );
    }

    case "gtm": {
      const stages = [
        { icon: Users, name: "Community", items: ["Solana ecosystem", "Freelancer communities", "Remote-work communities", "University and developer communities"] },
        { icon: Megaphone, name: "Ambassadors", items: ["Campus ambassadors", "Freelancer ambassadors", "Regional community leaders"] },
        { icon: Video, name: "Content & education", items: ["Product demonstrations", "Freelancing education", "X / LinkedIn / YouTube", "Community forums"] },
        { icon: Handshake, name: "Performance & partnerships", items: ["Targeted digital ads", "Freelancer communities", "Web3 ecosystem partnerships", "Agency and startup partnerships"] },
      ];
      const funnel = ["Community", "First users", "Successful contracts", "Referrals", "Regional growth"];
      const lit = Math.floor(ramp(t, 13000, 5000) * funnel.length);
      return (
        <div className="flex h-full flex-col gap-[1.2cqw]">
          <div className="grid min-h-0 flex-1 grid-cols-4 gap-[1.1cqw]">
            {stages.map(({ icon: Icon, name, items }, i) => (
              <Appear key={name} at={1500 + i * 2200} t={t} className={`${CARD} flex min-h-0 flex-col`}>
                <p className="flex items-center gap-[0.7cqw]">
                  <span className="flex size-[2.4cqw] items-center justify-center rounded-full text-[1.15cqw] font-extrabold text-[#04101f]" style={{ background: ACCENT }}>
                    {i + 1}
                  </span>
                  <Icon className="size-[1.6cqw] text-[#7ff3ea]" aria-hidden="true" />
                </p>
                <p className="mt-[0.8cqw] text-[1.45cqw] font-bold uppercase leading-tight tracking-[0.06em]">{name}</p>
                <ul className="mt-[0.7cqw] space-y-[0.45cqw]">
                  {items.map((x) => (
                    <li key={x} className="flex items-start gap-[0.5cqw] text-[1.08cqw] leading-snug text-white/75">
                      <span className="mt-[0.5cqw] size-[0.45cqw] shrink-0 rounded-full bg-[#2ee6d6]" aria-hidden="true" />
                      {x}
                    </li>
                  ))}
                </ul>
              </Appear>
            ))}
          </div>
          <Appear at={12000} t={t} className="flex items-stretch">
            {funnel.map((f, i) => (
              <span
                key={f}
                className={`flex flex-1 items-center justify-center py-[0.8cqw] pl-[1.6cqw] pr-[1cqw] text-center text-[1.2cqw] font-bold transition duration-500 ${
                  i < lit || lit >= funnel.length ? "bg-[#2ee6d6]/20 text-white" : "bg-white/[0.06] text-white/55"
                } ${i === 0 ? "rounded-l-full" : ""} ${i === funnel.length - 1 ? "rounded-r-full" : ""}`}
                style={{ clipPath: i === funnel.length - 1 ? undefined : "polygon(0 0, calc(100% - 1.2cqw) 0, 100% 50%, calc(100% - 1.2cqw) 100%, 0 100%, 1.2cqw 50%)" }}
              >
                {f}
              </span>
            ))}
          </Appear>
        </div>
      );
    }

    case "funding": {
      const uses = [
        { pct: 40, label: "Engineering, security and smart-contract audits", color: "#2ee6d6" },
        { pct: 25, label: "User acquisition, ambassadors and community growth", color: "#4f8cff" },
        { pct: 15, label: "Legal, compliance and market readiness", color: "#8b7bff" },
        { pct: 10, label: "Infrastructure and operations", color: "#7ff3ea" },
        { pct: 10, label: "Partnerships, testing and product research", color: "#c3d6ff" },
      ];
      const milestones = [
        "Security hardening",
        "Mainnet readiness",
        "Early user acquisition",
        "Marketplace liquidity",
        "Regional launch",
        "Partnerships",
        "Operational readiness",
      ];
      const draw = ramp(t, 6000, 2500);
      const R = 40;
      const C = 2 * Math.PI * R;
      let offset = 0;
      return (
        <div className="flex h-full flex-col gap-[1.2cqw]">
          <div className="grid min-h-0 flex-1 grid-cols-[0.9fr_1.6fr] gap-[1.6cqw]">
            <Appear at={0} t={t} className="flex flex-col justify-center rounded-[1.4cqw] border border-[#2ee6d6]/50 bg-[linear-gradient(160deg,rgba(46,230,214,.16),rgba(79,140,255,.08))] p-[1.8cqw]">
              <p className="text-[1.1cqw] font-bold uppercase tracking-[0.22em] text-white/60">Proposed raise</p>
              <p className="mt-[0.4cqw] text-[7cqw] font-extrabold leading-none tracking-[-0.04em] text-white">$500K</p>
              <p className="mt-[0.5cqw] text-[1.7cqw] font-bold text-[#7ff3ea]">Pre-seed target</p>
              <p className="mt-[1.2cqw] inline-flex w-fit rounded-full bg-white/10 px-[1.1cqw] py-[0.4cqw] text-[1.2cqw] font-semibold">
                Target runway: 12{"\u2013"}18 months
              </p>
              <p className="mt-[1cqw] text-[0.95cqw] text-white/50">Proposed future funding target. Not yet raised.</p>
            </Appear>
            <div className={`${CARD} flex items-center gap-[1.8cqw]`}>
              <svg viewBox="0 0 100 100" className="size-[17cqw] shrink-0 -rotate-90" aria-hidden="true">
                <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="14" />
                {uses.map((u) => {
                  const len = (u.pct / 100) * C * draw;
                  const el = (
                    <circle
                      key={u.label}
                      cx="50"
                      cy="50"
                      r={R}
                      fill="none"
                      stroke={u.color}
                      strokeWidth="14"
                      strokeDasharray={`${Math.max(0, len - 0.6)} ${C}`}
                      strokeDashoffset={-offset * draw}
                    />
                  );
                  offset += (u.pct / 100) * C;
                  return el;
                })}
              </svg>
              <ul className="flex min-w-0 flex-1 flex-col gap-[0.75cqw]">
                {uses.map((u, i) => (
                  <Appear key={u.label} at={6000 + i * 450} t={t} className="flex items-center gap-[0.9cqw]">
                    <span className="w-[4.6cqw] shrink-0 text-[2cqw] font-extrabold tabular-nums tracking-[-0.02em]" style={{ color: u.color }}>
                      {u.pct}%
                    </span>
                    <span className="text-[1.2cqw] font-semibold leading-snug text-white/85">{u.label}</span>
                  </Appear>
                ))}
              </ul>
            </div>
          </div>
          <Appear at={12500} t={t} className="flex flex-wrap items-center gap-[0.6cqw]">
            <span className="mr-[0.4cqw] text-[1cqw] font-bold uppercase tracking-[0.18em] text-white/55">Milestones funded</span>
            {milestones.map((m) => (
              <span key={m} className="rounded-full border border-white/15 bg-white/5 px-[1cqw] py-[0.4cqw] text-[1.05cqw] font-semibold text-white/85">
                {m}
              </span>
            ))}
          </Appear>
        </div>
      );
    }

    case "closing":
    default:
      return <ClosingSlide t={t} />;
  }
}
