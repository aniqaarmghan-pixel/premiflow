"use client";

import Link from "next/link";
import { Presentation, Video } from "lucide-react";

import {
  PRODUCT_DEMO_SCENES,
  formatDemoTime,
  productDemoSceneStartMs,
  productDemoWordCount,
} from "@/lib/app/landing-explainer";
import { MARKETPLACE_DEMO_VOICEOVER } from "@/lib/app/marketplace-media";
import { PITCH_STUDIO_ROUTE } from "@/lib/app/demo-studio";
import { PITCH_ROUTE } from "@/lib/app/pitch-deck";
import { ControlButton, describeVoice } from "./DemoKit";
import { ProductDemoPlayer, useProductDemo } from "./ProductDemoPlayer";

/**
 * Internal /demo/studio: recording and production controls for the product
 * demo (Record Demo with 3-2-1 countdown, scene list and timing, voice preview
 * status, voiceover configuration, export notes). Unlinked, noindex, gated.
 */

const SCENES = PRODUCT_DEMO_SCENES;

export function DemoStudio() {
  const demo = useProductDemo({ initialVoiceOn: true });
  const { seq } = demo;

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Internal {"\u00b7"} Demo studio</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
        Product demo studio
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
        Recording tools for the product demo. Not linked anywhere and not indexed. Available in development, or in any
        build with <code className="font-mono text-xs">PREMIFLOW_DEMO_STUDIO=1</code>.
      </p>

      <ProductDemoPlayer demo={demo} className="mt-6" />

      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2" role="toolbar" aria-label="Recording tools">
        <ControlButton onClick={seq.startRecordMode} icon={<Video size={16} aria-hidden="true" />} label="Record Demo" primary />
        <span className="text-xs text-ink-faint" aria-live="polite">
          {seq.voiceOn ? describeVoice(seq.voiceSource, seq.voiceName, "Prerecorded voiceover") : "Voice off \u2014 captions only"}
          {" \u00b7 "}Scene {seq.index + 1} of {SCENES.length}: {SCENES[seq.index].label}
        </span>
      </div>

      <ol className="mt-4 flex min-w-0 flex-wrap gap-1.5" aria-label="Scenes">
        {SCENES.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => seq.jumpTo(i)}
              aria-current={i === seq.index ? "step" : undefined}
              className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                i === seq.index ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-paper-2"
              }`}
            >
              <span className="tabular-nums text-ink-faint">{formatDemoTime(productDemoSceneStartMs(i))}</span> {s.label}
              <span className="text-ink-faint"> {"\u00b7"} {(s.durationMs / 1000).toFixed(1)}s</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="rounded-[16px] border border-line bg-card p-4 text-sm leading-6 text-ink-soft">
          <h2 className="font-semibold text-ink">Voice and timing</h2>
          <p className="mt-1">
            Runtime {formatDemoTime(seq.totalMs)} {"\u00b7"} {productDemoWordCount()} narration words.
          </p>
          <p className="mt-1">
            Voiceover:{" "}
            {MARKETPLACE_DEMO_VOICEOVER ? (
              <>
                configured (<code className="font-mono text-xs">{MARKETPLACE_DEMO_VOICEOVER}</code>); scenes follow its
                timing.
              </>
            ) : (
              <>not configured. The browser voice is a preview only.</>
            )}
          </p>
          <p className="mt-1">
            For the final cut, add a natural voiceover at{" "}
            <code className="font-mono text-xs">public/media/premiflow-voiceover.mp3</code> and set{" "}
            <code className="font-mono text-xs">MARKETPLACE_DEMO_VOICEOVER=/media/premiflow-voiceover.mp3</code>.
          </p>
        </section>
        <section className="rounded-[16px] border border-line bg-card p-4 text-sm leading-6 text-ink-soft">
          <h2 className="font-semibold text-ink">Recording and export</h2>
          <p className="mt-1">
            Record Demo goes full screen when the browser allows it, hides all controls, counts down 3, 2, 1, plays once
            and returns to normal viewing shortly after the end card. Esc exits early. Record at 1920x1080.
          </p>
          <p className="mt-1">
            Export as <code className="font-mono text-xs">public/media/premiflow-demo.mp4</code> and set{" "}
            <code className="font-mono text-xs">MARKETPLACE_EXPLAINER_VIDEO=/media/premiflow-demo.mp4</code> to play it
            inline on the landing page.
          </p>
        </section>
      </div>

      <section className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[16px] border border-dashed border-line bg-paper-2 p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Pitch Presentation</h2>
          <p className="text-xs text-ink-soft">
            A separate 10-slide narrated presentation, not the product demo. Clean view and its own studio.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={PITCH_ROUTE}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Presentation size={16} aria-hidden="true" /> Open Pitch Presentation
          </Link>
          <Link
            href={PITCH_STUDIO_ROUTE}
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Pitch studio
          </Link>
        </div>
      </section>
    </div>
  );
}
