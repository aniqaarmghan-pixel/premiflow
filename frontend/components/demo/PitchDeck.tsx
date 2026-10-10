"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  FileCode,
  FileText,
  Gavel,
  Layers,
  MessageSquare,
  Pause,
  Play,
  Puzzle,
  Receipt,
  Repeat,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  StickyNote,
  Store,
  UserRound,
  Video,
  Volume2,
  VolumeX,
  Wallet,
  Zap,
} from "lucide-react";

import { TypeMotif } from "@/components/contracts/TypeMotif";
import { formatDemoTime } from "@/lib/app/landing-explainer";
import { MARKETPLACE_PITCH_VOICEOVER, isSafeHeroMediaSrc } from "@/lib/app/marketplace-media";
import {
  PITCH_CLIP_SLOTS,
  PITCH_SCREENSHOT_SLOTS,
  PITCH_SLIDES,
  PITCH_SPEECH_OVERRUN_CAP_MS,
  pitchTotalWords,
  type PitchClipSlot,
} from "@/lib/app/pitch-deck";
import { SUBSCRIPTION_PLANS } from "@/lib/app/subscription-plans";
import { useNarratedSequence } from "@/lib/hooks/useNarratedSequence";
import { CaptionBand, ControlButton, CountdownOverlay, DemoMark, RecordOverlay, describeVoice } from "./DemoKit";
import { ProductScreen, Scaled } from "./PitchScreens";

/**
 * PREMIFLOW pitch deck (/demo/pitch): 10 slides in one 16:9 composition for
 * live presenting and one-take screen recording. Product visuals are real
 * screenshots when configured (PITCH_SCREENSHOT_SLOTS) and otherwise the real
 * app components rendered with sample data. Presentation only.
 */

const SLIDES = PITCH_SLIDES;

/**
 * studio=false: clean presentation view (/demo/pitch).
 * studio=true: internal /demo/pitch/studio with Record Presentation, Autoplay,
 * slide timing, narration script and speaker notes.
 */
export function PitchDeck({ studio = false }: { studio?: boolean } = {}) {
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

  return (
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
            Full script: {pitchTotalWords()} words, about {formatDemoTime(totalMs)} at 150 words per minute including
            slide holds. Record Mode counts down 3, 2, 1, plays every slide once with narration and captions, and ends on
            the closing slide. Screenshot slots in use:{" "}
            {Object.values(PITCH_SCREENSHOT_SLOTS).filter(Boolean).length} of {Object.keys(PITCH_SCREENSHOT_SLOTS).length}{" "}
            (drop PNG/WebP files in public/media/pitch/ and set PITCH_SCREENSHOT_SLOTS).
          </p>
        </section>
      ) : null}
    </div>
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

function BrandSlide({ t, closing }: { t: number; closing: boolean }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center text-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[38%] size-[34cqw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(46,230,214,.18),transparent_65%)]"
      />
      <DemoMark h={closing ? 8.4 : 7.4} />
      <p className="mt-[2.2cqw] text-[3.3cqw] font-bold tracking-[-0.025em]">Freelance work. Protected on Solana.</p>
      <p className="mt-[0.8cqw] text-[1.7cqw] text-white/70">One freelance marketplace. Four ways to get paid.</p>
      <Appear at={closing ? 600 : 1200} t={t} className="mt-[2cqw] flex items-center gap-[0.8cqw]">
        {MODELS.map((m, i) => (
          <span key={m} className="flex items-center gap-[0.8cqw]">
            {i > 0 ? <span className="text-[1.4cqw] text-[#2ee6d6]" aria-hidden="true">{"\u2022"}</span> : null}
            <span className="rounded-full border border-white/20 bg-white/5 px-[1.4cqw] py-[0.55cqw] text-[1.35cqw] font-semibold">{m}</span>
          </span>
        ))}
      </Appear>
      <Appear at={closing ? 1200 : 2200} t={t} className="mt-[1.8cqw]">
        <DevnetPill />
      </Appear>
    </div>
  );
}

/* --------------------------------- slides --------------------------------- */

