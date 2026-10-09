"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { BadgeCheck, Briefcase, CheckCircle2, FileText, Lock, Play, Store, Wallet, X } from "lucide-react";

import { LANDING_EXPLAINER } from "@/lib/app/landing-explainer";
import {
  MARKETPLACE_EXPLAINER_VIDEO,
  resolveExplainerVideo,
  type ExplainerVideoConfig,
} from "@/lib/app/marketplace-media";
import { useDialogFocus } from "@/lib/hooks/useDialogFocus";
import { Reveal } from "@/components/site/Reveal";

/**
 * Landing explainer.
 * - No video configured: an interactive, CSS-animated product preview of the
 *   PREMIFLOW flow (no play control, honours prefers-reduced-motion).
 * - Video configured (MARKETPLACE_EXPLAINER_VIDEO): a real preview with a Play
 *   button that opens the accessible modal player (muted, never autoplays with sound).
 */
export function MarketplaceExplainerSection() {
  const [open, setOpen] = useState(false);
  const video = resolveExplainerVideo(MARKETPLACE_EXPLAINER_VIDEO);

  return (
    <section className="bg-paper py-16 sm:py-24" aria-labelledby="pf-explainer">
      <div className="mx-auto grid w-full min-w-0 max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{LANDING_EXPLAINER.eyebrow}</p>
          <h2
            id="pf-explainer"
            className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.1rem]"
          >
            {LANDING_EXPLAINER.heading}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft sm:text-base">{LANDING_EXPLAINER.body}</p>
          <ul className="mt-5 space-y-2.5 text-sm text-ink-soft">
            {LANDING_EXPLAINER.points.slice(0, 3).map((p) => (
              <li key={p.title} className="flex items-start gap-2">
                <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                <span>
                  <span className="font-semibold text-ink">{p.title}.</span> {p.body}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={100}>
          {video ? <VideoPreviewButton video={video} onOpen={() => setOpen(true)} /> : <InteractivePreview />}
        </Reveal>
      </div>
      {open && video ? <ExplainerDialog video={video} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

/* ------------------------------ State B: video ------------------------------ */

function previewSrc(src: string): string {
  return src.includes("#") ? src : `${src}#t=0.1`;
}

function VideoPreviewButton({ video, onOpen }: { video: ExplainerVideoConfig; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={LANDING_EXPLAINER.playLabel}
      className="pf-card group relative flex aspect-video w-full min-w-0 items-center justify-center overflow-hidden rounded-[24px] border border-line bg-navy text-left shadow-[var(--shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      <ExplainerThumbnail />
      {video.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.poster} alt="" className="pf-zoom absolute inset-0 h-full w-full object-cover" />
      ) : (
        <video
          aria-hidden="true"
          tabIndex={-1}
          muted
          playsInline
          preload="metadata"
          className="pf-zoom pointer-events-none absolute inset-0 h-full w-full object-cover"
        >
          <source src={previewSrc(video.src)} type={video.type ?? "video/mp4"} />
        </video>
      )}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,10,20,.15),rgba(4,10,20,.55))] transition group-hover:bg-[linear-gradient(180deg,rgba(4,10,20,.05),rgba(4,10,20,.45))]"
      />
      <span className="pf-play relative z-[1] flex size-16 items-center justify-center rounded-full border border-white/50 bg-white/20 text-white backdrop-blur-md sm:size-[4.5rem]">
        <Play size={28} aria-hidden="true" className="ml-1 fill-white" />
      </span>
      <span className="absolute bottom-3 left-3 z-[1] inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm sm:text-xs">
        <Play size={11} aria-hidden="true" className="fill-white" />
        {LANDING_EXPLAINER.playLabel}
      </span>
    </button>
  );
}

function ExplainerThumbnail() {
  return (
    <svg viewBox="0 0 640 360" className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ex-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#040a14" />
          <stop offset="0.45" stopColor="#0d2a4a" />
          <stop offset="1" stopColor="#12c2b8" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#ex-bg)" />
    </svg>
  );
}

