"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Presentation, Video } from "lucide-react";

import { PRODUCT_DEMO_SCENES, formatDemoTime, productDemoSceneStartMs } from "@/lib/app/landing-explainer";
import { PITCH_ROUTE } from "@/lib/app/pitch-deck";
import { ControlButton, describeVoice } from "./DemoKit";
import { ProductDemoPlayer, useProductDemo } from "./ProductDemoPlayer";

/**
 * /demo: the PREMIFLOW product-operation demo (about 1:30) in the shared
 * inline player, plus recording tools. Presentation only: synthetic data, no
 * wallet, RPC, API or transaction calls.
 */

const SCENES = PRODUCT_DEMO_SCENES;

/** Demo tooling (pitch link) shows in development builds or with ?tools=1. */
function useDemoToolsFlag(): boolean {
  const [flag, setFlag] = useState(process.env.NODE_ENV !== "production");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tools") === "1") setFlag(true);
  }, []);
  return flag;
}

export function ProductDemo() {
  const demo = useProductDemo({ initialVoiceOn: true });
  const { seq } = demo;
  const tools = useDemoToolsFlag();

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Product demo</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
        Watch PREMIFLOW in action
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
        A {formatDemoTime(seq.totalMs)} walkthrough of real product operations: proposal, hire, funded offer, delivery,
        payment and dispute protection. Sample data; Demo USDT is a Devnet test asset.
      </p>

      <ProductDemoPlayer demo={demo} className="mt-6" />

      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2" role="toolbar" aria-label="Recording tools">
        <ControlButton onClick={seq.startRecordMode} icon={<Video size={16} aria-hidden="true" />} label="Colosseum Record Mode" />
        <span className="text-xs text-ink-faint">
          {seq.voiceOn ? describeVoice(seq.voiceSource, seq.voiceName) : "Voice off \u2014 captions only"}
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
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-[16px] border border-line bg-card p-4 text-sm leading-6 text-ink-soft">
        <p className="font-semibold text-ink">Recording tips</p>
        <p className="mt-1">
          Record Mode goes full screen when the browser allows it, hides all controls, counts down 3, 2, 1, plays once
          and returns to normal viewing shortly after the end card. Press Esc to exit early. Record at 1920x1080.
        </p>
        <p className="mt-2">
          The browser voice is a preview only. For the final cut, add a natural voiceover at{" "}
          <code className="font-mono text-xs">public/media/premiflow-voiceover.mp3</code> and set{" "}
          <code className="font-mono text-xs">MARKETPLACE_DEMO_VOICEOVER</code>; scenes then follow the recording&apos;s
          timing. Export the capture as <code className="font-mono text-xs">public/media/premiflow-demo.mp4</code> and
          set <code className="font-mono text-xs">MARKETPLACE_EXPLAINER_VIDEO</code> to play it inline on the landing page.
        </p>
      </div>

      {tools ? (
        <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[16px] border border-dashed border-line bg-paper-2 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Pitch Presentation</p>
            <p className="text-xs text-ink-soft">
              A separate 10-slide narrated presentation, not the product demo. Unlisted.
            </p>
          </div>
          <Link
            href={PITCH_ROUTE}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Presentation size={16} aria-hidden="true" /> Open Pitch Presentation
          </Link>
        </div>
      ) : null}

      <p className="mt-6 text-sm">
        <Link href="/" className="font-semibold text-accent underline-offset-2 hover:underline">
          Back to the marketplace
        </Link>
      </p>
    </div>
  );
}
