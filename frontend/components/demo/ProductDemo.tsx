"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  Clock,
  FileText,
  Gavel,
  Layers,
  Lock,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Video,
  Volume2,
  VolumeX,
  Wallet,
  Waves,
} from "lucide-react";

import {
  PRODUCT_DEMO_END_CARD,
  PRODUCT_DEMO_SCENES,
  PRODUCT_DEMO_SPEECH_OVERRUN_CAP_MS,
  formatDemoTime,
  productDemoSceneStartMs,
} from "@/lib/app/landing-explainer";
import { MARKETPLACE_DEMO_VOICEOVER } from "@/lib/app/marketplace-media";
import { SUBSCRIPTION_PLANS } from "@/lib/app/subscription-plans";
import { useNarratedSequence } from "@/lib/hooks/useNarratedSequence";
import {
  CaptionBand,
  ControlButton,
  CountdownOverlay,
  DemoMark,
  ProgressLine,
  RecordOverlay,
  describeVoice,
} from "./DemoKit";

/**
 * Narrated PREMIFLOW product demo (~1:55). A deterministic scene timeline
 * drives a 16:9 composition sized in container units (crisp at 1920x1080).
 * Narration: a prerecorded voiceover when configured, else browser speech
 * synthesis, else silent with captions. Presentation only: synthetic data,
 * no wallet, API, database or Solana calls. Engine: useNarratedSequence.
 */

const SCENES = PRODUCT_DEMO_SCENES;

export function ProductDemo() {
  const seq = useNarratedSequence({
    items: SCENES,
    voiceoverSrc: MARKETPLACE_DEMO_VOICEOVER,
    overrunCapMs: PRODUCT_DEMO_SPEECH_OVERRUN_CAP_MS,
  });
  const [captionsOn, setCaptionsOn] = useState(true);
  const { status, index, elapsed, position, totalMs, voiceOn, recordMode, countdownLabel } = seq;

  const scene = SCENES[index];
  const stage = (
    <DemoStage
      index={index}
      t={elapsed}
      captionsOn={captionsOn}
      paused={status === "paused"}
      countdownLabel={countdownLabel}
      progress={recordMode ? null : position / totalMs}
    />
  );

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {seq.voiceover ? (
        <audio ref={seq.audioRef} src={seq.voiceover} preload="auto" onError={seq.onAudioError} hidden />
      ) : null}
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Product demo</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
        See PREMIFLOW in under two minutes
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
        A narrated walkthrough of the marketplace and protected payment flow. Everything shown uses sample data on
        Solana Devnet.
      </p>

      <div className="mt-6 overflow-hidden rounded-[20px] border border-line shadow-[var(--shadow)]">
        {recordMode ? <div className="aspect-video w-full bg-[#050b16]" aria-hidden="true" /> : stage}
      </div>

      {recordMode ? <RecordOverlay>{stage}</RecordOverlay> : null}

      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2" role="toolbar" aria-label="Demo controls">
        {status === "playing" ? (
          <ControlButton onClick={seq.pause} icon={<Pause size={16} aria-hidden="true" />} label="Pause" primary />
        ) : (
          <ControlButton
            onClick={seq.play}
            icon={<Play size={16} aria-hidden="true" />}
            label={status === "paused" ? "Resume" : "Play"}
            primary
          />
        )}
        <ControlButton onClick={seq.restart} icon={<RotateCcw size={16} aria-hidden="true" />} label="Restart" />
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
        <ControlButton
          onClick={seq.startRecordMode}
          icon={<Video size={16} aria-hidden="true" />}
          label="Colosseum Record Mode"
        />
        <span className="ml-auto text-xs tabular-nums text-ink-faint">
          {formatDemoTime(position)} / ~{formatDemoTime(totalMs)}
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-faint" aria-live="polite">
        {voiceOn ? describeVoice(seq.voiceSource, seq.voiceName) : "Voice off \u2014 captions only"}
        {" \u00b7 "}Scene {index + 1} of {SCENES.length}: {scene.label}
      </p>

      <ol className="mt-4 flex min-w-0 flex-wrap gap-1.5" aria-label="Scenes">
        {SCENES.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => seq.jumpTo(i)}
              aria-current={i === index ? "step" : undefined}
              className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                i === index ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:bg-paper-2"
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
          Colosseum Record Mode goes full screen when the browser allows it, hides these controls, counts down 3, 2, 1,
          then plays once from scene 1 and ends on the PREMIFLOW end card. Press Esc to exit. Record at 1920x1080; the
          composition keeps title-safe margins and captions stay clear of the product UI.
        </p>
        <p className="mt-2">
          Export the recording as <code className="font-mono text-xs">public/media/premiflow-demo.mp4</code> and set{" "}
          <code className="font-mono text-xs">MARKETPLACE_EXPLAINER_VIDEO=/media/premiflow-demo.mp4</code> to use it in
          the landing explainer, where it never autoplays with sound.
        </p>
        <p className="mt-3">
          <Link href="/" className="font-semibold text-accent underline-offset-2 hover:underline">
            Back to the marketplace
          </Link>
        </p>
      </div>
    </div>
  );
}

