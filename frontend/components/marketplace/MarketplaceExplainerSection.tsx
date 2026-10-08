"use client";

import { useCallback, useId, useRef, useState } from "react";
import { CheckCircle2, Play, X } from "lucide-react";

import { LANDING_EXPLAINER } from "@/lib/app/landing-explainer";
import {
  MARKETPLACE_EXPLAINER_VIDEO,
  resolveExplainerVideo,
} from "@/lib/app/marketplace-media";
import { useDialogFocus } from "@/lib/hooks/useDialogFocus";
import { Reveal } from "@/components/site/Reveal";

/**
 * Landing explainer: thumbnail with play control + modal. Plays a configured
 * self-hosted/https video when set; otherwise shows a clean placeholder with
 * factual PREMIFLOW product points (no stock footage, no invented claims).
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
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={LANDING_EXPLAINER.playLabel}
            className="pf-card group relative flex aspect-video w-full min-w-0 items-center justify-center overflow-hidden rounded-[24px] border border-line text-left shadow-[var(--shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <ExplainerThumbnail />
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
        </Reveal>
      </div>
      {open ? <ExplainerDialog video={video} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function ExplainerThumbnail() {
  return (
    <svg viewBox="0 0 640 360" className="pf-zoom absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ex-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#040a14" />
          <stop offset="0.45" stopColor="#0d2a4a" />
          <stop offset="1" stopColor="#12c2b8" />
        </linearGradient>
        <radialGradient id="ex-glow" cx="0.7" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#2ee6d6" stopOpacity="0.4" />
          <stop offset="1" stopColor="#2ee6d6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="640" height="360" fill="url(#ex-bg)" />
      <rect width="640" height="360" fill="url(#ex-glow)" />
      {/* Escrow vault */}
      <rect x="240" y="110" width="160" height="120" rx="18" fill="none" stroke="#9ff6ee" strokeWidth="3" opacity="0.9" />
      <path d="M280 110v-18a40 40 0 0180 0v18" fill="none" stroke="#9ff6ee" strokeWidth="3" opacity="0.7" />
      <circle cx="320" cy="170" r="16" fill="#2ee6d6" opacity="0.85" />
      {/* Wallet nodes */}
      <rect x="80" y="150" width="70" height="48" rx="10" fill="none" stroke="#bcd2ff" strokeWidth="2.5" opacity="0.8" />
      <rect x="490" y="150" width="70" height="48" rx="10" fill="none" stroke="#bcd2ff" strokeWidth="2.5" opacity="0.8" />
      <path d="M150 174h90M400 174h90" fill="none" stroke="#2ee6d6" strokeWidth="2" strokeDasharray="6 6" opacity="0.65" />
      <text x="320" y="280" textAnchor="middle" fill="#ffffff" opacity="0.7" fontSize="18" fontFamily="system-ui,sans-serif">
        Escrow · Fixed · Milestone · Streaming · Hourly
      </text>
    </svg>
  );
}

function ExplainerDialog({
  video,
  onClose,
}: {
  video: { src: string; poster?: string; type?: string } | null;
  onClose: () => void;
}) {
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
        {video ? (
          <div className="aspect-video w-full bg-black">
            <video
              className="h-full w-full"
              controls
              playsInline
              poster={video.poster}
              preload="metadata"
            >
              <source src={video.src} type={video.type ?? "video/mp4"} />
            </video>
          </div>
        ) : (
          <div className="px-4 pb-5 sm:px-5 sm:pb-6">
            <div className="overflow-hidden rounded-[16px] border border-white/10">
              <ExplainerThumbnail />
            </div>
            <p className="mt-4 text-sm text-white/70">{LANDING_EXPLAINER.placeholderNote}</p>
            <ul className="mt-3 space-y-3">
              {LANDING_EXPLAINER.points.map((p) => (
                <li key={p.title} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <p className="text-sm font-semibold text-white">{p.title}</p>
                  <p className="mt-0.5 text-sm leading-6 text-white/65">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
