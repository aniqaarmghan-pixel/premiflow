"use client";

import type { ReactNode } from "react";
import {
  Bell,
  Briefcase,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  Layers,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  MessageSquare,
  Paperclip,
  PenLine,
  Plus,
  Scale,
  Search,
  Send,
  Sparkles,
  Wallet,
  Waves,
} from "lucide-react";

import { PRODUCT_DEMO_END_CARD, PRODUCT_DEMO_SCENES, type ProductDemoSceneId } from "@/lib/app/landing-explainer";
import { CaptionBand, CountdownOverlay, DemoMark, ProgressLine } from "./DemoKit";

/**
 * 16:9 product-operation composition for the PREMIFLOW demo. Every product
 * scene is a mock of the real application being operated (cursor, clicks,
 * state changes) with synthetic identities and Demo USDT amounts. No wallet,
 * RPC, API or transaction code is imported or called here.
 */

const SCENES = PRODUCT_DEMO_SCENES;

export function DemoStage({
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
      {/* Persistent frame branding: shown on every scene, never tied to playback state. */}
      <div className="absolute left-[3cqw] right-[3cqw] top-[1.6cqw] flex items-center justify-between">
        <DemoMark h={1.9} />
        <span className="rounded-full border border-white/15 bg-white/5 px-[1cqw] py-[0.35cqw] text-[0.95cqw] font-semibold text-white/75">
          Sample data {"\u00b7"} Demo USDT is a Devnet test asset
        </span>
      </div>

      <div key={scene.id} className="pf-demo-in absolute bottom-[8cqw] left-[3cqw] right-[3cqw] top-[5.4cqw]">
        <SceneBody id={scene.id} t={t} />
      </div>

      {captionsOn && scene.caption ? <CaptionBand id={scene.id} text={scene.caption} /> : null}
      {progress !== null ? <ProgressLine value={progress} /> : null}
      {countdownLabel ? <CountdownOverlay label={countdownLabel} /> : null}
    </div>
  );
}

function SceneBody({ id, t }: { id: ProductDemoSceneId; t: number }) {
  switch (id) {
    case "intro":
      return <IntroScene t={t} />;
    case "marketplace":
      return <MarketplaceScene t={t} />;
    case "hire":
      return <HireScene t={t} />;
    case "offer":
      return <OfferScene t={t} />;
    case "accept":
      return <AcceptScene t={t} />;
    case "models":
      return <ModelsScene t={t} />;
    case "work":
      return <WorkScene t={t} />;
    case "payment":
      return <PaymentScene t={t} />;
    case "changes":
      return <ChangesScene t={t} />;
    case "dispute":
      return <DisputeScene t={t} />;
    default:
      return <CloseScene t={t} />;
  }
}

/* =============================== helpers =============================== */

const ramp = (t: number, start: number, length: number) => Math.min(1, Math.max(0, (t - start) / length));

function typed(text: string, t: number, start: number, cps = 45): string {
  if (t < start) return "";
  return text.slice(0, Math.floor(((t - start) / 1000) * cps));
}

type CursorPlan = ReadonlyArray<readonly [number, string]>;
type CursorState = { id: string; since: number };
const NO_CURSOR: CursorState = { id: "", since: 0 };

/** The cursor glides onto a target at `at` and presses ~550 ms later. */
function cursorAt(t: number, plan: CursorPlan): CursorState {
  let state: CursorState = NO_CURSOR;
  for (const [at, id] of plan) if (t >= at) state = { id, since: t - at };
  return state;
}
const pressed = (c: CursorState, id: string) => c.id === id && c.since >= 550 && c.since < 950;

function Hot({
  cursor,
  id,
  children,
  className = "",
}: {
  cursor: CursorState;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const here = cursor.id === id;
  const down = pressed(cursor, id);
  return (
    <span className={`relative inline-flex ${className}`}>
      <span className={`inline-flex w-full transition-transform duration-150 ${down ? "scale-[0.96] brightness-110" : ""}`}>
        {children}
      </span>
      {here ? (
        <span key={id} aria-hidden="true" className="pf-demo-cursor pointer-events-none absolute left-[62%] top-[58%] z-30">
          {down ? <span className="pf-demo-ripple absolute left-0 top-0 size-[3.2cqw] rounded-full border-[0.25cqw] border-[#2ee6d6]" /> : null}
          <svg viewBox="0 0 24 24" className="size-[2.3cqw] drop-shadow-[0_0.3cqw_0.5cqw_rgba(0,0,0,.45)]" aria-hidden="true">
            <path
              d="M3 2 L3 19.5 L7.6 15.2 L10.8 22 L13.9 20.6 L10.7 13.9 L17 13.9 Z"
              fill="#ffffff"
              stroke="#0b1526"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : null}
    </span>
  );
}

const BTN =
  "inline-flex items-center justify-center gap-[0.5cqw] whitespace-nowrap rounded-[0.7cqw] px-[1.2cqw] py-[0.6cqw] text-[1.1cqw] font-semibold";
const PRIMARY = `${BTN} bg-[linear-gradient(135deg,#2ee6d6,#7c8cff)] text-[#04101f] shadow-[0_0.4cqw_1.2cqw_rgba(46,230,214,.3)]`;
const SECONDARY = `${BTN} border border-[#d5dde8] bg-white text-[#0b1526]`;
const DANGER = `${BTN} border border-[#f3c4c4] bg-white text-[#b42318]`;
const PANEL = "rounded-[0.9cqw] border border-[#e3e9f1] bg-white p-[1.1cqw] shadow-[0_0.2cqw_0.8cqw_rgba(11,21,38,.06)]";
const LABEL = "text-[0.9cqw] font-semibold uppercase tracking-[0.08em] text-[#6b7a90]";
const ICON = "size-[1.2cqw] shrink-0";

type Tone = "teal" | "green" | "amber" | "red" | "slate" | "violet";
const TONES: Record<Tone, string> = {
  teal: "bg-[#e3fbf8] text-[#0b7f86]",
  green: "bg-[#e5f8ea] text-[#17803d]",
  amber: "bg-[#fff4dc] text-[#9a6200]",
  red: "bg-[#fde8e8] text-[#b42318]",
  slate: "bg-[#eef2f7] text-[#4a5a70]",
  violet: "bg-[#eeefff] text-[#4b4fd1]",
};

function Chip({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-[0.35cqw] whitespace-nowrap rounded-full px-[0.8cqw] py-[0.25cqw] text-[0.95cqw] font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

function Avatar({ initials, tone }: { initials: string; tone: string }) {
  return (
    <span
      className="flex size-[2.4cqw] shrink-0 items-center justify-center rounded-full text-[0.95cqw] font-bold text-[#04101f]"
      style={{ background: tone }}
    >
      {initials}
    </span>
  );
}

function Field({ label, value, highlight = false }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <div
      className={`min-w-0 rounded-[0.7cqw] border px-[0.9cqw] py-[0.6cqw] transition-colors duration-300 ${
        highlight ? "border-[#2ee6d6] bg-[#f0fdfb]" : "border-[#e3e9f1] bg-[#f8fafc]"
      }`}
    >
      <p className="text-[0.85cqw] text-[#6b7a90]">{label}</p>
      <p className="truncate text-[1.15cqw] font-semibold text-[#0b1526]">{value}</p>
    </div>
  );
}

function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="pf-demo-in absolute bottom-[1.2cqw] right-[1.2cqw] z-20 flex items-center gap-[0.6cqw] rounded-[0.8cqw] bg-[#0b1d33] px-[1.2cqw] py-[0.7cqw] text-[1.1cqw] font-semibold text-white shadow-[0_0.8cqw_2cqw_rgba(0,0,0,.3)]">
      <CheckCircle2 className="size-[1.3cqw] text-[#2ee6d6]" aria-hidden="true" />
      {children}
    </div>
  );
}

function RoleBanner({ role }: { role: "freelancer" | "employer" }) {
  return (
    <div className="pf-demo-in absolute left-1/2 top-[0.8cqw] z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0b1d33] px-[1.4cqw] py-[0.5cqw] text-[1.1cqw] font-semibold text-white shadow-[0_0.6cqw_1.6cqw_rgba(0,0,0,.3)]">
      Now viewing as the <span className="text-[#2ee6d6]">{role}</span>
    </div>
  );
}

/* =============================== app frame =============================== */

type View = "freelancer" | "employer" | "case";
const VIEW_LABEL: Record<View, { name: string; role: string; initials: string; tone: string }> = {
  freelancer: { name: "Lena Park", role: "Freelancer", initials: "LP", tone: "#2ee6d6" },
  employer: { name: "Northwind Studio", role: "Employer", initials: "NS", tone: "#a5b4ff" },
  case: { name: "Resolution Desk", role: "Case view", initials: "RD", tone: "#ffd27a" },
};

const SIDEBAR = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Find work", icon: Search },
  { label: "My jobs", icon: Briefcase },
  { label: "Proposals", icon: Inbox },
  { label: "Contracts", icon: FileText },
  { label: "Create", icon: Plus },
  { label: "Earnings", icon: Wallet },
  { label: "Messages", icon: MessageSquare },
  { label: "Resolution Desk", icon: Scale },
] as const;