/* =============================== Composition =============================== */

function DemoStage({
  index,
  t,
  captionsOn,
  paused,
  countdownLabel,
  progress,
}: {
  index: number;
  t: number;
  captionsOn: boolean;
  paused: boolean;
  countdownLabel: string | null;
  progress: number | null;
}) {
  const scene = SCENES[index];
  const brandScene = scene.id === "intro" || scene.id === "final";
  return (
    <div
      className={`pf-demo relative aspect-video w-full overflow-hidden bg-[#050b16] text-white ${paused ? "pf-demo-paused" : ""}`}
      role="region"
      aria-label="PREMIFLOW product demo"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(70%_60%_at_85%_0%,rgba(46,230,214,.18),transparent_60%),radial-gradient(60%_60%_at_0%_100%,rgba(124,140,255,.2),transparent_60%),linear-gradient(160deg,#050b16,#0b1d33)]"
      />
      {!brandScene ? (
        <div className="absolute left-[5cqw] right-[5cqw] top-[3cqw] flex items-center justify-between">
          <DemoMark h={2.2} />
          <span className="rounded-full border border-white/15 bg-white/5 px-[1cqw] py-[0.4cqw] text-[0.95cqw] font-semibold text-white/70">
            Solana Devnet demo {"\u00b7"} sample data
          </span>
        </div>
      ) : null}

      <div
        key={scene.id}
        className={`pf-demo-in absolute left-[5cqw] right-[5cqw] flex flex-col ${
          brandScene ? "top-[4cqw] bottom-[12cqw] items-center justify-center text-center" : "top-[7.5cqw] bottom-[12cqw]"
        }`}
      >
        {scene.heading ? (
          <div className="mb-[1.6cqw]">
            <p className="text-[1cqw] font-semibold uppercase tracking-[0.2em] text-[#2ee6d6]">
              {String(index).padStart(2, "0")} {"\u00b7"} {scene.label}
            </p>
            <h2 className="mt-[0.4cqw] text-[2.6cqw] font-bold leading-tight tracking-[-0.02em]">{scene.heading}</h2>
          </div>
        ) : null}
        <div className="relative min-h-0 flex-1">
          <SceneBody id={scene.id} t={t} />
        </div>
      </div>

      {captionsOn && scene.caption ? <CaptionBand id={scene.id} text={scene.caption} /> : null}
      {progress !== null ? <ProgressLine value={progress} /> : null}
      {countdownLabel ? <CountdownOverlay label={countdownLabel} /> : null}
    </div>
  );
}

/* ----------------------------- scene building blocks ----------------------------- */

const CARD = "rounded-[1.1cqw] border border-white/10 bg-white/[0.06] p-[1.3cqw]";
const ICON = "size-[1.7cqw] shrink-0";

function Reveal({ show, children, className = "" }: { show: boolean; children: ReactNode; className?: string }) {
  if (!show) return <div className={`${className} invisible`} aria-hidden="true">{children}</div>;
  return <div className={`pf-demo-in ${className}`}>{children}</div>;
}

function Row({ title, meta, active = false }: { title: string; meta: string; active?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-[1cqw] rounded-[0.8cqw] border px-[1cqw] py-[0.8cqw] transition ${
        active ? "border-[#2ee6d6]/70 bg-[#2ee6d6]/10" : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <span className="min-w-0 truncate text-[1.25cqw] font-semibold">{title}</span>
      <span className="shrink-0 text-[1.1cqw] text-white/65">{meta}</span>
    </div>
  );
}

function Person({ name, initials, tone }: { name: string; initials: string; tone: string }) {
  return (
    <span className="inline-flex items-center gap-[0.6cqw]">
      <span
        className="flex size-[2.2cqw] items-center justify-center rounded-full text-[0.9cqw] font-bold text-[#04101f]"
        style={{ background: tone }}
      >
        {initials}
      </span>
      <span className="text-[1.15cqw] font-semibold">{name}</span>
    </span>
  );
}

function Bar({ value, tone = "linear-gradient(90deg,#2ee6d6,#7c8cff)" }: { value: number; tone?: string }) {
  return (
    <span className="block h-[0.7cqw] w-full overflow-hidden rounded-full bg-white/10">
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: tone }} />
    </span>
  );
}