function ExplainerDialog({ video, onClose }: { video: ExplainerVideoConfig; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useCallback(() => onClose(), [onClose]);
  useDialogFocus(true, ref, close);

  return (
    <div className="fixed inset-0 z-[10001] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        tabIndex={-1}
        data-focus-skip
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[90dvh] w-full max-w-3xl overflow-auto overscroll-contain rounded-t-[22px] border border-white/10 bg-[#070d18] pb-[env(safe-area-inset-bottom)] text-white shadow-2xl sm:rounded-[22px] sm:pb-0"
      >
        <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <h2 id={titleId} className="min-w-0 truncate text-sm font-semibold sm:text-base">
            {LANDING_EXPLAINER.modalTitle}
          </h2>
          <button
            type="button"
            onClick={close}
            data-autofocus
            aria-label="Close"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="aspect-video w-full bg-black">
          {/* Opened by an explicit Play click; starts muted, controls always visible. */}
          <video className="h-full w-full" controls autoPlay muted playsInline poster={video.poster} preload="metadata">
            <source src={video.src} type={video.type ?? "video/mp4"} />
            Your browser cannot play this video.
          </video>
        </div>
      </div>
    </div>
  );
}

/* ------------------------ State A: interactive preview ------------------------ */

const STEP_MS = 2800;
const STEP_ICONS = [Store, FileText, Lock, Briefcase, BadgeCheck, Wallet] as const;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true
  );
}

