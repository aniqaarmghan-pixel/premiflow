"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  FileText,
  Gavel,
  Handshake,
  Layers,
  LifeBuoy,
  Lock,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Store,
  Users,
  Video,
  Volume2,
  VolumeX,
  Wallet,
  Waves,
  Zap,
} from "lucide-react";

import { formatDemoTime } from "@/lib/app/landing-explainer";
import { MARKETPLACE_PITCH_VOICEOVER, isSafeHeroMediaSrc } from "@/lib/app/marketplace-media";
import {
  PITCH_CLIP_SLOTS,
  PITCH_SLIDES,
  PITCH_SPEECH_OVERRUN_CAP_MS,
  pitchTotalWords,
  type PitchClipSlot,
} from "@/lib/app/pitch-deck";
import { SUBSCRIPTION_PLANS, planPriceLabel } from "@/lib/app/subscription-plans";
import { useNarratedSequence } from "@/lib/hooks/useNarratedSequence";
import { CaptionBand, ControlButton, CountdownOverlay, DemoMark, RecordOverlay, describeVoice } from "./DemoKit";

/**
 * Private PREMIFLOW pitch deck (/demo/pitch): 10 slides in one 16:9
 * composition for live presenting, screen recording, and later PPT/PDF
 * export. Reuses the /demo narration engine (voice, captions, Record Mode).
 * Presentation only; every product fact maps to the current codebase.
 */

const SLIDES = PITCH_SLIDES;

/**
 * studio=false: clean presentation view (/demo/pitch).
 * studio=true: internal /demo/pitch/studio with Record Presentation, speaker
 * notes, slide list, browser-voice details and script stats.
 */