function Pill({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "green" | "muted" }) {
  const cls =
    tone === "green"
      ? "bg-[#28c840]/15 text-[#5be37a]"
      : tone === "muted"
        ? "bg-white/10 text-white/70"
        : "bg-[#2ee6d6]/15 text-[#7ff3ea]";
  return (
    <span className={`inline-flex items-center gap-[0.4cqw] rounded-full px-[0.9cqw] py-[0.35cqw] text-[1cqw] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

const ramp = (t: number, start: number, length: number) => Math.min(1, Math.max(0, (t - start) / length));

function SceneBody({ id, t }: { id: (typeof SCENES)[number]["id"]; t: number }) {
  switch (id) {
    case "intro":
      return (
        <div className="flex h-full flex-col items-center justify-center">
          <DemoMark h={6.5} />
          <p className="mt-[2cqw] text-[2.6cqw] font-semibold tracking-[-0.02em] text-white/90">
            Freelance work. Protected on Solana.
          </p>
          <Reveal show={t > 1800} className="mt-[2.2cqw] flex gap-[1cqw]">
            <Pill>Marketplace</Pill>
            <Pill>Protected contracts</Pill>
            <Pill>Flexible payments</Pill>
          </Reveal>
        </div>
      );
    case "marketplace":
      return (
        <div className="grid h-full grid-cols-2 gap-[2cqw]">
          <div className={CARD}>
            <p className="mb-[1cqw] flex items-center gap-[0.6cqw] text-[1.4cqw] font-bold">
              <Briefcase className={`${ICON} text-[#2ee6d6]`} aria-hidden="true" /> Find work
            </p>
            <div className="space-y-[0.7cqw]">
              <Reveal show={t > 600}><Row title="Build an Anchor escrow program" meta={"Milestone \u00b7 $2,400"} active={t > 7000} /></Reveal>
              <Reveal show={t > 1300}><Row title="Next.js marketing site" meta={"Fixed \u00b7 $900"} /></Reveal>
              <Reveal show={t > 2000}><Row title="Weekly on-chain analytics" meta="$45/hr" /></Reveal>
            </div>
          </div>
          <div className={CARD}>
            <p className="mb-[1cqw] flex items-center gap-[0.6cqw] text-[1.4cqw] font-bold">
              <Users className={`${ICON} text-[#7c8cff]`} aria-hidden="true" /> Hire talent
            </p>
            <div className="space-y-[0.7cqw]">
              {[
                ["Ava Chen", "AC", "#2ee6d6", "Solana developer \u00b7 $60/hr"],
                ["Leo Park", "LP", "#7c8cff", "Product designer \u00b7 $45/hr"],
                ["Nia Okafor", "NO", "#f6b44b", "Data analyst \u00b7 $50/hr"],
              ].map(([name, initials, tone, meta], i) => (
                <Reveal key={name} show={t > 3200 + i * 700}>
                  <div className="flex items-center justify-between gap-[1cqw] rounded-[0.8cqw] border border-white/10 bg-white/[0.04] px-[1cqw] py-[0.6cqw]">
                    <Person name={name} initials={initials} tone={tone} />
                    <span className="text-[1.05cqw] text-white/65">{meta}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      );
    case "proposal": {
      const sent = t > 8500;
      return (
        <div className="grid h-full grid-cols-[2fr_3fr] gap-[2cqw]">
          <div className={CARD}>
            <p className="text-[1.05cqw] font-semibold uppercase tracking-[0.15em] text-white/50">Proposals</p>
            <p className="mb-[1cqw] mt-[0.3cqw] text-[1.3cqw] font-bold">Build an Anchor escrow program</p>
            <div className="space-y-[0.7cqw]">
              <Row title="Ava Chen" meta={"$2,400 \u00b7 3 weeks"} active={t > 2200} />
              <Row title="Sam Rivera" meta={"$2,900 \u00b7 4 weeks"} />
              <Row title="Kai Morgan" meta={"$2,100 \u00b7 5 weeks"} />
            </div>
            <Reveal show={t > 2200} className="mt-[1cqw]">
              <Pill tone="green">
                <CheckCircle2 className="size-[1.1cqw]" aria-hidden="true" /> Selected
              </Pill>
            </Reveal>
          </div>
          <Reveal show={t > 3400} className={CARD}>
            <p className="flex items-center gap-[0.6cqw] text-[1.4cqw] font-bold">
              <FileText className={`${ICON} text-[#2ee6d6]`} aria-hidden="true" /> Protected offer to Ava Chen
            </p>
            <div className="mt-[1cqw] space-y-[0.6cqw]">
              <Row title="Payment model" meta="Milestone" />
              <Row title="Total" meta="$2,400" />
              <Row title="Schedule" meta={"3 milestones \u00b7 3 weeks"} />
              <Row title="Review window" meta="3 days per milestone" />
            </div>
            <div className="mt-[1.2cqw] flex items-center gap-[1cqw]">
              <span
                className={`inline-flex items-center gap-[0.5cqw] rounded-full px-[1.4cqw] py-[0.7cqw] text-[1.2cqw] font-bold transition ${
                  sent ? "bg-[#28c840]/20 text-[#5be37a]" : "bg-[linear-gradient(135deg,#2ee6d6,#7c8cff)] text-[#04101f]"
                }`}
              >
                {sent ? <BadgeCheck className="size-[1.4cqw]" aria-hidden="true" /> : null}
                {sent ? "Offer sent" : "Create & Send Offer"}
              </span>
              {sent ? <span className="pf-demo-in text-[1.05cqw] text-white/60">Ava reviews and accepts the terms</span> : null}
            </div>
          </Reveal>
        </div>
      );
    }
    case "escrow": {
      const fill = ramp(t, 1500, 5000);
      const funded = fill >= 1;
      return (
        <div className="flex h-full flex-col justify-center gap-[2.2cqw]">
          <div className="grid grid-cols-[1fr_auto_1.2fr_auto_1fr] items-center gap-[1.2cqw]">
            <div className={`${CARD} text-center`}>
              <Wallet className="mx-auto size-[2.4cqw] text-[#7c8cff]" aria-hidden="true" />
              <p className="mt-[0.6cqw] text-[1.3cqw] font-bold">Aster Labs</p>
              <p className="text-[1.05cqw] text-white/60">Employer {"\u00b7"} $2,400</p>
            </div>
            <div className="w-[8cqw]">
              <Bar value={fill} />
              <ArrowRight className="mx-auto mt-[0.4cqw] size-[1.6cqw] text-[#2ee6d6]" aria-hidden="true" />
            </div>
            <div className={`${CARD} text-center ${funded ? "border-[#2ee6d6]/70" : ""}`}>
              <span className={`mx-auto flex size-[4cqw] items-center justify-center rounded-[1cqw] bg-[#2ee6d6]/15 ${funded ? "pf-escrow-breathe" : ""}`}>
                <Lock className="size-[2.2cqw] text-[#2ee6d6]" aria-hidden="true" />
              </span>
              <p className="mt-[0.6cqw] text-[1.3cqw] font-bold">Protected contract</p>
              <p className="text-[1.05cqw] text-white/60">{funded ? "$2,400 funded" : "Funding\u2026"}</p>
            </div>
            <div className="w-[8cqw] opacity-40">
              <Bar value={0} />
              <ArrowRight className="mx-auto mt-[0.4cqw] size-[1.6cqw]" aria-hidden="true" />
            </div>
            <div className={`${CARD} text-center`}>
              <Person name="Ava Chen" initials="AC" tone="#2ee6d6" />
              <p className="mt-[0.6cqw] text-[1.05cqw] text-white/60">Paid on approval</p>
            </div>
          </div>
          <div className="flex justify-center gap-[1cqw]">
            <Reveal show={t > 300}><Pill tone="green"><CheckCircle2 className="size-[1.1cqw]" aria-hidden="true" /> Offer accepted</Pill></Reveal>
            <Reveal show={funded}><Pill tone="green"><CheckCircle2 className="size-[1.1cqw]" aria-hidden="true" /> Escrow funded</Pill></Reveal>
            <Reveal show={t > 8500}><Pill><ShieldCheck className="size-[1.1cqw]" aria-hidden="true" /> Work can begin</Pill></Reveal>
          </div>
          <p className="text-center text-[1.1cqw] text-white/55">Held in program escrow on Solana until release.</p>
        </div>
      );
    }
    case "models": {
      const step = 4200;
      const active = Math.min(4, Math.floor(t / step));
      const cards = [
        { icon: FileText, name: "Fixed", body: "One deliverable, paid on approval" },
        { icon: Layers, name: "Milestones", body: "Larger projects split into stages" },
        { icon: Waves, name: "Streaming", body: "Payment accrues over time" },
        { icon: Clock, name: "Hourly", body: "Approved sessions, paid by the hour" },
      ];
      return (
        <div className="flex h-full flex-col gap-[1.4cqw]">
          <div className="grid flex-1 grid-cols-4 gap-[1.2cqw]">
            {cards.map((c, i) => {
              const on = active === i || active >= 4;
              const local = ramp(t, i * step, step);
              const Icon = c.icon;
              return (
                <div
                  key={c.name}
                  className={`${CARD} flex flex-col transition duration-500 ${on ? "border-[#2ee6d6]/70 bg-white/[0.1]" : "opacity-55"}`}
                >
                  <Icon className={`size-[2.2cqw] ${on ? "text-[#2ee6d6]" : "text-white/60"}`} aria-hidden="true" />
                  <p className="mt-[0.8cqw] text-[1.6cqw] font-bold">{c.name}</p>
                  <p className="mt-[0.3cqw] text-[1.1cqw] leading-snug text-white/65">{c.body}</p>
                  <div className="mt-auto pt-[1cqw]">
                    {i === 0 ? (
                      <div className="flex items-center gap-[0.6cqw]">
                        <Bar value={active > 0 || local > 0.6 ? 1 : 0.15} />
                        <CheckCircle2 className="size-[1.3cqw] text-[#5be37a]" aria-hidden="true" />
                      </div>
                    ) : i === 1 ? (
                      <div className="grid grid-cols-3 gap-[0.4cqw]">
                        {[0, 1, 2].map((k) => (
                          <Bar key={k} value={active > 1 ? 1 : active === 1 ? ramp(local, k / 3, 1 / 3) : 0} />
                        ))}
                      </div>
                    ) : i === 2 ? (
                      <Bar value={active > 2 ? 1 : active === 2 ? local : 0} tone="linear-gradient(90deg,#7c8cff,#2ee6d6)" />
                    ) : (
                      <div className="space-y-[0.4cqw] text-[1cqw] text-white/70">
                        <p className="flex justify-between"><span>Mon</span><span>2.5 h {"\u2713"}</span></p>
                        <p className="flex justify-between"><span>Tue</span><span>{active >= 3 && local > 0.4 ? "3.0 h \u2713" : "\u2014"}</span></p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-center text-[1.15cqw] text-white/60">
            Fixed &amp; Milestones for scoped deliverables {"\u00b7"} Streaming &amp; Hourly for ongoing work
          </p>
        </div>
      );
    }
    case "work": {
      const approved = t > 5200;
      return (
        <div className="grid h-full grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-[1.2cqw]">
          <Reveal show className={CARD}>
            <Pill tone="muted">Milestone 1 of 3</Pill>
            <p className="mt-[0.8cqw] text-[1.4cqw] font-bold">Work submitted</p>
            <div className="mt-[0.8cqw]"><Person name="Ava Chen" initials="AC" tone="#2ee6d6" /></div>
            <p className="mt-[0.8cqw] inline-flex items-center gap-[0.4cqw] rounded-[0.6cqw] bg-white/10 px-[0.8cqw] py-[0.4cqw] font-mono text-[1cqw]">
              <FileText className="size-[1.1cqw]" aria-hidden="true" /> escrow-program-v1.zip
            </p>
          </Reveal>
          <ArrowRight className="size-[1.8cqw] text-white/40" aria-hidden="true" />
          <Reveal show={t > 2200} className={CARD}>
            <p className="text-[1.4cqw] font-bold">Employer review</p>
            <p className="mt-[0.4cqw] text-[1.05cqw] text-white/60">Aster Labs checks the deliverable</p>
            <div className="mt-[1cqw] flex gap-[0.6cqw]">
              <span className="rounded-full border border-white/20 px-[1cqw] py-[0.45cqw] text-[1cqw] text-white/70">Request changes</span>
              <span className={`rounded-full px-[1cqw] py-[0.45cqw] text-[1cqw] font-bold ${approved ? "bg-[#28c840]/20 text-[#5be37a]" : "bg-[linear-gradient(135deg,#2ee6d6,#7c8cff)] text-[#04101f]"}`}>
                {approved ? "Approved \u2713" : "Approve"}
              </span>
            </div>
          </Reveal>
          <ArrowRight className="size-[1.8cqw] text-white/40" aria-hidden="true" />
          <Reveal show={t > 6800} className={`${CARD} border-[#2ee6d6]/60`}>
            <p className="text-[1.4cqw] font-bold">Available to withdraw</p>
            <p className="mt-[0.4cqw] text-[3cqw] font-extrabold tracking-[-0.02em] text-[#7ff3ea]">$800</p>
            <span className="mt-[0.6cqw] inline-flex items-center gap-[0.4cqw] rounded-full bg-white/10 px-[1cqw] py-[0.45cqw] text-[1cqw] font-semibold">
              <Wallet className="size-[1.1cqw]" aria-hidden="true" /> Withdraw
            </span>
          </Reveal>
        </div>
      );
    }
    case "disputes":
      return (
        <div className="grid h-full grid-cols-3 gap-[1.6cqw]">
          <div className="flex flex-col gap-[1cqw]">
            {[
              ["Employer statement", "brief.pdf", "review-notes.txt", 0],
              ["Freelancer statement", "commit-log.txt", "demo-recording", 1500],
            ].map(([title, a, b, at]) => (
              <Reveal key={title as string} show={t > (at as number)} className={CARD}>
                <p className="text-[1.25cqw] font-bold">{title}</p>
                <div className="mt-[0.4cqw] space-y-[0.35cqw]">
                  <Bar value={0.9} tone="rgba(255,255,255,.25)" />
                  <Bar value={0.6} tone="rgba(255,255,255,.25)" />
                </div>
                <div className="mt-[0.7cqw] flex gap-[0.5cqw]">
                  <Pill tone="muted">{a}</Pill>
                  <Pill tone="muted">{b}</Pill>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal show={t > 4000} className={`${CARD} flex flex-col`}>
            <p className="flex items-center gap-[0.6cqw] text-[1.35cqw] font-bold">
              <Sparkles className={`${ICON} text-[#7c8cff]`} aria-hidden="true" /> AI case summary
            </p>
            <p className="mt-[0.3cqw] text-[1.05cqw] text-white/60">Neutral summary of both sides</p>
            <div className="mt-[1cqw] space-y-[0.5cqw]">
              {[0.95, 0.8, 0.9, 0.55].map((w, i) => (
                <Bar key={i} value={w * ramp(t, 4300 + i * 400, 900)} tone="rgba(124,140,255,.55)" />
              ))}
            </div>
            <p className="mt-auto pt-[1cqw] text-[1.05cqw] font-semibold text-[#b9c1ff]">AI summarizes. It does not decide.</p>
          </Reveal>
          <Reveal show={t > 7800} className={`${CARD} flex flex-col border-[#2ee6d6]/60`}>
            <p className="flex items-center gap-[0.6cqw] text-[1.35cqw] font-bold">
              <Gavel className={`${ICON} text-[#2ee6d6]`} aria-hidden="true" /> Human resolver
            </p>
            <p className="mt-[0.3cqw] text-[1.05cqw] text-white/60">Reviews statements, evidence and the summary</p>
            <div className="mt-auto pt-[1cqw]">
              {t > 10000 ? (
                <span className="pf-demo-in inline-flex">
                  <Pill tone="green"><CheckCircle2 className="size-[1.1cqw]" aria-hidden="true" /> Final decision recorded</Pill>
                </span>
              ) : (
                <Pill tone="muted">Reviewing{"\u2026"}</Pill>
              )}
            </div>
          </Reveal>
        </div>
      );
    case "fees":
      return (
        <div className="flex h-full flex-col gap-[1.4cqw]">
          <div className="grid flex-1 grid-cols-3 gap-[1.6cqw]">
            {SUBSCRIPTION_PLANS.map((plan, i) => (
              <Reveal key={plan.tier} show={t > 500 + i * 1800} className={`${CARD} flex flex-col ${i === 2 ? "border-[#2ee6d6]/60" : ""}`}>
                <p className="text-[1.4cqw] font-bold">{plan.name}</p>
                <p className="mt-[0.2cqw] text-[1.05cqw] text-white/60">{plan.audience}</p>
                <p className="mt-auto text-[4.2cqw] font-extrabold leading-none tracking-[-0.03em] text-[#7ff3ea]">
                  {`${plan.feeBps / 100}%`}
                </p>
                <p className="mt-[0.4cqw] text-[1.05cqw] text-white/65">PREMIFLOW platform fee</p>
              </Reveal>
            ))}
          </div>
          <p className="text-center text-[1.15cqw] text-white/60">
            For new contracts {"\u00b7"} each participant&apos;s own plan applies to their side
          </p>
        </div>
      );
    case "close":
      return (
        <div className="grid h-full grid-cols-3 items-center gap-[1.6cqw]">
          {[
            { icon: Store, title: "Marketplace discovery", body: "Jobs, gigs and freelancer profiles" },
            { icon: ShieldCheck, title: "Protected agreements", body: "Clear terms and funded contracts" },
            { icon: Wallet, title: "Flexible payments", body: "Fixed, Milestones, Streaming, Hourly" },
          ].map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} show={t > i * 900} className={`${CARD} text-center`}>
              <Icon className="mx-auto size-[3cqw] text-[#2ee6d6]" aria-hidden="true" />
              <p className="mt-[1cqw] text-[1.6cqw] font-bold">{title}</p>
              <p className="mt-[0.3cqw] text-[1.1cqw] text-white/60">{body}</p>
            </Reveal>
          ))}
        </div>
      );
    case "final":
    default:
      return (
        <div className="flex h-full flex-col items-center justify-center">
          <DemoMark h={7} />
          <p className="mt-[2.2cqw] text-[2.8cqw] font-semibold tracking-[-0.02em]">{PRODUCT_DEMO_END_CARD[1]}</p>
          <div className="mt-[2.4cqw] flex gap-[1cqw]">
            <span className="rounded-full bg-[linear-gradient(135deg,#2ee6d6,#7c8cff)] px-[2cqw] py-[0.9cqw] text-[1.4cqw] font-bold text-[#04101f]">
              Find work
            </span>
            <span className="rounded-full border border-white/30 px-[2cqw] py-[0.9cqw] text-[1.4cqw] font-bold">Hire talent</span>
          </div>
          <p className="mt-[1.6cqw] text-[1.1cqw] text-white/55">Now on Solana Devnet</p>
        </div>
      );
  }
}