const MARKET_NAV = ["Find Work", "Hire Talent", "Gigs", "Freelancers", "Pricing"] as const;

function AppWindow({
  view,
  nav,
  active,
  path,
  children,
}: {
  view: View;
  nav: "market" | "app";
  active: string;
  path: string;
  children: ReactNode;
}) {
  const who = VIEW_LABEL[view];
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1cqw] border border-white/10 bg-[#f4f7fb] text-[#0b1526] shadow-[0_2cqw_5cqw_rgba(0,0,0,.5)]">
      <div className="flex items-center gap-[0.8cqw] border-b border-[#e3e9f1] bg-white px-[1.2cqw] py-[0.55cqw]">
        <span aria-hidden="true" className="flex gap-[0.4cqw]">
          <span className="size-[0.7cqw] rounded-full bg-[#ff6159]" />
          <span className="size-[0.7cqw] rounded-full bg-[#ffbd2e]" />
          <span className="size-[0.7cqw] rounded-full bg-[#28c840]" />
        </span>
        <span className="flex min-w-0 items-center gap-[0.4cqw] rounded-full bg-[#eef2f7] px-[1cqw] py-[0.2cqw] text-[0.9cqw] text-[#5b6b80]">
          <Lock className="size-[0.9cqw]" aria-hidden="true" />
          <span className="truncate">
            PREMIFLOW {"\u00b7"} {path}
          </span>
        </span>
        <span key={view} className="pf-demo-in ml-auto flex items-center gap-[0.5cqw]">
          <span className="text-right leading-tight">
            <span className="block text-[0.95cqw] font-semibold">{who.name}</span>
            <span className="block text-[0.8cqw] text-[#6b7a90]">{who.role}</span>
          </span>
          <Avatar initials={who.initials} tone={who.tone} />
        </span>
      </div>

      {nav === "market" ? (
        <div className="flex items-center gap-[1.6cqw] bg-[#0b1d33] px-[1.4cqw] py-[0.7cqw]">
          <DemoMark h={1.5} />
          {MARKET_NAV.map((item) => (
            <span
              key={item}
              className={`text-[1cqw] font-semibold ${
                item === active ? "text-white underline decoration-[#2ee6d6] decoration-[0.2cqw] underline-offset-[0.6cqw]" : "text-white/60"
              }`}
            >
              {item}
            </span>
          ))}
          <Bell className="ml-auto size-[1.2cqw] text-white/70" aria-hidden="true" />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {nav === "app" ? (
          <div className="flex w-[15cqw] shrink-0 flex-col gap-[0.25cqw] bg-[#0b1d33] px-[0.8cqw] py-[1cqw]">
            <span className="mb-[0.8cqw] px-[0.4cqw]">
              <DemoMark h={1.4} />
            </span>
            {SIDEBAR.map(({ label, icon: Icon }) => (
              <span
                key={label}
                className={`flex items-center gap-[0.6cqw] rounded-[0.6cqw] px-[0.7cqw] py-[0.45cqw] text-[1cqw] font-semibold ${
                  label === active ? "bg-[rgba(46,230,214,.14)] text-white" : "text-white/55"
                }`}
              >
                <Icon className={`size-[1.1cqw] ${label === active ? "text-[#2ee6d6]" : ""}`} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="relative min-w-0 flex-1 overflow-hidden p-[1.3cqw]">{children}</div>
      </div>
    </div>
  );
}

/* =============================== brand frames =============================== */

function IntroScene({ t }: { t: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <DemoMark h={5} />
      <p className="pf-demo-in mt-[1.6cqw] text-[2.6cqw] font-semibold tracking-[-0.02em] text-white/90">
        {PRODUCT_DEMO_END_CARD[1]}
      </p>
      {t >= 1200 ? (
        <p className="pf-demo-in mt-[1.2cqw] rounded-full border border-white/15 bg-white/5 px-[1.4cqw] py-[0.5cqw] text-[1.2cqw] text-white/70">
          Product demo {"\u00b7"} sample data on Solana Devnet
        </p>
      ) : null}
    </div>
  );
}

function CloseScene({ t }: { t: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <span className="sr-only">{PRODUCT_DEMO_END_CARD[0]}</span>
      <DemoMark h={5.4} />
      <p className="mt-[1.6cqw] text-[2.8cqw] font-semibold tracking-[-0.02em] text-white">{PRODUCT_DEMO_END_CARD[1]}</p>
      {t >= 700 ? (
        <p className="pf-demo-in mt-[1.4cqw] text-[1.6cqw] font-semibold text-[#7ff3ea]">
          Fixed {"\u2022"} Milestone {"\u2022"} Streaming {"\u2022"} Hourly
        </p>
      ) : null}
      {t >= 1400 ? (
        <p className="pf-demo-in mt-[1.4cqw] inline-flex items-center gap-[0.6cqw] rounded-full border border-white/15 bg-white/5 px-[1.4cqw] py-[0.5cqw] text-[1.2cqw] text-white/75">
          <span aria-hidden="true" className="size-[0.7cqw] rounded-full bg-[#2ee6d6]" />
          Running on Solana Devnet
        </p>
      ) : null}
    </div>
  );
}

/* =============================== 2. marketplace =============================== */

const JOBS = [
  { title: "Solana escrow integration for a booking app", budget: "$600", model: "Milestone", posted: "2h ago" },
  { title: "Next.js dashboard for a fintech MVP", budget: "$1,800", model: "Fixed", posted: "5h ago" },
  { title: "Anchor smart-contract test suite", budget: "$45/hr", model: "Hourly", posted: "1d ago" },
  { title: "Brand refresh for a creator app", budget: "$900", model: "Milestone", posted: "1d ago" },
] as const;

function MarketplaceScene({ t }: { t: number }) {
  const c = cursorAt(t, [
    [900, "job"],
    [4400, "send"],
    [6500, "submit"],
    [7700, ""],
  ]);
  const detail = t >= 1600;
  const sheet = t >= 5100;
  const sent = t >= 7200;
  const glow = t >= 2600 && t < 4400;
  return (
    <AppWindow view="freelancer" nav="market" active="Find Work" path="/marketplace/jobs">
      <div className="flex h-full gap-[1.2cqw]">
        <div className="flex w-[40%] min-w-0 flex-col gap-[0.7cqw]">
          <div className="flex items-center gap-[0.6cqw] rounded-[0.7cqw] border border-[#d5dde8] bg-white px-[0.9cqw] py-[0.55cqw] text-[1.05cqw]">
            <Search className={ICON} aria-hidden="true" />
            solana escrow
            <span className="ml-auto">
              <Chip tone="teal">Development</Chip>
            </span>
          </div>
          {JOBS.map((job, i) => (
            <Hot key={job.title} cursor={i === 0 ? c : NO_CURSOR} id="job" className="w-full">
              <div
                className={`w-full rounded-[0.8cqw] border bg-white px-[1cqw] py-[0.75cqw] ${
                  i === 0 && detail ? "border-[#2ee6d6] shadow-[0_0_0_0.2cqw_rgba(46,230,214,.25)]" : "border-[#e3e9f1]"
                }`}
              >
                <p className="truncate text-[1.15cqw] font-semibold">{job.title}</p>
                <p className="mt-[0.2cqw] flex items-center gap-[0.6cqw] text-[0.95cqw] text-[#5b6b80]">
                  <span className="font-semibold text-[#0b1526]">{job.budget}</span>
                  <span>{job.model}</span>
                  <span className="ml-auto">{job.posted}</span>
                </p>
              </div>
            </Hot>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {detail ? (
            <div className={`${PANEL} pf-demo-in flex h-full flex-col`}>
              <div className="flex items-start justify-between gap-[1cqw]">
                <div className="min-w-0">
                  <p className="text-[1.6cqw] font-bold leading-tight">{JOBS[0].title}</p>
                  <p className="mt-[0.3cqw] text-[1cqw] text-[#5b6b80]">
                    Northwind Studio {"\u00b7"} Employer {"\u00b7"} Posted 2h ago
                  </p>
                </div>
                <Chip tone="green">Open</Chip>
              </div>
              <div className="mt-[1cqw] grid grid-cols-3 gap-[0.7cqw]">
                <Field label="Budget" value="$600 Demo USDT" highlight={glow} />
                <Field label="Payment model" value="Milestone" highlight={glow} />
                <Field label="Timeline" value="3 weeks" highlight={glow} />
              </div>
              <p className="mt-[1cqw] text-[1.05cqw] leading-[1.5] text-[#334155]">
                Integrate protected payments into our booking flow: wireframes, an Anchor program on Devnet and a tested
                handoff.
              </p>
              <div className="mt-[0.8cqw] flex flex-wrap gap-[0.4cqw]">
                <Chip>Rust</Chip>
                <Chip>Anchor</Chip>
                <Chip>Next.js</Chip>
                <Chip>TypeScript</Chip>
              </div>
              <div className="mt-auto flex items-center gap-[0.8cqw] pt-[1cqw]">
                <Hot cursor={c} id="send">
                  <span className={PRIMARY}>
                    <Send className={ICON} aria-hidden="true" /> Send Proposal
                  </span>
                </Hot>
                <span className={SECONDARY}>Save job</span>
              </div>
            </div>
          ) : (
            <div className={`${PANEL} flex h-full items-center justify-center text-[1.1cqw] text-[#6b7a90]`}>
              Select a job to see the details
            </div>
          )}

          {sheet ? (
            <div className="pf-demo-in absolute inset-x-[1cqw] bottom-[1cqw] z-10 rounded-[0.9cqw] border border-[#d5dde8] bg-white p-[1.1cqw] shadow-[0_1cqw_3cqw_rgba(11,21,38,.25)]">
              <p className="text-[1.25cqw] font-bold">Send proposal</p>
              <div className="mt-[0.6cqw] grid grid-cols-2 gap-[0.6cqw]">
                <Field label="Your bid" value="$600" />
                <Field label="Delivery" value="3 weeks" />
              </div>
              <p className="mt-[0.6cqw] min-h-[3.2cqw] rounded-[0.7cqw] border border-[#e3e9f1] bg-[#f8fafc] px-[0.9cqw] py-[0.5cqw] text-[1cqw] leading-[1.45] text-[#334155]">
                {typed("Hi! I have shipped Anchor escrow flows before. Plan: wireframes, integration, tested handoff.", t, 5400, 60)}
              </p>
              <div className="mt-[0.7cqw] flex justify-end">
                <Hot cursor={c} id="submit">
                  <span className={PRIMARY}>{sent ? "Proposal sent" : "Submit proposal"}</span>
                </Hot>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {sent ? <Toast>Proposal sent to Northwind Studio</Toast> : null}
    </AppWindow>
  );
}

/* =============================== 3. proposal + hire =============================== */

const PROPOSALS = [
  { name: "Diego Ramos", initials: "DR", tone: "#ffd27a", bid: "$650", eta: "4 weeks" },
  { name: "Amara Osei", initials: "AO", tone: "#ff9ec7", bid: "$580", eta: "4 weeks" },
] as const;

function HireScene({ t }: { t: number }) {
  const c = cursorAt(t, [
    [1700, "lena"],
    [4000, "hire"],
    [6200, "offer"],
    [8200, ""],
  ]);
  const arrived = t >= 700;
  const open = t >= 2400;
  const dialog = t >= 4700;
  const going = t >= 6900;
  return (
    <AppWindow view="employer" nav="app" active="My jobs" path="/marketplace/my-jobs/proposals">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-[0.8cqw]">
          <p className="text-[1.5cqw] font-bold">Proposals</p>
          <span className="truncate text-[1.05cqw] text-[#5b6b80]">{JOBS[0].title}</span>
          <span className="ml-auto">
            <Chip tone="teal">{arrived ? 3 : 2} proposals</Chip>
          </span>
        </div>
        <div className="mt-[1cqw] flex min-h-0 flex-1 gap-[1.1cqw]">
          <div className="flex w-[38%] min-w-0 flex-col gap-[0.6cqw]">
            {arrived ? (
              <Hot cursor={c} id="lena" className="w-full">
                <div
                  className={`pf-demo-in flex w-full items-center gap-[0.8cqw] rounded-[0.8cqw] border bg-white px-[0.9cqw] py-[0.7cqw] ${
                    open ? "border-[#2ee6d6] shadow-[0_0_0_0.2cqw_rgba(46,230,214,.25)]" : "border-[#e3e9f1]"
                  }`}
                >
                  <Avatar initials="LP" tone="#2ee6d6" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1.15cqw] font-semibold">Lena Park</span>
                    <span className="block text-[0.95cqw] text-[#5b6b80]">$600 {"\u00b7"} 3 weeks</span>
                  </span>
                  <Chip tone="violet">New</Chip>
                </div>
              </Hot>
            ) : null}
            {PROPOSALS.map((p) => (
              <div key={p.name} className="flex items-center gap-[0.8cqw] rounded-[0.8cqw] border border-[#e3e9f1] bg-white px-[0.9cqw] py-[0.7cqw]">
                <Avatar initials={p.initials} tone={p.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.15cqw] font-semibold">{p.name}</span>
                  <span className="block text-[0.95cqw] text-[#5b6b80]">
                    {p.bid} {"\u00b7"} {p.eta}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            {open ? (
              <div className={`${PANEL} pf-demo-in flex h-full flex-col`}>
                <div className="flex items-center gap-[0.9cqw]">
                  <Avatar initials="LP" tone="#2ee6d6" />
                  <div className="min-w-0">
                    <p className="text-[1.45cqw] font-bold">Lena Park</p>
                    <p className="text-[1cqw] text-[#5b6b80]">Solana and full-stack developer</p>
                  </div>
                </div>
                <div className="mt-[0.9cqw] grid grid-cols-3 gap-[0.6cqw]">
                  <Field label="Bid" value="$600" />
                  <Field label="Delivery" value="3 weeks" />
                  <Field label="Model" value="Milestone" />
                </div>
                <p className="mt-[0.9cqw] rounded-[0.7cqw] bg-[#f8fafc] px-[0.9cqw] py-[0.6cqw] text-[1.02cqw] leading-[1.5] text-[#334155]">
                  {"\u201c"}I have shipped Anchor escrow flows before. Plan: wireframes, integration, tested handoff.{"\u201d"}
                </p>
                <div className="mt-[0.7cqw] flex flex-wrap gap-[0.4cqw]">
                  <Chip>Anchor</Chip>
                  <Chip>Rust</Chip>
                  <Chip>Next.js</Chip>
                </div>
                <div className="mt-auto flex items-center gap-[0.8cqw] pt-[0.8cqw]">
                  <span className={SECONDARY}>
                    <MessageSquare className={ICON} aria-hidden="true" /> Message
                  </span>
                  <Hot cursor={c} id="hire">
                    <span className={PRIMARY}>Hire Lena</span>
                  </Hot>
                </div>
              </div>
            ) : (
              <div className={`${PANEL} flex h-full items-center justify-center text-[1.1cqw] text-[#6b7a90]`}>
                Open a proposal to compare
              </div>
            )}
          </div>
        </div>
      </div>

      {dialog ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(11,21,38,.35)]">
          <div className="pf-demo-in w-[56%] rounded-[1cqw] bg-white p-[1.5cqw] shadow-[0_1.5cqw_4cqw_rgba(11,21,38,.35)]">
            <p className="text-[1.5cqw] font-bold">Hire Lena Park</p>
            <p className="mt-[0.5cqw] text-[1.05cqw] leading-[1.5] text-[#475569]">
              Create a protected offer. You fund it before work starts, and Lena can accept, request changes or decline.
            </p>
            <div className="mt-[1.2cqw] flex justify-end gap-[0.8cqw]">
              <span className={SECONDARY}>Cancel</span>
              <Hot cursor={c} id="offer">
                <span className={PRIMARY}>
                  {going ? <LoaderCircle className={`${ICON} animate-spin`} aria-hidden="true" /> : <Lock className={ICON} aria-hidden="true" />}
                  {going ? "Opening offer wizard" : "Create protected offer"}
                </span>
              </Hot>
            </div>
          </div>
        </div>
      ) : null}
      {arrived && t < 2400 ? <Toast>New proposal from Lena Park</Toast> : null}
    </AppWindow>
  );
}

/* =============================== 4. create + send offer =============================== */

const WIZARD_STEPS = ["Payment model", "Amount", "Schedule", "Review"] as const;
const MODEL_TILES = [
  { name: "Fixed", note: "One payment on approval", icon: FileText },
  { name: "Milestone", note: "Pay stage by stage", icon: Layers },
  { name: "Streaming", note: "Earnings accrue over time", icon: Waves },
  { name: "Hourly", note: "Approved working time", icon: Clock },
] as const;
const MILESTONES = [
  { name: "Wireframes and program setup", amount: "$100", due: "Week 1" },
  { name: "Escrow integration", amount: "$250", due: "Week 2" },
  { name: "Testing and handoff", amount: "$250", due: "Week 3" },
] as const;

function OfferScene({ t }: { t: number }) {
  const c = cursorAt(t, [
    [300, "milestone"],
    [1300, "next"],
    [3000, "next2"],
    [4600, "next3"],
    [5700, "create"],
    [7600, "approve"],
    [8800, ""],
  ]);
  const step = t < 2000 ? 0 : t < 3700 ? 1 : t < 5300 ? 2 : 3;
  const picked = t >= 1000;
  const wallet = t >= 6500 && t < 8600;
  const approving = t >= 8200;
  const funded = t >= 8600;
  const nextId = step === 0 ? "next" : step === 1 ? "next2" : "next3";
  return (
    <AppWindow view="employer" nav="app" active="Create" path="/create">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-[0.8cqw]">
          <p className="text-[1.5cqw] font-bold">Create offer</p>
          <span className="text-[1.05cqw] text-[#5b6b80]">for Lena Park</span>
        </div>
        <ol className="mt-[0.8cqw] grid grid-cols-4 gap-[0.6cqw]">
          {WIZARD_STEPS.map((label, i) => {
            const done = funded || i < step;
            const current = !funded && i === step;
            return (
              <li
                key={label}
                className={`flex items-center gap-[0.5cqw] rounded-[0.7cqw] border px-[0.8cqw] py-[0.45cqw] text-[1cqw] font-semibold ${
                  current
                    ? "border-[#2ee6d6] bg-[#f0fdfb] text-[#0b1526]"
                    : done
                      ? "border-[#e3e9f1] bg-white text-[#17803d]"
                      : "border-[#e3e9f1] bg-white text-[#94a3b8]"
                }`}
              >
                {done ? <CheckCircle2 className="size-[1.1cqw]" aria-hidden="true" /> : <span className="tabular-nums">{i + 1}</span>}
                {label}
              </li>
            );
          })}
        </ol>

        <div className={`${PANEL} mt-[0.9cqw] flex min-h-0 flex-1 flex-col`}>
          {funded ? (
            <div className="pf-demo-in flex h-full flex-col items-center justify-center text-center">
              <span className="flex size-[4.4cqw] items-center justify-center rounded-full bg-[#e5f8ea]">
                <CheckCircle2 className="size-[2.6cqw] text-[#17803d]" aria-hidden="true" />
              </span>
              <p className="mt-[0.9cqw] text-[1.9cqw] font-bold">Offer funded</p>
              <p className="mt-[0.3cqw] text-[1.1cqw] text-[#475569]">$600 Demo USDT is held for this offer before work starts.</p>
              <div className="mt-[0.9cqw] flex gap-[0.5cqw]">
                <Chip tone="green">Funded</Chip>
                <Chip tone="amber">Sent to Lena Park</Chip>
              </div>
            </div>
          ) : (
            <>
              <div key={step} className="pf-demo-in min-h-0 flex-1">
                {step === 0 ? (
                  <div className="grid grid-cols-4 gap-[0.7cqw]">
                    {MODEL_TILES.map(({ name, note, icon: Icon }) => {
                      const sel = picked && name === "Milestone";
                      const tile = (
                        <div
                          className={`w-full rounded-[0.8cqw] border p-[0.9cqw] ${
                            sel ? "border-[#2ee6d6] bg-[#f0fdfb] shadow-[0_0_0_0.2cqw_rgba(46,230,214,.25)]" : "border-[#e3e9f1] bg-white"
                          }`}
                        >
                          <Icon className={`size-[1.8cqw] ${sel ? "text-[#0b7f86]" : "text-[#64748b]"}`} aria-hidden="true" />
                          <p className="mt-[0.5cqw] text-[1.2cqw] font-bold">{name}</p>
                          <p className="text-[0.95cqw] text-[#5b6b80]">{note}</p>
                        </div>
                      );
                      return name === "Milestone" ? (
                        <Hot key={name} cursor={c} id="milestone" className="w-full">
                          {tile}
                        </Hot>
                      ) : (
                        <div key={name}>{tile}</div>
                      );
                    })}
                  </div>
                ) : step === 1 ? (
                  <div className="grid grid-cols-2 gap-[0.8cqw]">
                    <Field label="Total amount" value={`${typed("$600", t, 2200, 8) || "$"} Demo USDT`} highlight />
                    <Field label="Freelancer" value="Lena Park" />
                    <Field label="Payment model" value="Milestone (3)" />
                    <Field label="Dispute resolution" value="Human resolver" />
                  </div>
                ) : step === 2 ? (
                  <div className="flex flex-col gap-[0.55cqw]">
                    {MILESTONES.map((m, i) =>
                      t >= 3800 + i * 250 ? (
                        <div
                          key={m.name}
                          className="pf-demo-in flex items-center gap-[0.8cqw] rounded-[0.7cqw] border border-[#e3e9f1] bg-[#f8fafc] px-[0.9cqw] py-[0.55cqw]"
                        >
                          <span className="flex size-[1.8cqw] items-center justify-center rounded-full bg-[#e3fbf8] text-[0.95cqw] font-bold text-[#0b7f86]">
                            {i + 1}
                          </span>
                          <span className="flex-1 text-[1.1cqw] font-semibold">{m.name}</span>
                          <span className="text-[1cqw] text-[#5b6b80]">{m.due}</span>
                          <span className="w-[5cqw] text-right text-[1.1cqw] font-bold">{m.amount}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-[0.6cqw]">
                    <Field label="Freelancer" value="Lena Park" />
                    <Field label="Model" value="Milestone (3)" />
                    <Field label="Total" value="$600 Demo USDT" />
                    <Field label="Funding" value="Before work starts" />
                    <Field label="Dispute resolution" value="Human resolver" />
                    <Field label="Fees" value="PREMIFLOW platform fee by plan" />
                  </div>
                )}
              </div>
              <div className="mt-[0.8cqw] flex items-center justify-between">
                <span className={SECONDARY}>Back</span>
                {step < 3 ? (
                  <Hot cursor={c} id={nextId}>
                    <span className={PRIMARY}>Continue</span>
                  </Hot>
                ) : (
                  <Hot cursor={c} id="create">
                    <span className={PRIMARY}>
                      <Send className={ICON} aria-hidden="true" /> Create &amp; Send Offer
                    </span>
                  </Hot>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {wallet ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(11,21,38,.45)]">
          {/* Generic demo approval card: not a replica of any wallet product. */}
          <div className="pf-demo-in w-[44%] rounded-[1.1cqw] border border-white/10 bg-[#0b1526] p-[1.4cqw] text-white shadow-[0_1.5cqw_4cqw_rgba(0,0,0,.5)]">
            <div className="flex items-center gap-[0.7cqw]">
              <span className="flex size-[2.6cqw] items-center justify-center rounded-[0.7cqw] bg-white/10">
                <Wallet className="size-[1.5cqw] text-[#2ee6d6]" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[1.35cqw] font-bold">Approve in wallet</p>
                <p className="text-[0.9cqw] text-white/55">Demo wallet {"\u00b7"} Solana Devnet</p>
              </div>
            </div>
            <div className="mt-[1cqw] space-y-[0.45cqw] text-[1.05cqw]">
              {[
                ["Action", "Fund offer"],
                ["Amount", "$600 Demo USDT"],
                ["Network", "Solana Devnet"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between rounded-[0.6cqw] bg-white/[0.06] px-[0.8cqw] py-[0.45cqw]">
                  <span className="text-white/60">{k}</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-[0.7cqw] text-[0.85cqw] text-white/50">Demo representation. No transaction is sent.</p>
            <div className="mt-[0.9cqw] grid grid-cols-2 gap-[0.7cqw]">
              <span className={`${BTN} border border-white/15 text-white/80`}>Reject</span>
              <Hot cursor={c} id="approve" className="w-full">
                <span className={`${PRIMARY} w-full`}>
                  {approving ? <LoaderCircle className={`${ICON} animate-spin`} aria-hidden="true" /> : null}
                  {approving ? "Approving" : "Approve"}
                </span>
              </Hot>
            </div>
          </div>
        </div>
      ) : null}
    </AppWindow>
  );
}

/* =============================== 5. freelancer accepts =============================== */

function OfferCard({
  title,
  amount,
  model,
  status,
  children,
  dim = false,
}: {
  title: string;
  amount: string;
  model: string;
  status: ReactNode;
  children?: ReactNode;
  dim?: boolean;
}) {
  return (
    <div className={`${PANEL} transition-opacity duration-500 ${dim ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-[1cqw]">
        <div className="min-w-0">
          <p className="text-[0.95cqw] text-[#5b6b80]">Offer from Northwind Studio</p>
          <p className={`text-[1.45cqw] font-bold leading-tight ${dim ? "line-through decoration-[#b42318]/60" : ""}`}>{title}</p>
        </div>
        {status}
      </div>
      <div className="mt-[0.8cqw] grid grid-cols-3 gap-[0.6cqw]">
        <Field label="Total" value={amount} />
        <Field label="Payment model" value={model} />
        <Field label="Funding" value="Funded" />
      </div>
      {children}
    </div>
  );
}

function AcceptScene({ t }: { t: number }) {
  const c = cursorAt(t, [
    [1700, "accept"],
    [3600, ""],
  ]);
  const accepted = t >= 2400;
  return (
    <AppWindow view="freelancer" nav="app" active="Contracts" path="/contracts">
      {t < 1700 ? <RoleBanner role="freelancer" /> : null}
      <div className="flex h-full flex-col gap-[0.9cqw] pt-[2.6cqw]">
        <OfferCard
          title={JOBS[0].title}
          amount="$600 Demo USDT"
          model="Milestone (3)"
          status={
            <span key={accepted ? "a" : "p"} className="pf-demo-in">
              {accepted ? <Chip tone="green">Active</Chip> : <Chip tone="amber">Pending offer</Chip>}
            </span>
          }
        >
          <div className="mt-[0.9cqw] flex items-center gap-[0.8cqw]">
            {accepted ? (
              <div className="pf-demo-in flex w-full items-center gap-[0.8cqw] rounded-[0.7cqw] bg-[#e5f8ea] px-[1cqw] py-[0.6cqw] text-[1.1cqw] font-semibold text-[#17803d]">
                <CheckCircle2 className="size-[1.3cqw]" aria-hidden="true" /> Contract started {"\u00b7"} Milestone 1 in progress
                <span className={`${PRIMARY} ml-auto`}>Open contract</span>
              </div>
            ) : (
              <>
                <Hot cursor={c} id="accept">
                  <span className={PRIMARY}>Accept</span>
                </Hot>
                <span className={SECONDARY}>Request Changes</span>
                <span className={DANGER}>Decline</span>
              </>
            )}
          </div>
        </OfferCard>
        <div className={`${PANEL} grid grid-cols-3 gap-[0.6cqw]`}>
          {MILESTONES.map((m, i) => (
            <div key={m.name} className="rounded-[0.7cqw] bg-[#f8fafc] px-[0.8cqw] py-[0.5cqw]">
              <p className="truncate text-[1cqw] font-semibold">
                {i + 1}. {m.name}
              </p>
              <p className="text-[0.95cqw] text-[#5b6b80]">
                {m.amount} {"\u00b7"} {accepted && i === 0 ? "In progress" : "Not started"}
              </p>
            </div>
          ))}
        </div>
      </div>
      {accepted ? <Toast>Northwind Studio was notified</Toast> : null}
    </AppWindow>
  );
}

/* =============================== 6. payment models =============================== */

const MODEL_MS = 2250;

function ModelsScene({ t }: { t: number }) {
  const k = Math.min(3, Math.floor(t / MODEL_MS));
  const local = t - k * MODEL_MS;
  return (
    <AppWindow view="freelancer" nav="app" active="Contracts" path="/contracts">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-[0.5cqw]">
          <p className="mr-[0.8cqw] text-[1.5cqw] font-bold">Contracts</p>
          {MODEL_TILES.map(({ name, icon: Icon }, i) => (
            <span
              key={name}
              className={`flex items-center gap-[0.4cqw] rounded-full px-[1cqw] py-[0.4cqw] text-[1.05cqw] font-semibold transition-colors duration-300 ${
                i === k ? "bg-[#0b1d33] text-white" : "bg-white text-[#5b6b80]"
              }`}
            >
              <Icon className="size-[1.1cqw]" aria-hidden="true" />
              {name}
            </span>
          ))}
        </div>
        <div key={k} className={`${PANEL} pf-demo-in mt-[1cqw] flex min-h-0 flex-1 flex-col`}>
          {k === 0 ? <FixedModel t={local} /> : k === 1 ? <MilestoneModel /> : k === 2 ? <StreamingModel t={local} /> : <HourlyModel t={local} />}
        </div>
      </div>
    </AppWindow>
  );
}

function ContractHead({ title, meta, status }: { title: string; meta: string; status: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-[1cqw]">
      <div className="min-w-0">
        <p className="text-[1.5cqw] font-bold leading-tight">{title}</p>
        <p className="mt-[0.2cqw] text-[1cqw] text-[#5b6b80]">{meta}</p>
      </div>
      {status}
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <span className="block h-[0.8cqw] w-full overflow-hidden rounded-full bg-[#e3e9f1]">
      <span
        className="block h-full rounded-full bg-[linear-gradient(90deg,#2ee6d6,#7c8cff)]"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
      />
    </span>
  );
}

function FixedModel({ t }: { t: number }) {
  const steps = ["Funded", "Submitted", "Approved"];
  const reached = t >= 900 ? 2 : 1;
  return (
    <>
      <ContractHead
        title="Landing page redesign"
        meta={"Fixed \u00b7 $800 Demo USDT \u00b7 one payment on approval"}
        status={<Chip tone="teal">Fixed</Chip>}
      />
      <div className="mt-[1.4cqw] grid grid-cols-3 gap-[0.8cqw]">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`rounded-[0.8cqw] border px-[1cqw] py-[0.8cqw] ${i <= reached ? "border-[#bfeee9] bg-[#f0fdfb]" : "border-[#e3e9f1] bg-white"}`}
          >
            <CheckCircle2 className={`size-[1.4cqw] ${i <= reached ? "text-[#17803d]" : "text-[#cbd5e1]"}`} aria-hidden="true" />
            <p className="mt-[0.4cqw] text-[1.2cqw] font-semibold">{s}</p>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between rounded-[0.7cqw] bg-[#f8fafc] px-[1cqw] py-[0.7cqw] text-[1.1cqw]">
        <span className="text-[#5b6b80]">Payment</span>
        <span className="font-bold">{reached === 2 ? "$800 available on approval" : "$800 held until approval"}</span>
      </div>
    </>
  );
}

function MilestoneModel() {
  const rows = [
    { name: "Wireframes and program setup", amount: "$100", status: <Chip tone="green">Approved</Chip> },
    { name: "Escrow integration", amount: "$250", status: <Chip tone="violet">Submitted</Chip> },
    { name: "Testing and handoff", amount: "$250", status: <Chip>Pending</Chip> },
  ];
  return (
    <>
      <ContractHead
        title={JOBS[0].title}
        meta={"Milestone \u00b7 $600 Demo USDT \u00b7 3 milestones"}
        status={<Chip tone="teal">Milestone</Chip>}
      />
      <div className="mt-[1cqw] flex flex-col gap-[0.5cqw]">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center gap-[0.8cqw] rounded-[0.7cqw] border border-[#e3e9f1] px-[0.9cqw] py-[0.5cqw]">
            <span className="text-[1cqw] font-bold text-[#0b7f86]">{i + 1}</span>
            <span className="flex-1 text-[1.1cqw] font-semibold">{r.name}</span>
            <span className="text-[1.1cqw] font-bold">{r.amount}</span>
            {r.status}
          </div>
        ))}
      </div>
      <div className="mt-auto pt-[0.6cqw]">
        <Meter value={1 / 6} />
        <p className="mt-[0.3cqw] text-[0.95cqw] text-[#5b6b80]">$100 of $600 approved</p>
      </div>
    </>
  );
}

function StreamingModel({ t }: { t: number }) {
  const streamed = 846.2 + t * 0.0042;
  return (
    <>
      <ContractHead
        title="Community moderation retainer"
        meta={"Streaming \u00b7 $2,000 Demo USDT over 30 days"}
        status={<Chip tone="green">Streaming</Chip>}
      />
      <div className="mt-[1.2cqw] flex items-end gap-[2cqw]">
        <div>
          <p className={LABEL}>Earned so far</p>
          <p className="text-[3cqw] font-bold tabular-nums leading-none">${streamed.toFixed(2)}</p>
        </div>
        <div className="pb-[0.3cqw] text-[1.05cqw] text-[#5b6b80]">$66.67 per day {"\u00b7"} day 13 of 30</div>
      </div>
      <div className="mt-[1.1cqw]">
        <Meter value={streamed / 2000} />
      </div>
      <div className="mt-auto flex items-center justify-between rounded-[0.7cqw] bg-[#f8fafc] px-[1cqw] py-[0.6cqw] text-[1.05cqw]">
        <span className="text-[#5b6b80]">Accrued earnings can be withdrawn as they build up</span>
        <span className={PRIMARY}>Withdraw</span>
      </div>
    </>
  );
}

function HourlyModel({ t }: { t: number }) {
  const secs = 5040 + Math.floor(t / 1000);
  const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <>
      <ContractHead
        title="Anchor smart-contract test suite"
        meta={"Hourly \u00b7 $45/hr \u00b7 weekly cap 20 h"}
        status={<Chip tone="violet">Hourly</Chip>}
      />
      <div className="mt-[1cqw] flex items-center gap-[1.2cqw] rounded-[0.8cqw] bg-[#0b1d33] px-[1.2cqw] py-[0.8cqw] text-white">
        <span className="size-[0.9cqw] rounded-full bg-[#28c840]" aria-hidden="true" />
        <span className="text-[1.1cqw] font-semibold">Session running</span>
        <span className="ml-auto text-[2cqw] font-bold tabular-nums">
          {hh}:{mm}:{ss}
        </span>
      </div>
      <div className="mt-[0.8cqw] flex flex-col gap-[0.45cqw]">
        {[
          ["Mon", "3.5 h", "Approved"],
          ["Tue", "4.0 h", "Approved"],
        ].map(([day, hrs, st]) => (
          <div key={day} className="flex items-center gap-[0.8cqw] rounded-[0.7cqw] border border-[#e3e9f1] px-[0.9cqw] py-[0.45cqw] text-[1.05cqw]">
            <span className="w-[4cqw] font-semibold">{day}</span>
            <span className="flex-1 text-[#5b6b80]">{hrs}</span>
            <Chip tone="green">{st}</Chip>
          </div>
        ))}
      </div>
    </>
  );
}

/* =============================== 7. submit + approve =============================== */

function WorkScene({ t }: { t: number }) {
  const c = cursorAt(t, [
    [2200, "submit"],
    [3600, ""],
    [5300, "open"],
    [6500, "approve"],
    [8300, ""],
  ]);
  const employer = t >= 4300;
  const submitted = t >= 2950;
  const opened = t >= 6050;
  const approved = t >= 7250;
  const note = "Milestone 1 ready: wireframes and Devnet program setup. Notes attached.";
  return (
    <AppWindow view={employer ? "employer" : "freelancer"} nav="app" active="Contracts" path="/contracts/solana-escrow-integration">
      {employer && t < 5300 ? <RoleBanner role="employer" /> : null}
      <div className="flex h-full flex-col gap-[0.9cqw]">
        <ContractHead
          title={JOBS[0].title}
          meta={"Milestone 1 of 3 \u00b7 Wireframes and program setup \u00b7 $100 Demo USDT"}
          status={
            <span key={approved ? "ap" : submitted ? "sb" : "ip"} className="pf-demo-in">
              {approved ? (
                <Chip tone="green">Approved</Chip>
              ) : submitted ? (
                <Chip tone="violet">Submitted</Chip>
              ) : (
                <Chip tone="amber">In progress</Chip>
              )}
            </span>
          }
        />
        {!employer ? (
          <div className={`${PANEL} flex min-h-0 flex-1 flex-col`}>
            <p className={LABEL}>Submit milestone</p>
            <p className="mt-[0.5cqw] min-h-[4cqw] rounded-[0.7cqw] border border-[#e3e9f1] bg-[#f8fafc] px-[0.9cqw] py-[0.6cqw] text-[1.1cqw] leading-[1.45]">
              {typed(note, t, 200, 55)}
            </p>
            {t >= 1500 ? (
              <span className="pf-demo-in mt-[0.6cqw] inline-flex w-fit items-center gap-[0.4cqw] rounded-[0.6cqw] border border-[#e3e9f1] px-[0.8cqw] py-[0.35cqw] text-[1cqw]">
                <Paperclip className="size-[1cqw]" aria-hidden="true" /> milestone-1-handoff.zip
              </span>
            ) : null}
            <div className="mt-auto flex items-center justify-between">
              {submitted ? (
                <span className="pf-demo-in text-[1.05cqw] text-[#17803d]">Submitted {"\u00b7"} Northwind Studio notified</span>
              ) : (
                <span className="text-[1cqw] text-[#6b7a90]">The employer reviews before funds move</span>
              )}
              <Hot cursor={c} id="submit">
                <span className={PRIMARY}>
                  <Send className={ICON} aria-hidden="true" /> {submitted ? "Submitted" : "Submit milestone"}
                </span>
              </Hot>
            </div>
          </div>
        ) : (
          <div className={`${PANEL} pf-demo-in flex min-h-0 flex-1 flex-col`}>
            <div className="flex items-center gap-[0.8cqw]">
              <Avatar initials="LP" tone="#2ee6d6" />
              <div className="min-w-0 flex-1">
                <p className="text-[1.15cqw] font-semibold">Lena Park submitted Milestone 1</p>
                <p className="text-[0.95cqw] text-[#5b6b80]">Just now</p>
              </div>
              {!opened ? (
                <Hot cursor={c} id="open">
                  <span className={SECONDARY}>View submission</span>
                </Hot>
              ) : null}
            </div>
            {opened ? (
              <div className="pf-demo-in mt-[0.8cqw] rounded-[0.7cqw] bg-[#f8fafc] px-[0.9cqw] py-[0.6cqw] text-[1.05cqw] leading-[1.45]">
                {note}
                <span className="mt-[0.4cqw] flex items-center gap-[0.4cqw] text-[1cqw] text-[#5b6b80]">
                  <Paperclip className="size-[1cqw]" aria-hidden="true" /> milestone-1-handoff.zip
                </span>
              </div>
            ) : null}
            <div className="mt-auto flex items-center gap-[0.8cqw]">
              {approved ? (
                <span className="pf-demo-in flex items-center gap-[0.5cqw] text-[1.15cqw] font-semibold text-[#17803d]">
                  <CheckCircle2 className="size-[1.3cqw]" aria-hidden="true" /> Approved {"\u00b7"} $100 now available to Lena
                </span>
              ) : (
                <>
                  <span className={SECONDARY}>Request changes</span>
                  <Hot cursor={c} id="approve">
                    <span className={PRIMARY}>Approve</span>
                  </Hot>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppWindow>
  );
}

/* =============================== 8. payment =============================== */

function PaymentScene({ t }: { t: number }) {
  const c = cursorAt(t, [
    [1500, "withdraw"],
    [3700, "confirm"],
    [5000, ""],
  ]);
  const breakdown = t >= 2250;
  const processing = t >= 4450 && t < 5900;
  const done = t >= 5900;
  const balance = done ? 0 : 100 * ramp(t, 0, 1200);
  return (
    <AppWindow view="freelancer" nav="app" active="Earnings" path="/dashboard/earnings">
      <div className="flex h-full gap-[1.1cqw]">
        <div className="flex w-[44%] min-w-0 flex-col gap-[0.8cqw]">
          <div className="rounded-[1cqw] bg-[linear-gradient(135deg,#0b1d33,#13406a)] p-[1.3cqw] text-white shadow-[0_0.8cqw_2cqw_rgba(11,29,51,.3)]">
            <p className="text-[1cqw] text-white/65">Available to withdraw</p>
            <p className="mt-[0.2cqw] text-[3.2cqw] font-bold tabular-nums leading-none">${balance.toFixed(2)}</p>
            <p className="mt-[0.5cqw] text-[0.95cqw] text-white/60">Earned: Milestone 1 {"\u00b7"} Solana escrow integration</p>
            <div className="mt-[0.9cqw] flex items-center justify-between gap-[0.6cqw]">
              <span className="rounded-full bg-white/10 px-[0.8cqw] py-[0.25cqw] text-[0.9cqw] font-semibold text-[#7ff3ea]">
                Demo USDT {"\u00b7"} Devnet test asset
              </span>
              <Hot cursor={c} id="withdraw">
                <span className={PRIMARY}>Withdraw</span>
              </Hot>
            </div>
          </div>
          <div className={PANEL}>
            <p className={LABEL}>Recent activity</p>
            <div className="mt-[0.5cqw] flex items-center justify-between text-[1.05cqw]">
              <span>Milestone 1 approved</span>
              <span className="font-semibold text-[#17803d]">+$100.00</span>
            </div>
            {done ? (
              <div className="pf-demo-in mt-[0.4cqw] flex items-center justify-between text-[1.05cqw]">
                <span>Withdrawal {"\u00b7"} $97.00</span>
                <Chip tone="green">Completed</Chip>
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative min-w-0 flex-1">
          {breakdown ? (
            <div className={`${PANEL} pf-demo-in flex h-full flex-col`}>
              <p className="text-[1.4cqw] font-bold">Withdraw earnings</p>
              <div className="mt-[0.9cqw] space-y-[0.5cqw] text-[1.15cqw]">
                <div className="flex justify-between gap-[1cqw]">
                  <span className="text-[#475569]">Earned</span>
                  <span className="font-semibold tabular-nums">$100.00</span>
                </div>
                <div className="flex justify-between gap-[1cqw]">
                  <span className="text-[#475569]">PREMIFLOW platform fee (Free plan {"\u00b7"} 3%)</span>
                  <span className="font-semibold tabular-nums">{"\u2212"}$3.00</span>
                </div>
                <div className="flex justify-between gap-[1cqw] border-t border-[#e3e9f1] pt-[0.5cqw] text-[1.35cqw]">
                  <span className="font-bold">Net to your wallet</span>
                  <span className="font-bold tabular-nums">$97.00</span>
                </div>
              </div>
              <div className="mt-auto">
                {done ? (
                  <div className="pf-demo-in flex items-center gap-[0.6cqw] rounded-[0.8cqw] bg-[#e5f8ea] px-[1cqw] py-[0.8cqw] text-[1.25cqw] font-bold text-[#17803d]">
                    <CheckCircle2 className="size-[1.5cqw]" aria-hidden="true" /> Payment completed {"\u00b7"} $97.00
                  </div>
                ) : processing ? (
                  <div className="pf-demo-in">
                    <p className="flex items-center gap-[0.5cqw] text-[1.05cqw] text-[#475569]">
                      <LoaderCircle className={`${ICON} animate-spin`} aria-hidden="true" /> Processing withdrawal
                    </p>
                    <div className="mt-[0.4cqw]">
                      <Meter value={ramp(t, 4450, 1450)} />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Hot cursor={c} id="confirm">
                      <span className={PRIMARY}>Confirm withdrawal</span>
                    </Hot>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`${PANEL} flex h-full items-center justify-center text-[1.1cqw] text-[#6b7a90]`}>
              Approved earnings appear here
            </div>
          )}
        </div>
      </div>
    </AppWindow>
  );
}

/* =============================== 9. request changes =============================== */

function ChangesScene({ t }: { t: number }) {
  const c = cursorAt(t, [
    [400, "request"],
    [2000, "sendreq"],
    [3500, "revise"],
    [5000, ""],
  ]);
  const employer = t >= 2900;
  const form = t >= 1100;
  const sentReq = t >= 2700;
  const cancelled = t >= 4250;
  const revised = t >= 5300;
  const message = "Could we split this into two milestones?";
  return (
    <AppWindow
      view={employer ? "employer" : "freelancer"}
      nav="app"
      active={revised ? "Create" : "Contracts"}
      path={revised ? "/create (revising)" : "/contracts"}
    >
      <div className="flex h-full gap-[1cqw]">
        <div className={`flex min-w-0 flex-col gap-[0.8cqw] ${revised ? "w-[46%]" : "w-full"}`}>
          <OfferCard
            title="Mobile wallet onboarding"
            amount="$900 Demo USDT"
            model="Fixed"
            dim={cancelled}
            status={
              <span key={cancelled ? "c" : employer ? "r" : "p"} className="pf-demo-in">
                {cancelled ? (
                  <Chip tone="red">Cancelled</Chip>
                ) : employer ? (
                  <Chip tone="amber">Changes requested</Chip>
                ) : (
                  <Chip tone="amber">Pending offer</Chip>
                )}
              </span>
            }
          >
            {!employer ? (
              <div className="mt-[0.8cqw]">
                {form ? (
                  <div className="pf-demo-in flex items-center gap-[0.7cqw]">
                    <span className="min-h-[2.6cqw] flex-1 rounded-[0.7cqw] border border-[#2ee6d6] bg-[#f0fdfb] px-[0.9cqw] py-[0.5cqw] text-[1.05cqw]">
                      {typed(message, t, 1200, 50)}
                    </span>
                    <Hot cursor={c} id="sendreq">
                      <span className={PRIMARY}>{sentReq ? "Sent" : "Send request"}</span>
                    </Hot>
                  </div>
                ) : (
                  <div className="flex gap-[0.8cqw]">
                    <span className={SECONDARY}>Accept</span>
                    <Hot cursor={c} id="request">
                      <span className={PRIMARY}>
                        <PenLine className={ICON} aria-hidden="true" /> Request Changes
                      </span>
                    </Hot>
                    <span className={DANGER}>Decline</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-[0.8cqw]">
                <p className="rounded-[0.7cqw] bg-[#fff8e8] px-[0.9cqw] py-[0.5cqw] text-[1.05cqw] text-[#7a4d00]">
                  Lena: {"\u201c"}
                  {message}
                  {"\u201d"}
                </p>
                {cancelled ? (
                  <p className="pf-demo-in mt-[0.6cqw] text-[1.05cqw] font-semibold text-[#b42318]">
                    Funded offer cancelled. Its terms were not edited.
                  </p>
                ) : (
                  <div className="mt-[0.7cqw]">
                    <Hot cursor={c} id="revise">
                      <span className={PRIMARY}>Cancel &amp; Revise Offer</span>
                    </Hot>
                  </div>
                )}
              </div>
            )}
          </OfferCard>
        </div>

        {revised ? (
          <div className={`${PANEL} pf-demo-in flex min-w-0 flex-1 flex-col`}>
            <div className="flex items-center justify-between">
              <p className="text-[1.35cqw] font-bold">Revise offer</p>
              <Chip tone="teal">Prefilled</Chip>
            </div>
            <div className="mt-[0.7cqw] grid grid-cols-2 gap-[0.5cqw]">
              <Field label="Freelancer" value="Lena Park" />
              <Field label="Total" value="$900 Demo USDT" />
              <Field label="Payment model" value="Milestone (2)" highlight />
              <Field label="Milestones" value="$450 + $450" highlight />
            </div>
            <p className="mt-[0.6cqw] text-[0.95cqw] text-[#5b6b80]">
              A revised offer is a new offer. Funded terms are never silently edited.
            </p>
            <div className="mt-auto flex justify-end">
              <span className={PRIMARY}>
                <Send className={ICON} aria-hidden="true" /> Create &amp; Send Offer
              </span>
            </div>
          </div>
        ) : null}
      </div>
      {employer && t < 3500 ? <RoleBanner role="employer" /> : null}
    </AppWindow>
  );
}

/* =============================== 10. dispute protection =============================== */

function DisputeScene({ t }: { t: number }) {
  return (
    <AppWindow view="case" nav="app" active="Resolution Desk" path="/resolver">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-[0.8cqw]">
          <p className="text-[1.5cqw] font-bold">Case DSP-1042</p>
          <span className="text-[1.05cqw] text-[#5b6b80]">Milestone 2 {"\u00b7"} $250 Demo USDT</span>
          <span className="ml-auto">
            <Chip tone="amber">Under human review</Chip>
          </span>
        </div>
        <div className="mt-[0.9cqw] grid min-h-0 flex-1 grid-cols-3 gap-[0.8cqw]">
          <div className="flex min-w-0 flex-col gap-[0.6cqw]">
            <p className={LABEL}>Party statements</p>
            {t >= 300 ? (
              <div className={`${PANEL} pf-demo-in`}>
                <p className="text-[1cqw] font-semibold text-[#4b4fd1]">Employer</p>
                <p className="mt-[0.2cqw] text-[1cqw] leading-[1.45] text-[#334155]">Milestone 2 is missing the refund flow we discussed.</p>
              </div>
            ) : null}
            {t >= 1200 ? (
              <div className={`${PANEL} pf-demo-in`}>
                <p className="text-[1cqw] font-semibold text-[#0b7f86]">Freelancer</p>
                <p className="mt-[0.2cqw] text-[1cqw] leading-[1.45] text-[#334155]">
                  The refund flow came up after funding; the agreed scope was delivered.
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-[0.6cqw]">
            <p className={LABEL}>Evidence</p>
            {["milestone-2-delivery.zip", "message-snapshot.pdf", "original-scope.pdf"].map((f, i) =>
              t >= 2100 + i * 300 ? (
                <div key={f} className={`${PANEL} pf-demo-in flex items-center gap-[0.6cqw] py-[0.7cqw]`}>
                  <FileText className="size-[1.3cqw] text-[#64748b]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[1cqw] font-semibold">{f}</span>
                </div>
              ) : null
            )}
            {t >= 3100 ? <p className="pf-demo-in text-[0.9cqw] text-[#5b6b80]">Stored as immutable case records</p> : null}
          </div>
          <div className="flex min-w-0 flex-col gap-[0.6cqw]">
            <p className={LABEL}>Assistance and decision</p>
            {t >= 3600 ? (
              <div className="pf-demo-in rounded-[0.9cqw] border border-[#d9dcff] bg-[#f6f6ff] p-[1cqw]">
                <p className="flex items-center gap-[0.4cqw] text-[1.05cqw] font-semibold text-[#4b4fd1]">
                  <Sparkles className="size-[1.2cqw]" aria-hidden="true" /> Neutral AI summary
                </p>
                <ul className="mt-[0.4cqw] list-disc space-y-[0.2cqw] pl-[1.2cqw] text-[0.95cqw] leading-[1.4] text-[#334155]">
                  <li>Both agree Milestone 2 was delivered on day 12.</li>
                  <li>They disagree on whether the refund flow was in scope.</li>
                  <li>Relevant: original scope and message snapshot.</li>
                </ul>
                <p className="mt-[0.4cqw] text-[0.85cqw] font-semibold text-[#6b7a90]">No outcome recommended.</p>
              </div>
            ) : null}
            {t >= 4900 ? (
              <div className={`${PANEL} pf-demo-in flex items-center gap-[0.7cqw]`}>
                <Avatar initials="JM" tone="#ffd27a" />
                <div className="min-w-0">
                  <p className="text-[1.05cqw] font-semibold">J. Moreno {"\u00b7"} Human resolver</p>
                  <p className="text-[0.95cqw] text-[#5b6b80]">Reviewing evidence {"\u00b7"} decision pending</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {t >= 6000 ? (
        <div className="pf-demo-in absolute inset-x-[1.3cqw] bottom-[1.3cqw] z-10 flex items-center justify-center gap-[1cqw] rounded-[0.9cqw] bg-[#0b1d33] px-[1.4cqw] py-[1cqw] text-white shadow-[0_1cqw_3cqw_rgba(0,0,0,.35)]">
          <Scale className="size-[2.2cqw] text-[#2ee6d6]" aria-hidden="true" />
          <span className="text-[2.2cqw] font-bold tracking-[-0.01em]">AI assists. A human resolver decides.</span>
        </div>
      ) : null}
    </AppWindow>
  );
}