export function PitchDeck({ studio = false }: { studio?: boolean } = {}) {
  const seq = useNarratedSequence({
    items: SLIDES,
    voiceoverSrc: MARKETPLACE_PITCH_VOICEOVER,
    overrunCapMs: PITCH_SPEECH_OVERRUN_CAP_MS,
  });
  const [captionsOn, setCaptionsOn] = useState(true);
  const [notesOn, setNotesOn] = useState(true);
  const { status, index, elapsed, position, totalMs, voiceOn, recordMode, countdownLabel, jumpTo } = seq;
  const slide = SLIDES[index];

  // Keyboard: arrows / Page keys move between slides; Home / End jump.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") jumpTo(index + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") jumpTo(index - 1);
      else if (e.key === "Home") jumpTo(0);
      else if (e.key === "End") jumpTo(SLIDES.length - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, jumpTo]);

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
          onClick={() => jumpTo(index - 1)}
          disabled={index === 0}
          icon={<ChevronLeft size={16} aria-hidden="true" />}
          label="Previous"
        />
        {status === "playing" ? (
          <ControlButton onClick={seq.pause} icon={<Pause size={16} aria-hidden="true" />} label="Pause" primary />
        ) : (
          <ControlButton
            onClick={seq.play}
            icon={<Play size={16} aria-hidden="true" />}
            label={status === "paused" ? "Resume" : "Play narrated"}
            primary
          />
        )}
        <ControlButton
          onClick={() => jumpTo(index + 1)}
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
            {voiceOn ? describeVoice(seq.voiceSource, seq.voiceName) : "Voice off \u2014 captions only"}
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
              onClick={() => jumpTo(i)}
              aria-current={i === index ? "step" : undefined}
              className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                i === index ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-paper-2"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          </li>
        ))}
      </ol>
      ) : null}

      {studio && notesOn ? (
        <section aria-label="Speaker notes" className="mt-5 rounded-[16px] border border-line bg-card p-4 text-sm leading-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Script {"\u00b7"} {slide.label}</p>
          <p className="mt-1 text-ink">{slide.narration}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Notes</p>
          <p className="mt-1 text-ink-soft">{slide.notes}</p>
          <p className="mt-3 text-xs text-ink-faint">
            Full script: {pitchTotalWords()} words, about {formatDemoTime(totalMs)} at a natural pace. Record Mode counts
            down 3, 2, 1, plays every slide once with narration and captions, and ends on the closing slide.
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
        className="absolute inset-0 bg-[radial-gradient(70%_60%_at_85%_0%,rgba(46,230,214,.16),transparent_60%),radial-gradient(60%_60%_at_0%_100%,rgba(124,140,255,.18),transparent_60%),linear-gradient(160deg,#050b16,#0b1d33)]"
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
          brand ? "top-[5cqw] bottom-[11cqw]" : "top-[7.2cqw] bottom-[11.5cqw]"
        }`}
      >
        {!brand ? (
          <h2 className="mb-[1.8cqw] max-w-[80cqw] text-[3cqw] font-bold leading-[1.1] tracking-[-0.025em]">{slide.heading}</h2>
        ) : null}
        <div className="relative min-h-0 flex-1">
          <SlideBody id={slide.id} t={t} />
        </div>
      </div>

      {captionsOn && slide.caption ? <CaptionBand id={slide.id} text={slide.caption} /> : null}

      {showProgress ? (
        <div aria-hidden="true" className="absolute inset-x-[5cqw] bottom-[1.2cqw] flex gap-[0.4cqw]">
          {SLIDES.map((s, i) => (
            <span key={s.id} className={`h-[0.25cqw] flex-1 rounded-full ${i <= index ? "bg-[#2ee6d6]" : "bg-white/15"}`} />
          ))}
        </div>
      ) : null}

      {countdownLabel ? <CountdownOverlay label={countdownLabel} /> : null}
    </div>
  );
}

/* ----------------------------- building blocks ----------------------------- */

const CARD = "rounded-[1.2cqw] border border-white/10 bg-white/[0.06] p-[1.4cqw]";
const ACCENT = "linear-gradient(135deg,#2ee6d6,#7c8cff)";

function Appear({ at, t, children, className = "" }: { at: number; t: number; children: ReactNode; className?: string }) {
  if (t < at) return <div className={`${className} invisible`} aria-hidden="true">{children}</div>;
  return <div className={`pf-demo-in ${className}`}>{children}</div>;
}

function Chip({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "muted" | "green" | "violet" }) {
  const cls = {
    cyan: "bg-[#2ee6d6]/15 text-[#7ff3ea]",
    muted: "bg-white/10 text-white/75",
    green: "bg-[#28c840]/15 text-[#5be37a]",
    violet: "bg-[#7c8cff]/20 text-[#c3caff]",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-[0.4cqw] rounded-full px-[0.9cqw] py-[0.35cqw] text-[1.05cqw] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function Bar({ value, tone = ACCENT }: { value: number; tone?: string }) {
  return (
    <span className="block h-[0.7cqw] w-full overflow-hidden rounded-full bg-white/10">
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: tone }} />
    </span>
  );
}

function Line({ w, tone = "rgba(255,255,255,.22)" }: { w: number; tone?: string }) {
  return <span className="block h-[0.55cqw] rounded-full" style={{ width: `${w}%`, background: tone }} />;
}

const ramp = (t: number, start: number, length: number) => Math.min(1, Math.max(0, (t - start) / length));

/** Optional product-demo clip; falls back to the built-in mockup. */
function ClipSlot({ slot, children }: { slot: PitchClipSlot; children: ReactNode }) {
  const src = PITCH_CLIP_SLOTS[slot];
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => true);
  if (!src || !isSafeHeroMediaSrc(src)) return <>{children}</>;
  return (
    <div className="h-full overflow-hidden rounded-[1.2cqw] border border-white/15 bg-black">
      <video
        src={src}
        muted
        loop
        playsInline
        autoPlay={!reduced}
        controls={reduced}
        preload="metadata"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function WindowFrame({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-[1.1cqw] border border-white/10 bg-[#0b1526] ${className}`}>
      <div className="flex items-center gap-[0.4cqw] border-b border-white/10 px-[1cqw] py-[0.6cqw]">
        <span className="size-[0.6cqw] rounded-full bg-[#ff5f57]" />
        <span className="size-[0.6cqw] rounded-full bg-[#febc2e]" />
        <span className="size-[0.6cqw] rounded-full bg-[#28c840]" />
        <span className="ml-[0.6cqw] text-[0.95cqw] font-semibold text-white/70">{title}</span>
      </div>
      <div className="min-h-0 flex-1 p-[1cqw]">{children}</div>
    </div>
  );
}