function InteractivePreview() {
  const steps = LANDING_EXPLAINER.steps;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const running = !paused && !reduced;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % steps.length), STEP_MS);
    return () => window.clearInterval(timer);
  }, [running, steps.length]);

  const step = steps[active];
  return (
    <div
      role="group"
      aria-label={LANDING_EXPLAINER.previewLabel}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      className="pf-card relative w-full min-w-0 overflow-hidden rounded-[24px] border border-line bg-navy text-white shadow-[var(--shadow)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_85%_0%,rgba(46,230,214,.22),transparent_60%),radial-gradient(90%_70%_at_0%_100%,rgba(124,140,255,.2),transparent_60%)]"
      />
      <div className="relative flex min-w-0 items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold">
          <span aria-hidden="true" className="pf-preview-dot size-1.5 rounded-full bg-[#2ee6d6]" />
          {LANDING_EXPLAINER.previewLabel}
        </span>
        <span className="shrink-0 text-[11px] text-white/55">{`Step ${active + 1} of ${steps.length}`}</span>
      </div>
      <div className="relative mx-4 mt-3 min-h-[232px] overflow-hidden rounded-[16px] border border-white/10 bg-[#0a1424] p-4 sm:mx-5">
        <div key={active} className="pf-step-in min-w-0">
          <p className="text-sm font-semibold text-white">{step.title}</p>
          <p className="mt-0.5 text-xs text-white/60">{step.caption}</p>
          <StepScreen index={active} />
        </div>
      </div>
      <ol className="relative grid grid-cols-3 gap-1.5 px-4 pt-3 sm:grid-cols-6 sm:px-5">
        {steps.map((s, i) => {
          const Icon = STEP_ICONS[i];
          const on = i === active;
          const done = i < active;
          return (
            <li key={s.short} className="min-w-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-current={on ? "step" : undefined}
                className={`flex min-h-11 w-full min-w-0 flex-col items-start gap-1 rounded-xl border px-2 py-2 text-left text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2ee6d6] ${
                  on ? "border-[#2ee6d6]/60 bg-white/10 text-white" : "border-white/10 text-white/55 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={14} aria-hidden="true" className={on || done ? "text-[#2ee6d6]" : ""} />
                <span className="w-full truncate">{s.short}</span>
                <span aria-hidden="true" className="relative h-0.5 w-full overflow-hidden rounded bg-white/10">
                  {on ? (
                    <span
                      key={`${active}-${running ? "run" : "hold"}`}
                      className={`absolute inset-y-0 left-0 bg-[#2ee6d6] ${running ? "pf-step-progress" : "w-full"}`}
                      style={running ? { animationDuration: `${STEP_MS}ms` } : undefined}
                    />
                  ) : done ? (
                    <span className="absolute inset-0 bg-[#2ee6d6]/60" />
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="relative px-4 pb-4 pt-3 text-[11px] text-white/55 sm:px-5">{LANDING_EXPLAINER.previewNote}</p>
    </div>
  );
}

const ROW = "flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs";

function StepScreen({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ["Anchor program review", "from-[#2ee6d6] to-[#7c8cff]"],
            ["Next.js dashboard", "from-[#47b5ff] to-[#2ee6d6]"],
            ["Onboarding UI", "from-[#8b7cff] to-[#ff7ad9]"],
          ].map(([title, grad], i) => (
            <div
              key={title}
              className={`min-w-0 rounded-lg border p-2 ${i === 0 ? "border-[#2ee6d6]/60 bg-white/10" : "border-white/10 bg-white/5"}`}
            >
              <div className={`h-12 rounded-md bg-gradient-to-br ${grad} opacity-80`} />
              <p className="mt-1.5 truncate text-[11px] font-semibold">{title}</p>
              <p className="text-[10px] text-white/55">{i === 0 ? "Selected" : "Gig"}</p>
            </div>
          ))}
        </div>
      );
    case 1:
      return (
        <div className="mt-3 space-y-1.5">
          {[
            ["Payment model", "Milestone"],
            ["Milestones", "3"],
            ["Dispute resolver", "Human resolver"],
          ].map(([k, v]) => (
            <div key={k} className={ROW}>
              <span className="text-white/60">{k}</span>
              <span className="font-semibold">{v}</span>
            </div>
          ))}
          <div className="mt-2 inline-flex rounded-full bg-[linear-gradient(135deg,#2ee6d6,#7c8cff)] px-3 py-1.5 text-[11px] font-semibold text-[#04101f]">
            Create protected contract
          </div>
        </div>
      );
    case 2:
      return (
        <div className="mt-4 flex min-w-0 items-center gap-4">
          <span className="pf-escrow-breathe flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[#2ee6d6]/50 bg-[#2ee6d6]/15">
            <Lock size={24} aria-hidden="true" className="text-[#2ee6d6]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/60">Held in program escrow</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="pf-step-progress h-full rounded-full bg-[linear-gradient(90deg,#2ee6d6,#7c8cff)]" style={{ animationDuration: "1200ms" }} />
            </div>
            <p className="mt-2 text-[11px] text-white/55">Not held in a PREMIFLOW-controlled wallet</p>
          </div>
        </div>
      );
    case 3:
      return (
        <div className="mt-3 space-y-1.5">
          {["Wireframes", "Build and tests", "Handoff notes"].map((t, i) => (
            <div key={t} className={`${ROW} pf-step-in`} style={{ animationDelay: `${i * 160}ms` }}>
              <span className="flex min-w-0 items-center gap-2">
                <CheckCircle2 size={14} aria-hidden="true" className="shrink-0 text-[#2ee6d6]" />
                <span className="truncate">{t}</span>
              </span>
              <span className="text-white/50">Submitted</span>
            </div>
          ))}
        </div>
      );
    case 4:
      return (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-semibold">Milestone 1 submitted</p>
          <p className="mt-0.5 text-[11px] text-white/55">Review the deliverables before funds move.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white/75">Request changes</span>
            <span className="rounded-full bg-[linear-gradient(135deg,#2ee6d6,#7c8cff)] px-3 py-1.5 text-[11px] font-semibold text-[#04101f]">
              Approve
            </span>
          </div>
        </div>
      );
    default:
      return (
        <div className="mt-3">
          <svg viewBox="0 0 300 70" className="h-16 w-full" aria-hidden="true" focusable="false">
            <rect x="4" y="18" width="70" height="34" rx="9" fill="none" stroke="#2ee6d6" strokeWidth="2" />
            <text x="39" y="40" textAnchor="middle" fontSize="11" fill="#ffffff" fontFamily="system-ui,sans-serif">Escrow</text>
            <path className="pf-flow" d="M80 35 H216" stroke="#2ee6d6" strokeWidth="2" strokeDasharray="6 6" fill="none" />
            <path d="M212 29 l8 6 l-8 6" stroke="#2ee6d6" strokeWidth="2" fill="none" />
            <rect x="226" y="18" width="70" height="34" rx="9" fill="none" stroke="#7c8cff" strokeWidth="2" />
            <text x="261" y="40" textAnchor="middle" fontSize="11" fill="#ffffff" fontFamily="system-ui,sans-serif">Freelancer</text>
          </svg>
          <div className="mt-2 space-y-1.5">
            <div className={ROW}>
              <span className="text-white/60">Status</span>
              <span className="font-semibold text-[#2ee6d6]">Payment released</span>
            </div>
            <div className={ROW}>
              <span className="text-white/60">PREMIFLOW platform fee</span>
              <span className="font-semibold">Shown before signing</span>
            </div>
          </div>
        </div>
      );
  }
}