function SlideBody({ id, t }: { id: (typeof SLIDES)[number]["id"]; t: number }) {
  switch (id) {
    case "title":
      return <BrandSlide t={t} closing={false} />;

    case "problem": {
      const problems = [
        { icon: Layers, text: "Hiring and payments often happen across separate tools" },
        { icon: Wallet, text: "Freelancers worry about getting paid" },
        { icon: ShieldAlert, text: "Employers worry about paying before acceptable work is delivered" },
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
      const lit = Math.min(flow.length, Math.floor(t / 1000) + 1);
      const points = [
        "Marketplace discovery",
        "Clear contract terms",
        "Protected funding",
        "Flexible payment models",
        "Work review",
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
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_1fr_0.62fr] gap-[1.4cqw]">
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

    case "how": {
      const steps = [
        { label: "Find work or talent", slot: "marketplace", title: "Marketplace" },
        { label: "Send or review proposal", slot: "proposals", title: "Proposals" },
        { label: "Create & fund offer", slot: "offer", title: "Create contract" },
        { label: "Freelancer accepts", slot: "accept", title: "Offer" },
        { label: "Submit & review work", slot: "work", title: "Work review" },
        { label: "Release or withdraw earnings", slot: "earnings", title: "Earnings" },
      ] as const;
      const active = Math.min(steps.length - 1, Math.floor(t / 1900));
      return (
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-[1.2cqw]">
          {steps.map((s, i) => (
            <Appear
              key={s.label}
              at={i * 1500}
              t={t}
              className={`flex min-h-0 flex-col gap-[0.6cqw] rounded-[1.2cqw] border p-[0.8cqw] transition duration-500 ${
                i === active ? "border-[#2ee6d6]/70 bg-[#2ee6d6]/10" : "border-white/10 bg-white/[0.04]"
              }`}
            >
              <p className="flex items-center gap-[0.7cqw] text-[1.25cqw] font-bold">
                <span className="flex size-[2cqw] shrink-0 items-center justify-center rounded-full text-[1.05cqw] text-[#04101f]" style={{ background: ACCENT }}>
                  {i + 1}
                </span>
                {s.label}
              </p>
              <ProductScreen slot={s.slot} title={s.title} width={1100} compact className="min-h-0 flex-1" />
            </Appear>
          ))}
        </div>
      );
    }

    case "models": {
      const cards = [
        { type: "Fixed", body: "One agreed payment for clearly scoped work.", at: 1800 },
        { type: "Milestone", body: "Break larger projects into stages with staged progress and payment.", at: 4400 },
        { type: "Streaming", body: "Earnings accrue over time for ongoing work.", at: 7000 },
        { type: "Hourly", body: "Payment follows approved working time.", at: 10400 },
      ] as const;
      const active = cards.reduce((acc, c, i) => (t >= c.at ? i : acc), -1);
      return (
        <div className="grid h-full grid-cols-4 gap-[1.3cqw]">
          {cards.map((c, i) => (
            <Appear
              key={c.type}
              at={i * 350}
              t={t}
              className={`flex flex-col rounded-[1.3cqw] border p-[1.3cqw] transition duration-500 ${
                i === active
                  ? "border-[#2ee6d6]/70 bg-[linear-gradient(180deg,rgba(46,230,214,.14),rgba(255,255,255,.04))] shadow-[0_1.5cqw_3cqw_-1.5cqw_rgba(46,230,214,.5)]"
                  : "border-white/10 bg-white/[0.05]"
              }`}
            >
              <div className="overflow-hidden rounded-[0.9cqw] bg-white">
                <Scaled width={240} className="aspect-[5/2]">
                  <TypeMotif type={c.type} active={i === active} />
                </Scaled>
              </div>
              <p className="mt-[1.4cqw] text-[1.1cqw] font-bold uppercase tracking-[0.2em] text-[#7ff3ea]">{c.type}</p>
              <p className="mt-[0.6cqw] text-[1.6cqw] font-semibold leading-snug">{c.body}</p>
            </Appear>
          ))}
        </div>
      );
    }

    case "protection":
      return (
        <div className="grid h-full grid-cols-[1fr_1.12fr] gap-[1.8cqw]">
          <div className="flex min-h-0 flex-col gap-[1.2cqw]">
            <div className={CARD}>
              <p className="text-[1.05cqw] font-semibold uppercase tracking-[0.16em] text-white/55">Before acceptance, the freelancer can</p>
              <div className="mt-[0.8cqw] flex gap-[0.7cqw]">
                <span className="rounded-full px-[1.4cqw] py-[0.6cqw] text-[1.25cqw] font-bold text-[#04101f]" style={{ background: ACCENT }}>Accept</span>
                <span className="rounded-full border border-white/35 px-[1.4cqw] py-[0.6cqw] text-[1.25cqw] font-bold">Request Changes</span>
                <span className="rounded-full border border-white/15 px-[1.4cqw] py-[0.6cqw] text-[1.25cqw] font-semibold text-white/70">Decline</span>
              </div>
            </div>
            <Appear at={4200} t={t} className="flex items-center gap-[0.6cqw]">
              {["Request Changes", "Cancel & Revise", "New protected offer"].map((s, i) => (
                <span key={s} className="flex flex-1 items-center gap-[0.6cqw]">
                  <span className={`flex min-h-[3.6cqw] flex-1 items-center justify-center rounded-[0.9cqw] border px-[0.6cqw] text-center text-[1.2cqw] font-semibold ${i === 2 ? "border-[#2ee6d6]/60 bg-[#2ee6d6]/12" : "border-white/15 bg-white/[0.05]"}`}>
                    {s}
                  </span>
                  {i < 2 ? <ArrowRight className="size-[1.3cqw] shrink-0 text-white/40" aria-hidden="true" /> : null}
                </span>
              ))}
            </Appear>
            <Appear at={11500} t={t} className="mt-auto rounded-[1.3cqw] border border-[#2ee6d6]/50 bg-[#2ee6d6]/10 p-[1.5cqw]">
              <p className="flex items-center gap-[0.8cqw] text-[1.1cqw] font-semibold text-white/70">
                <Sparkles className="size-[1.4cqw] text-[#c3caff]" aria-hidden="true" /> Neutral case summary
                <ArrowRight className="size-[1.2cqw] text-white/40" aria-hidden="true" />
                <Gavel className="size-[1.4cqw] text-[#7ff3ea]" aria-hidden="true" /> Final decision
              </p>
              <p className="mt-[0.6cqw] text-[2.7cqw] font-extrabold leading-tight tracking-[-0.02em]">
                AI assists. <span className="text-[#7ff3ea]">A human resolver decides.</span>
              </p>
            </Appear>
          </div>
          <ProductScreen slot="resolution" title="Resolution Desk" className="h-full" />
        </div>
      );

    case "solana": {
      const items = [
        { icon: Zap, label: "Fast transaction finality" },
        { icon: Receipt, label: "Low transaction costs" },
        { icon: FileCode, label: "Programmable on-chain agreements" },
        { icon: Eye, label: "Transparent settlement state" },
      ];
      return (
        <div className="flex h-full flex-col gap-[1.6cqw]">
          <div className="grid flex-1 grid-cols-4 gap-[1.3cqw]">
            {items.map(({ icon: Icon, label }, i) => (
              <Appear key={label} at={i * 700} t={t} className={`${CARD} flex flex-col`}>
                <span className="flex size-[4.4cqw] items-center justify-center rounded-[1.1cqw] bg-[#2ee6d6]/12">
                  <Icon className="size-[2.4cqw] text-[#2ee6d6]" aria-hidden="true" />
                </span>
                <p className="mt-auto text-[1.9cqw] font-bold leading-snug tracking-[-0.01em]">{label}</p>
              </Appear>
            ))}
          </div>
          <Appear at={3600} t={t}>
            <p className="text-center text-[1.4cqw] text-white/70">The marketplace experience stays familiar for everyday users.</p>
          </Appear>
        </div>
      );
    }

    case "business":
      return (
        <div className="flex h-full flex-col gap-[1.2cqw]">
          <div className="grid flex-1 grid-cols-3 gap-[1.4cqw]">
            {SUBSCRIPTION_PLANS.map((plan, i) => {
              const free = plan.monthlyUsd === 0;
              const top = plan.tier === "Premium";
              return (
                <Appear
                  key={plan.tier}
                  at={i * 700}
                  t={t}
                  className={`flex flex-col rounded-[1.3cqw] border p-[1.5cqw] ${
                    top ? "border-[#2ee6d6]/60 bg-[linear-gradient(180deg,rgba(46,230,214,.12),rgba(255,255,255,.04))]" : "border-white/10 bg-white/[0.06]"
                  }`}
                >
                  <p className="text-[1.15cqw] font-bold uppercase tracking-[0.2em] text-white/60">{plan.name}</p>
                  <p className="mt-[0.5cqw] text-[2.3cqw] font-extrabold tracking-[-0.02em]">
                    {free ? "$0 subscription" : `${plan.monthlyUsd} Demo USDT / month`}
                  </p>
                  <p className="text-[1.15cqw] text-white/55">{free ? "Included with every account" : `or ${plan.annualUsd} / year`}</p>
                  <p className="mt-auto text-[4cqw] font-extrabold leading-none text-[#7ff3ea]">{`${plan.feeBps / 100}%`}</p>
                  <p className="mt-[0.4cqw] text-[1.15cqw] text-white/70">
                    {free ? "Current launch PREMIFLOW platform fee, per participant" : top ? "PREMIFLOW platform fee on new contracts" : "PREMIFLOW platform fee"}
                  </p>
                </Appear>
              );
            })}
          </div>
          <p className="text-[1.5cqw] font-semibold">Each participant&apos;s own plan determines their own fee.</p>
          <p className="text-[1cqw] text-white/50">
            Current Devnet pricing model. Demo USDT is a Devnet test asset. A plan belongs to the wallet that pays for it
            and covers both hiring and working with that wallet.
          </p>
        </div>
      );

    case "product": {
      const tiles = [
        { slot: "marketplace", title: "Marketplace", span: "col-span-2" },
        { slot: "offer", title: "Create contract", span: "" },
        { slot: "contract", title: "Contract detail", span: "" },
        { slot: "messages", title: "Messages", span: "" },
        { slot: "notifications", title: "Notifications", span: "" },
        { slot: "resolution", title: "Resolution Desk", span: "col-span-2" },
        { slot: "pricing", title: "Pricing", span: "" },
      ] as const;
      const facts = [
        "Marketplace MVP",
        "Fixed / Milestone / Streaming / Hourly",
        "Protected funding",
        "Work submission & approval",
        "Safe offer revisions",
        "Dispute evidence workflow",
        "AI case summarization",
        "Human resolver",
        "Subscriptions & fees",
        "Solana Devnet",
      ];
      return (
        <div className="grid h-full grid-cols-[1.75fr_1fr] gap-[1.6cqw]">
          <ClipSlot slot="product">
            <div className="grid h-full grid-cols-3 grid-rows-3 gap-[0.8cqw]">
              {tiles.map((x, i) => (
                <Appear key={x.title} at={i * 220} t={t} className={`min-h-0 ${x.span}`}>
                  <ProductScreen slot={x.slot} title={x.title} width={x.span ? 1280 : 1000} compact className="h-full" />
                </Appear>
              ))}
            </div>
          </ClipSlot>
          <div className="flex min-h-0 flex-col gap-[0.45cqw]">
            {facts.map((f, i) => (
              <Appear key={f} at={600 + i * 550} t={t} className="flex items-center gap-[0.6cqw] rounded-[0.7cqw] bg-white/[0.06] px-[0.9cqw] py-[0.42cqw]">
                <BadgeCheck className="size-[1.3cqw] shrink-0 text-[#5be37a]" aria-hidden="true" />
                <span className="text-[1.12cqw] font-semibold">{f}</span>
              </Appear>
            ))}
          </div>
        </div>
      );
    }

    case "closing":
    default:
      return <BrandSlide t={t} closing />;
  }
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