/* --------------------------------- slides --------------------------------- */

function SlideBody({ id, t }: { id: (typeof SLIDES)[number]["id"]; t: number }) {
  switch (id) {
    case "title":
      return (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <DemoMark h={7} />
          <p className="mt-[2.2cqw] text-[3cqw] font-semibold tracking-[-0.02em]">Freelance work. Protected on Solana.</p>
          <p className="mt-[0.8cqw] text-[1.6cqw] text-white/70">One freelance marketplace. Four ways to get paid.</p>
          <Appear at={1200} t={t} className="mt-[2.2cqw] flex gap-[1cqw]">
            {["Fixed", "Milestone", "Streaming", "Hourly"].map((m) => (
              <span key={m} className="rounded-full border border-white/20 bg-white/5 px-[1.4cqw] py-[0.6cqw] text-[1.3cqw] font-semibold">
                {m}
              </span>
            ))}
          </Appear>
        </div>
      );
    case "problem": {
      const items = [
        { icon: Handshake, title: "Trust between strangers", body: "Work often starts before either side knows the other." },
        { icon: Lock, title: "Rigid payment structures", body: "One payment model rarely fits every kind of work." },
        { icon: Clock, title: "Manual payment follow-up", body: "Freelancers spend time chasing what they are owed." },
        { icon: Layers, title: "Fragmented tools", body: "Discovery, agreements and payments live in different places." },
        { icon: Scale, title: "Difficult disputes", body: "Evidence is scattered and outcomes are hard to reach." },
      ];
      return (
        <div className="grid h-full grid-cols-6 gap-[1.2cqw]">
          {items.map(({ icon: Icon, title, body }, i) => (
            <Appear key={title} at={i * 700} t={t} className={`${CARD} ${i < 3 ? "col-span-2" : "col-span-3"} flex flex-col`}>
              <Icon className="size-[2.2cqw] text-[#2ee6d6]" aria-hidden="true" />
              <p className="mt-[0.8cqw] text-[1.5cqw] font-bold">{title}</p>
              <p className="mt-[0.3cqw] text-[1.15cqw] leading-snug text-white/65">{body}</p>
            </Appear>
          ))}
        </div>
      );
    }
    case "solution": {
      const steps = ["Find work / Hire talent", "Proposal", "Agree terms", "Protected contract", "Work", "Approval", "Payment"];
      const shown = Math.min(steps.length, Math.floor(t / 900) + 1);
      return (
        <div className="flex h-full flex-col gap-[1.4cqw]">
          <div className="flex items-stretch gap-[0.5cqw]">
            {steps.map((s, i) => (
              <div key={s} className="flex flex-1 items-center gap-[0.5cqw]">
                <div
                  className={`flex min-h-[4.6cqw] flex-1 items-center justify-center rounded-[0.9cqw] border px-[0.6cqw] text-center text-[1.05cqw] font-semibold leading-tight transition duration-500 ${
                    i < shown
                      ? i >= 3
                        ? "border-[#2ee6d6]/60 bg-[#2ee6d6]/12 text-white"
                        : "border-[#7c8cff]/50 bg-[#7c8cff]/12 text-white"
                      : "border-white/10 text-white/30"
                  }`}
                >
                  {s}
                </div>
                {i < steps.length - 1 ? <ArrowRight className="size-[1.2cqw] shrink-0 text-white/35" aria-hidden="true" /> : null}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[0.5cqw] text-[1cqw] font-semibold">
            <span className="col-span-3 rounded-full bg-[#7c8cff]/15 py-[0.4cqw] text-center text-[#c3caff]">Familiar marketplace UX</span>
            <span className="col-span-4 rounded-full bg-[#2ee6d6]/15 py-[0.4cqw] text-center text-[#7ff3ea]">Funding and settlement on Solana</span>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[3fr_2fr] gap-[1.4cqw]">
            <ClipSlot slot="contract">
              <WindowFrame title="Protected contract" className="h-full">
                <div className="grid h-full grid-cols-2 gap-[1cqw]">
                  <div className="space-y-[0.6cqw] text-[1.05cqw]">
                    {[
                      ["Payment model", "Milestone"],
                      ["Total", "$2,400"],
                      ["Schedule", "3 milestones"],
                      ["Resolver", "Human resolver"],
                    ].map(([k, v]) => (
                      <p key={k} className="flex justify-between rounded-[0.6cqw] bg-white/5 px-[0.8cqw] py-[0.45cqw]">
                        <span className="text-white/60">{k}</span>
                        <span className="font-semibold">{v}</span>
                      </p>
                    ))}
                  </div>
                  <div className="flex flex-col justify-center gap-[0.8cqw]">
                    <p className="text-[1.05cqw] text-white/60">Escrow</p>
                    <Bar value={ramp(t, 3000, 3500)} />
                    <Chip tone={ramp(t, 3000, 3500) >= 1 ? "green" : "muted"}>
                      {ramp(t, 3000, 3500) >= 1 ? "Funded" : "Funding\u2026"}
                    </Chip>
                  </div>
                </div>
              </WindowFrame>
            </ClipSlot>
            <div className={`${CARD} flex flex-col justify-center`}>
              <p className="text-[1.5cqw] font-bold leading-snug">Normal marketplace UX, Solana-powered funding and settlement.</p>
              <p className="mt-[0.8cqw] text-[1.15cqw] leading-snug text-white/65">
                Discovery, proposals and messaging work like the web apps people know. Contract funding and payment
                release run on Solana.
              </p>
            </div>
          </div>
        </div>
      );
    }
    case "models": {
      const stream = ramp(t, 1000, 9000);
      return (
        <div className="grid h-full grid-cols-4 gap-[1.2cqw]">
          <Appear at={0} t={t} className={`${CARD} flex flex-col`}>
            <FileText className="size-[2.2cqw] text-[#2ee6d6]" aria-hidden="true" />
            <p className="mt-[0.8cqw] text-[1.7cqw] font-bold">Fixed</p>
            <p className="text-[1.15cqw] text-white/65">One agreed payment.</p>
            <div className="mt-auto rounded-[0.9cqw] border border-white/10 bg-white/5 p-[1cqw] text-center">
              <p className="text-[2.4cqw] font-extrabold tracking-[-0.02em]">$900</p>
              <Chip tone="green"><CheckCircle2 className="size-[1cqw]" aria-hidden="true" /> On approval</Chip>
            </div>
          </Appear>
          <Appear at={600} t={t} className={`${CARD} flex flex-col`}>
            <Layers className="size-[2.2cqw] text-[#7c8cff]" aria-hidden="true" />
            <p className="mt-[0.8cqw] text-[1.7cqw] font-bold">Milestone</p>
            <p className="text-[1.15cqw] text-white/65">Release payment stage by stage.</p>
            <div className="mt-auto space-y-[0.6cqw]">
              {["Design", "Build", "Launch"].map((m, i) => {
                const done = t > 2500 + i * 2200;
                return (
                  <p key={m} className="flex items-center justify-between rounded-[0.6cqw] bg-white/5 px-[0.8cqw] py-[0.45cqw] text-[1.05cqw]">
                    <span>{m}</span>
                    {done ? <CheckCircle2 className="size-[1.2cqw] text-[#5be37a]" aria-hidden="true" /> : <span className="text-white/40">Pending</span>}
                  </p>
                );
              })}
            </div>
          </Appear>
          <Appear at={1200} t={t} className={`${CARD} flex flex-col`}>
            <Waves className="size-[2.2cqw] text-[#2ee6d6]" aria-hidden="true" />
            <p className="mt-[0.8cqw] text-[1.7cqw] font-bold">Streaming</p>
            <p className="text-[1.15cqw] text-white/65">Earnings accrue over time.</p>
            <div className="mt-auto">
              <svg viewBox="0 0 200 90" className="h-[7cqw] w-full" aria-hidden="true">
                <defs>
                  <linearGradient id="pitch-stream" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#7c8cff" />
                    <stop offset="1" stopColor="#2ee6d6" />
                  </linearGradient>
                </defs>
                <path d="M0 88 L200 10 L200 90 L0 90 Z" fill="url(#pitch-stream)" opacity="0.15" />
                <path d="M0 88 L200 10" stroke="rgba(255,255,255,.15)" strokeWidth="2" fill="none" />
                <path d={`M0 88 L${200 * stream} ${88 - 78 * stream}`} stroke="url(#pitch-stream)" strokeWidth="4" fill="none" strokeLinecap="round" />
                <circle cx={200 * stream} cy={88 - 78 * stream} r="5" fill="#2ee6d6" />
              </svg>
              <p className="text-[1.05cqw] text-white/60">Accrued {Math.round(stream * 100)}%</p>
            </div>
          </Appear>
          <Appear at={1800} t={t} className={`${CARD} flex flex-col`}>
            <Clock className="size-[2.2cqw] text-[#7c8cff]" aria-hidden="true" />
            <p className="mt-[0.8cqw] text-[1.7cqw] font-bold">Hourly</p>
            <p className="text-[1.15cqw] text-white/65">Payment follows approved working time.</p>
            <div className="mt-auto space-y-[0.45cqw] text-[1.05cqw]">
              {[
                ["Mon", 0.5, "2.5 h"],
                ["Tue", 0.7, "3.5 h"],
                ["Wed", 0.4, "2.0 h"],
              ].map(([d, w, h], i) => (
                <p key={d as string} className="flex items-center gap-[0.6cqw]">
                  <span className="w-[2.6cqw] text-white/60">{d}</span>
                  <span className="flex-1"><Bar value={(w as number) * ramp(t, 2500 + i * 1500, 1200)} tone="#7c8cff" /></span>
                  <span className="w-[3.4cqw] text-right">{h}</span>
                </p>
              ))}
              <Chip tone="green"><BadgeCheck className="size-[1cqw]" aria-hidden="true" /> Approved sessions</Chip>
            </div>
          </Appear>
        </div>
      );
    }
    case "product":
      return (
        <div className="grid h-full grid-cols-[3fr_1fr] gap-[1.4cqw]">
          <ClipSlot slot="product">
            <div className="grid h-full grid-cols-2 grid-rows-2 gap-[1cqw]">
              <WindowFrame title="Marketplace">
                <div className="space-y-[0.5cqw]">
                  <p className="flex items-center gap-[0.5cqw] rounded-full bg-white/5 px-[0.8cqw] py-[0.35cqw] text-[0.95cqw] text-white/50">
                    <Search className="size-[1cqw]" aria-hidden="true" /> Search jobs, gigs, freelancers
                  </p>
                  {[["Anchor escrow program", "$2,400"], ["Next.js marketing site", "$900"]].map(([a, b]) => (
                    <p key={a} className="flex justify-between rounded-[0.6cqw] bg-white/5 px-[0.8cqw] py-[0.4cqw] text-[1cqw]">
                      <span className="truncate">{a}</span>
                      <span className="font-semibold text-[#7ff3ea]">{b}</span>
                    </p>
                  ))}
                </div>
              </WindowFrame>
              <WindowFrame title="Proposals">
                <div className="space-y-[0.5cqw] text-[1cqw]">
                  {[["Ava Chen", true], ["Sam Rivera", false], ["Kai Morgan", false]].map(([n, sel]) => (
                    <p key={n as string} className={`flex items-center justify-between rounded-[0.6cqw] px-[0.8cqw] py-[0.4cqw] ${sel ? "bg-[#2ee6d6]/12 ring-1 ring-[#2ee6d6]/50" : "bg-white/5"}`}>
                      <span>{n}</span>
                      <span className={sel ? "font-semibold text-[#7ff3ea]" : "text-white/50"}>{sel ? "Selected" : "View"}</span>
                    </p>
                  ))}
                </div>
              </WindowFrame>
              <WindowFrame title="Create & Send Offer">
                <div className="space-y-[0.5cqw]">
                  <Line w={70} />
                  <Line w={55} />
                  <Line w={62} />
                  <span className="mt-[0.6cqw] inline-block rounded-full px-[1cqw] py-[0.4cqw] text-[0.95cqw] font-bold text-[#04101f]" style={{ background: ACCENT }}>
                    Send protected offer
                  </span>
                </div>
              </WindowFrame>
              <WindowFrame title="Messages">
                <div className="flex h-full flex-col gap-[0.5cqw] text-[0.95cqw]">
                  <span className="max-w-[70%] self-start rounded-[0.8cqw] bg-white/10 px-[0.8cqw] py-[0.4cqw]">Milestone 1 is ready for review.</span>
                  <span className="max-w-[70%] self-end rounded-[0.8cqw] bg-[#7c8cff]/40 px-[0.8cqw] py-[0.4cqw]">Looks good, approving now.</span>
                  <span className="mt-auto inline-flex items-center gap-[0.4cqw] self-start text-white/60">
                    <Bell className="size-[1cqw]" aria-hidden="true" /> Payment released
                  </span>
                </div>
              </WindowFrame>
            </div>
          </ClipSlot>
          <div className="flex flex-col gap-[0.6cqw]">
            {[
              [Store, "Jobs & gigs marketplace"],
              [Users, "Freelancer discovery"],
              [Briefcase, "Proposals"],
              [ShieldCheck, "Protected contracts"],
              [CheckCircle2, "Submission & review"],
              [MessageSquare, "Messaging & notifications"],
              [Coins, "Payment settlement"],
              [Wallet, "Account & wallet support"],
            ].map(([Icon, label], i) => {
              const I = Icon as typeof Store;
              return (
                <Appear key={label as string} at={i * 450} t={t} className="flex items-center gap-[0.6cqw] rounded-[0.8cqw] bg-white/[0.06] px-[0.9cqw] py-[0.55cqw]">
                  <I className="size-[1.3cqw] shrink-0 text-[#2ee6d6]" aria-hidden="true" />
                  <span className="text-[1.05cqw] font-semibold">{label as string}</span>
                </Appear>
              );
            })}
          </div>
        </div>
      );
    case "protection": {
      const points = [
        "Contract funding follows the agreed terms",
        "Each party submits a statement",
        "Evidence files and message snapshots",
        "Submitted evidence kept as immutable case records",
        "Neutral AI case-summary assistance",
        "A human resolver makes the final settlement decision",
      ];
      return (
        <div className="grid h-full grid-cols-[1.1fr_1fr] gap-[1.8cqw]">
          <div className="flex flex-col justify-center gap-[0.7cqw]">
            {points.map((p, i) => (
              <Appear key={p} at={i * 900} t={t} className="flex items-center gap-[0.8cqw] rounded-[0.9cqw] bg-white/[0.06] px-[1.1cqw] py-[0.7cqw]">
                <span className="flex size-[2cqw] shrink-0 items-center justify-center rounded-full bg-[#2ee6d6]/15 text-[1cqw] font-bold text-[#7ff3ea]">
                  {i + 1}
                </span>
                <span className="text-[1.25cqw] font-semibold">{p}</span>
              </Appear>
            ))}
          </div>
          <div className={`${CARD} flex flex-col items-center justify-center text-center`}>
            <div className="flex items-center gap-[1.2cqw]">
              <span className="flex flex-col items-center gap-[0.4cqw]">
                <span className="flex size-[5cqw] items-center justify-center rounded-[1.2cqw] bg-[#7c8cff]/20">
                  <Sparkles className="size-[2.6cqw] text-[#c3caff]" aria-hidden="true" />
                </span>
                <span className="text-[1.05cqw] text-white/70">AI summary</span>
              </span>
              <ArrowRight className="size-[2cqw] text-white/40" aria-hidden="true" />
              <span className="flex flex-col items-center gap-[0.4cqw]">
                <span className="flex size-[5cqw] items-center justify-center rounded-[1.2cqw] bg-[#2ee6d6]/20">
                  <Gavel className="size-[2.6cqw] text-[#7ff3ea]" aria-hidden="true" />
                </span>
                <span className="text-[1.05cqw] text-white/70">Human resolver</span>
              </span>
            </div>
            <p className="mt-[2cqw] text-[2.6cqw] font-extrabold leading-tight tracking-[-0.02em]">
              AI assists.
              <br />
              <span className="text-[#7ff3ea]">A human resolver decides.</span>
            </p>
          </div>
        </div>
      );
    }
    case "solana":
      return (
        <div className="grid h-full grid-cols-2 gap-[1.8cqw]">
          <div className="grid grid-cols-2 gap-[1cqw]">
            {[
              [Zap, "Fast settlement"],
              [Coins, "Low transaction costs"],
              [Waves, "Fits frequent Streaming and Hourly payments"],
              [BadgeCheck, "Verifiable funding and settlement actions"],
            ].map(([Icon, label], i) => {
              const I = Icon as typeof Zap;
              return (
                <Appear key={label as string} at={i * 700} t={t} className={`${CARD} flex flex-col justify-center`}>
                  <I className="size-[2.4cqw] text-[#2ee6d6]" aria-hidden="true" />
                  <p className="mt-[0.8cqw] text-[1.45cqw] font-bold leading-snug">{label as string}</p>
                </Appear>
              );
            })}
          </div>
          <div className={`${CARD} flex flex-col`}>
            <p className="text-[1.9cqw] font-bold">Blockchain where it adds value.</p>
            <div className="mt-[1.2cqw] grid flex-1 grid-cols-2 gap-[1cqw]">
              <div className="rounded-[1cqw] border border-[#7c8cff]/40 bg-[#7c8cff]/10 p-[1cqw]">
                <p className="text-[1.1cqw] font-semibold uppercase tracking-[0.12em] text-[#c3caff]">Familiar web</p>
                <ul className="mt-[0.6cqw] space-y-[0.4cqw] text-[1.2cqw]">
                  {["Profiles", "Jobs & gigs", "Messages", "Support"].map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
              <div className="rounded-[1cqw] border border-[#2ee6d6]/40 bg-[#2ee6d6]/10 p-[1cqw]">
                <p className="text-[1.1cqw] font-semibold uppercase tracking-[0.12em] text-[#7ff3ea]">On Solana</p>
                <ul className="mt-[0.6cqw] space-y-[0.4cqw] text-[1.2cqw]">
                  {["Contract funding", "Payment release", "Dispute settlement"].map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      );
    case "business":
      return (
        <div className="flex h-full flex-col gap-[1.2cqw]">
          <div className="grid flex-1 grid-cols-3 gap-[1.4cqw]">
            {SUBSCRIPTION_PLANS.map((plan, i) => (
              <Appear key={plan.tier} at={i * 800} t={t} className={`${CARD} flex flex-col ${i === 2 ? "border-[#2ee6d6]/60" : ""}`}>
                <p className="text-[1.15cqw] font-semibold uppercase tracking-[0.16em] text-white/60">{plan.name}</p>
                <p className="mt-[0.4cqw] text-[2.8cqw] font-extrabold tracking-[-0.02em]">
                  {plan.monthlyUsd === 0 ? "$0" : planPriceLabel(plan, "Monthly")}
                </p>
                <p className="mt-auto text-[3.4cqw] font-extrabold leading-none text-[#7ff3ea]">{`${plan.feeBps / 100}%`}</p>
                <p className="mt-[0.3cqw] text-[1.1cqw] text-white/65">
                  {plan.monthlyUsd === 0 ? "Current launch PREMIFLOW platform fee" : "PREMIFLOW platform fee"}
                </p>
                {plan.annualUsd > 0 ? (
                  <p className="mt-[0.4cqw] text-[1cqw] text-white/50">or {planPriceLabel(plan, "Annual")}</p>
                ) : null}
              </Appear>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-[1cqw] text-[1.1cqw] text-white/75">
            <p>Employer and freelancer each pay their own fee.</p>
            <p>No separate employer or freelancer subscription.</p>
            <p>One subscription applies to both hiring and working when using the subscribed wallet.</p>
          </div>
          <p className="text-[0.95cqw] text-white/45">
            Current Devnet model. Each wallet&apos;s plan controls that participant&apos;s fee. Annual: pay for 10 months,
            get 12. Devnet prices are paid in Demo USDT, a Devnet test asset.
          </p>
        </div>
      );
    case "current": {
      const items = [
        "Marketplace",
        "Jobs and proposals",
        "Gigs",
        "Freelancer profiles",
        "Fixed contracts",
        "Milestone contracts",
        "Streaming contracts",
        "Hourly contracts",
        "Paid trials where supported",
        "Protected payment workflow",
        "Notifications",
        "Help Desk",
        "Resolution Desk",
        "Dispute statements and evidence",
        "Neutral AI case summary",
        "Free / Pro / Premium fee model",
        "Safe Cancel & Revise offers",
      ];
      return (
        <div className="flex h-full flex-col gap-[1.2cqw]">
          <div className="grid flex-1 grid-cols-3 content-start gap-[0.7cqw]">
            {items.map((x, i) => (
              <Appear key={x} at={i * 260} t={t} className="flex items-center gap-[0.6cqw] rounded-[0.8cqw] bg-white/[0.06] px-[0.9cqw] py-[0.55cqw]">
                <CheckCircle2 className="size-[1.3cqw] shrink-0 text-[#5be37a]" aria-hidden="true" />
                <span className="text-[1.15cqw] font-semibold">{x}</span>
              </Appear>
            ))}
          </div>
          <div className="flex items-center gap-[1cqw]">
            <Chip tone="cyan">
              <span className="pf-preview-dot size-[0.6cqw] rounded-full bg-[#2ee6d6]" aria-hidden="true" /> Running on Solana Devnet
            </Chip>
            <Chip tone="muted">
              <LifeBuoy className="size-[1cqw]" aria-hidden="true" /> Sample data in this presentation
            </Chip>
          </div>
        </div>
      );
    }
    case "closing":
    default:
      return (
        <div className="grid h-full grid-cols-1 items-center">
          <div className={`flex h-full items-center ${PITCH_CLIP_SLOTS.closing ? "justify-between gap-[3cqw]" : "justify-center"}`}>
            <div className={`flex flex-col ${PITCH_CLIP_SLOTS.closing ? "items-start text-left" : "items-center text-center"}`}>
              <p className="text-[4.4cqw] font-extrabold leading-none tracking-[-0.03em]">Work differently.</p>
              <p className="mt-[1.4cqw] max-w-[60cqw] text-[1.6cqw] leading-snug text-white/75">
                PREMIFLOW brings marketplace discovery, flexible work agreements and protected Solana payments into one
                workflow.
              </p>
              <div className="mt-[2cqw] flex gap-[1cqw]">
                <span className="rounded-full px-[2cqw] py-[0.9cqw] text-[1.4cqw] font-bold text-[#04101f]" style={{ background: ACCENT }}>
                  Find Work
                </span>
                <span className="rounded-full border border-white/30 px-[2cqw] py-[0.9cqw] text-[1.4cqw] font-bold">Hire Talent</span>
              </div>
              <div className="mt-[3cqw] flex flex-col items-center gap-[0.8cqw]">
                <DemoMark h={3.6} />
                <p className="text-[1.5cqw] font-semibold text-white/80">Freelance work. Protected on Solana.</p>
              </div>
            </div>
            {PITCH_CLIP_SLOTS.closing ? (
              <div className="h-[70%] w-[40%]">
                <ClipSlot slot="closing">{null}</ClipSlot>
              </div>
            ) : null}
          </div>
        </div>
      );
  }
}
