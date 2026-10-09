"use client";

import { useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { LANDING_EXPLAINER } from "@/lib/app/landing-explainer";
import {
  MARKETPLACE_EXPLAINER_VIDEO,
  resolveExplainerVideo,
  type ExplainerVideoConfig,
} from "@/lib/app/marketplace-media";
import { PlayOverlay, ProductDemoPlayer, useProductDemo } from "@/components/demo/ProductDemoPlayer";
import { Reveal } from "@/components/site/Reveal";

/**
 * Landing explainer: the 16:9 area IS the player. Nothing plays until the
 * visitor clicks the centred Play button, and playback stays in place.
 * - MARKETPLACE_EXPLAINER_VIDEO set: the real MP4 plays inline (HTML5 video).
 * - Not set: the live narrated product demo plays inline (voice off by
 *   default, with a visible voice/volume control). Never autoplays with sound.
 */
export function MarketplaceExplainerSection() {
  const video = resolveExplainerVideo(MARKETPLACE_EXPLAINER_VIDEO);

  return (
    <section className="bg-paper py-16 sm:py-24" aria-labelledby="pf-explainer">
      <div className="mx-auto grid w-full min-w-0 max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:px-8">
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
        <Reveal delay={100}>{video ? <InlineVideoPlayer video={video} /> : <InlineLiveDemo />}</Reveal>
      </div>
    </section>
  );
}

/* ------------------------- Live product demo (no MP4) ------------------------- */

function InlineLiveDemo() {
  // Voice starts off on the landing page; the control bar has a visible voice toggle and volume.
  const demo = useProductDemo({ initialVoiceOn: false });
  return <ProductDemoPlayer demo={demo} />;
}

/* ------------------------------ Real MP4 inline ------------------------------ */

function previewSrc(src: string): string {
  return src.includes("#") ? src : `${src}#t=0.1`;
}

function InlineVideoPlayer({ video }: { video: ExplainerVideoConfig }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const start = () => {
    setStarted(true);
    const el = ref.current;
    if (!el) return;
    // Started by an explicit click, so sound is allowed; fall back to muted if the browser refuses.
    el.muted = false;
    el.play().catch(() => {
      el.muted = true;
      el.play().catch(() => undefined);
    });
  };

  return (
    <div className="pf-demo relative aspect-video w-full min-w-0 overflow-hidden rounded-[20px] border border-line bg-black shadow-[var(--shadow)]">
      <video
        ref={ref}
        className="h-full w-full"
        controls={started}
        playsInline
        preload="metadata"
        poster={video.poster}
        aria-label={LANDING_EXPLAINER.modalTitle}
      >
        <source src={previewSrc(video.src)} type={video.type ?? "video/mp4"} />
        Your browser cannot play this video.
      </video>
      {!started ? <PlayOverlay onPlay={start} label="Product demo" ariaLabel={LANDING_EXPLAINER.playLabel} /> : null}
    </div>
  );
}
