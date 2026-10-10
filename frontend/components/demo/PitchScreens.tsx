"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, CheckCircle2, FileText, Gavel, MessageSquare, Paperclip, Search, Send, Sparkles, Wallet } from "lucide-react";

import { StatusBadge } from "@/components/contracts/StatusBadge";
import { TypeMotif } from "@/components/contracts/TypeMotif";
import { Avatar, JobSummaryCard, StatusPill } from "@/components/marketplace/MarketplaceParts";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DevnetAssetNote } from "@/components/ui/DevnetAssetNote";
import { Identicon } from "@/components/ui/Identicon";
import { Progress } from "@/components/ui/Progress";
import { formatMarketplaceAmount, PROPOSAL_STATUS_LABELS } from "@/lib/app/marketplace";
import { CREATE_SEND_OFFER_LABEL } from "@/lib/app/milestone-create-plan";
import { OFFER_REVISION_COPY } from "@/lib/app/offer-revision";
import { pitchScreenshotSrc, type PitchScreenSlot } from "@/lib/app/pitch-deck";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { AI_CASE_SUMMARY_COPY } from "@/lib/app/resolution-center";
import { PRICING_COPY, SUBSCRIPTION_PLANS, planDemoUsdtLabel, planPriceLabel } from "@/lib/app/subscription-plans";
import { actionLabel } from "@/lib/app/view-model";
import type { PublicJob } from "@/lib/server/marketplace/service";

/**
 * Pitch "screenshots": a real PNG/WebP from PITCH_SCREENSHOT_SLOTS when one is
 * configured, otherwise the real PREMIFLOW components (job cards, StatusBadge,
 * Card, Progress, TypeMotif, Button, plan data and product copy) rendered with
 * sample data at desktop width and scaled into a non-interactive frame.
 * Nothing here signs, connects a wallet, or calls an API.
 */

/* ------------------------------- scaling frame ------------------------------- */

/** Renders children at a fixed CSS width and scales them to fit the box width. */
export function Scaled({ width, children, className = "" }: { width: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / width);
    update();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      {scale > 0 ? (
        <div className="absolute left-0 top-0 origin-top-left" style={{ width, transform: `scale(${scale})` }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function ProductScreen({
  slot,
  title,
  width = 1280,
  compact = false,
  className = "",
}: {
  slot: PitchScreenSlot;
  title: string;
  width?: number;
  compact?: boolean;
  className?: string;
}) {
  const shot = pitchScreenshotSrc(slot);
  return (
    <div
      aria-hidden="true"
      inert
      className={`flex min-h-0 flex-col overflow-hidden rounded-[0.9cqw] border border-white/15 bg-[#f3f6fb] shadow-[0_1.2cqw_3cqw_rgba(0,0,0,.45)] ${className}`}
    >
      <div className={`flex shrink-0 items-center gap-[0.35cqw] bg-[#0c1b2e] ${compact ? "px-[0.6cqw] py-[0.3cqw]" : "px-[0.9cqw] py-[0.45cqw]"}`}>
        <span className="size-[0.5cqw] rounded-full bg-[#ff5f57]" />
        <span className="size-[0.5cqw] rounded-full bg-[#febc2e]" />
        <span className="size-[0.5cqw] rounded-full bg-[#28c840]" />
        <span className={`ml-[0.5cqw] truncate font-semibold text-white/75 ${compact ? "text-[0.8cqw]" : "text-[0.9cqw]"}`}>{title}</span>
      </div>
      {shot ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
        </div>
      ) : (
        <Scaled width={width} className="min-h-0 flex-1 text-left text-ink">
          <ScreenContent slot={slot} />
        </Scaled>
      )}
    </div>
  );
}

/* --------------------------------- sample data -------------------------------- */

const EMPLOYER = "PFdemoEmp1oyerWa11et1111111111111111111111";
const FREELANCER = "PFdemoFree1ancerWa11et11111111111111111111";

function base(ui: number): string {
  return String(Math.round(ui * 10 ** lockedCreatePayment().decimals));
}
function money(ui: number): string {
  return formatMarketplaceAmount(base(ui), { demo: true });
}

function sampleJobs(): PublicJob[] {
  const job = (
    id: string,
    title: string,
    description: string,
    paymentMode: PublicJob["paymentMode"],
    amount: number,
    category: PublicJob["category"],
    skills: string[]
  ): PublicJob => ({
    id,
    employerWallet: EMPLOYER,
    title,
    description,
    paymentMode,
    budgetAmount: base(amount),
    tokenMint: String(lockedCreatePayment().mint),
    status: "open",
    selectedProposalId: null,
    createdAt: "2026-09-28T10:00:00.000Z",
    updatedAt: "2026-09-28T10:00:00.000Z",
    closedAt: null,
    skills: [...skills, "devnet demo"],
    category,
  });
  return [
    job("pitch-1", "Escrow dashboard for a DAO treasury", "Build a Next.js dashboard that shows funded milestones, reviews and payouts for a small DAO team.", "Milestone", 2400, "web3", ["Next.js", "Solana", "TypeScript"]),
    job("pitch-2", "Landing page redesign for a fintech launch", "Refresh the hero, pricing and onboarding screens with a clean, accessible design system.", "Fixed", 900, "design", ["Figma", "UI design"]),
    job("pitch-3", "Ongoing smart-contract code review", "Weekly review sessions for an Anchor program, with written notes after each session.", "Hourly", 45, "development", ["Rust", "Anchor", "Security"]),
    job("pitch-4", "Weekly product updates and community posts", "Write release notes and community updates for an active product team.", "Streaming", 1200, "writing", ["Writing", "Content"]),
  ];
}

/* --------------------------------- page shells -------------------------------- */

function Page({ eyebrow, title, right, children }: { eyebrow: string; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[900px] bg-paper p-7 text-ink">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
          <h3 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        </div>
        {right}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Row({ k, v, strong = false }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <p className={`flex items-center justify-between border-b border-line py-2.5 text-sm last:border-0 ${strong ? "font-semibold text-ink" : "text-ink-soft"}`}>
      <span>{k}</span>
      <span className={strong ? "text-ink" : "font-medium text-ink"}>{v}</span>
    </p>
  );
}

function Party({ name, wallet, role }: { name: string; wallet: string; role: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <Identicon seed={wallet} size={34} />
      <span>
        <span className="block text-sm font-semibold text-ink">{name}</span>
        <span className="block text-xs text-ink-faint">{role}</span>
      </span>
    </span>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-ink-soft">{children}</span>;
}

/* ----------------------------------- screens ---------------------------------- */

function MarketplaceScreen() {
  return (
    <Page
      eyebrow="Marketplace"
      title="Find work"
      right={
        <span className="flex w-[380px] items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm text-ink-faint">
          <Search size={16} aria-hidden="true" /> Search jobs, gigs and freelancers
        </span>
      }
    >
      <div className="mb-4 flex gap-2">
        {["All categories", "Web3", "Development", "Design", "Writing"].map((c, i) => (
          <span key={c} className={`rounded-full px-3 py-1 text-xs font-semibold ${i === 0 ? "bg-ink text-white" : "border border-line bg-card text-ink-soft"}`}>
            {c}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {sampleJobs().map((job) => (
          <JobSummaryCard key={job.id} job={job} />
        ))}
      </div>
    </Page>
  );
}

function ProposalsScreen() {
  const proposals = [
    { name: "Ava Chen", wallet: FREELANCER, amount: 2400, status: "selected" as const, message: "I have shipped two escrow dashboards on Solana. Milestones: design, build, launch." },
    { name: "Sam Rivera", wallet: "PFdemoSamRivera11111111111111111111111111", amount: 2600, status: "submitted" as const, message: "Happy to start with a short design milestone and a clickable prototype." },
    { name: "Kai Morgan", wallet: "PFdemoKaiMorgan11111111111111111111111111", amount: 2200, status: "submitted" as const, message: "Full-stack TypeScript developer, available to start this week." },
  ];
  return (
    <Page eyebrow="My jobs · Escrow dashboard for a DAO treasury" title="Proposals (3)">
      <div className="space-y-3">
        {proposals.map((p) => (
          <Card key={p.name} className={`flex items-center gap-4 p-4 ${p.status === "selected" ? "ring-2 ring-accent/60" : ""}`}>
            <Avatar url={null} name={p.name} wallet={p.wallet} size={48} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold text-ink">
                {p.name} <StatusPill>{PROPOSAL_STATUS_LABELS[p.status]}</StatusPill>
              </p>
              <p className="mt-1 truncate text-sm text-ink-soft">{p.message}</p>
            </div>
            <span className="text-sm font-semibold text-ink">{money(p.amount)}</span>
            {p.status === "selected" ? <Button>Create offer</Button> : <Button variant="secondary">View</Button>}
          </Card>
        ))}
      </div>
    </Page>
  );
}

function OfferScreen() {
  const mint = lockedCreatePayment().mint;
  return (
    <Page eyebrow="Create contract" title="Review and send">
      <div className="mb-4 flex gap-2">
        {["Type", "Terms", "Schedule", "Review"].map((s, i) => (
          <span key={s} className={`rounded-full px-3 py-1 text-xs font-semibold ${i === 3 ? "bg-accent-soft text-accent" : "bg-paper-2 text-ink-faint"}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <Card className="p-5">
          <Party name="Ava Chen" wallet={FREELANCER} role="Freelancer" />
          <div className="mt-3">
            <Row k="Contract type" v="Milestone" />
            <Row k="Design" v={money(600)} />
            <Row k="Build" v={money(1200)} />
            <Row k="Launch" v={money(600)} />
            <Row k="PREMIFLOW platform fee (your plan: Pro, 1%)" v={money(24)} />
            <Row k="Total funded" v={money(2424)} strong />
          </div>
          <DevnetAssetNote mint={mint} className="mt-3" />
        </Card>
        <Card className="flex flex-col p-5">
          <TypeMotif type="Milestone" active />
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            Funds are locked when the offer is sent. The freelancer can accept, decline or request changes.
          </p>
          <Button className="mt-auto w-full">{CREATE_SEND_OFFER_LABEL}</Button>
        </Card>
      </div>
    </Page>
  );
}

function AcceptScreen() {
  return (
    <Page eyebrow="Offers · Escrow dashboard for a DAO treasury" title="Offer from your client" right={<StatusBadge status="PendingAcceptance" label="Awaiting acceptance" />}>
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <Card className="p-5">
          <Party name="Northwind DAO" wallet={EMPLOYER} role="Employer" />
          <div className="mt-3">
            <Row k="Contract type" v="Milestone · 3 stages" />
            <Row k="Funded" v={<Badge tone="ok">Funded</Badge>} />
            <Row k="Total" v={money(2400)} strong />
          </div>
        </Card>
        <Card className="flex flex-col gap-2.5 p-5">
          <Button className="w-full">{actionLabel("acceptContract")}</Button>
          <Button variant="secondary" className="w-full">Request changes</Button>
          <Button variant="ghost" className="w-full">{actionLabel("declineContract")}</Button>
          <p className="mt-1 text-xs leading-5 text-ink-faint">{OFFER_REVISION_COPY.requestChangesTitle}</p>
        </Card>
      </div>
    </Page>
  );
}

function MilestoneList({ review }: { review: boolean }) {
  const items = [
    { name: "Design", amount: 600, state: "Approved" },
    { name: "Build", amount: 1200, state: review ? "Submitted" : "In progress" },
    { name: "Launch", amount: 600, state: "Not started" },
  ];
  return (
    <div className="space-y-2">
      {items.map((m) => (
        <p key={m.name} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${m.state === "Submitted" ? "border-gold/50 bg-gold-soft/40" : "border-line bg-card"}`}>
          <span className="flex items-center gap-2 font-semibold text-ink">
            {m.state === "Approved" ? <CheckCircle2 size={16} className="text-ok" aria-hidden="true" /> : <span className="size-4 rounded-full border-2 border-line" />}
            {m.name}
          </span>
          <span className="flex items-center gap-3">
            <span className="text-ink-soft">{money(m.amount)}</span>
            <Badge tone={m.state === "Approved" ? "ok" : m.state === "Submitted" ? "gold" : "neutral"}>{m.state}</Badge>
          </span>
        </p>
      ))}
    </div>
  );
}

function WorkScreen() {
  return (
    <Page eyebrow="Contract · Escrow dashboard for a DAO treasury" title="Milestone 2 submitted for review" right={<StatusBadge status="Active" label="Active" />}>
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <Card className="p-5">
          <MilestoneList review />
          <div className="mt-4">
            <Progress value={25} label="Released" />
          </div>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-sm font-semibold text-ink">Delivery</p>
          <p className="flex items-center gap-2 rounded-xl bg-paper-2 px-3 py-2 text-sm text-ink-soft">
            <Paperclip size={15} aria-hidden="true" /> build-milestone-2.zip
          </p>
          <p className="text-xs leading-5 text-ink-faint">Review the delivery, then approve it or request a revision.</p>
          <Button className="mt-auto w-full">{actionLabel("approveWorkUnit")}</Button>
          <Button variant="secondary" className="w-full">{actionLabel("requestWorkRevision")}</Button>
        </Card>
      </div>
    </Page>
  );
}

function EarningsScreen() {
  const mint = lockedCreatePayment().mint;
  return (
    <Page eyebrow="Contract · Escrow dashboard for a DAO treasury" title="Earnings" right={<StatusBadge status="Active" label="Active" />}>
      <div className="grid grid-cols-[1fr_1.2fr] gap-4">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Available to collect</p>
          <p className="mt-1 font-display text-[40px] font-semibold tracking-[-0.03em] text-ink">{money(582)}</p>
          <DevnetAssetNote mint={mint} />
          <Button className="mt-4 w-full">
            <Wallet size={16} aria-hidden="true" /> {actionLabel("withdrawFreelancer")}
          </Button>
        </Card>
        <Card className="p-5">
          <Row k="Approved earnings" v={money(600)} />
          <Row k="PREMIFLOW platform fee (your plan: Free, 3%)" v={`\u2212${money(18)}`} />
          <Row k="You receive" v={money(582)} strong />
          <div className="mt-4">
            <Progress value={25} label="Contract paid out" />
          </div>
        </Card>
      </div>
    </Page>
  );
}

function ContractScreen() {
  return (
    <Page eyebrow="Contracts · Weekly product updates" title="Streaming contract" right={<StatusBadge status="Active" label="Active" />}>
      <div className="grid grid-cols-[1.3fr_1fr] gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <Party name="Northwind DAO" wallet={EMPLOYER} role="Employer" />
            <Party name="Ava Chen" wallet={FREELANCER} role="Freelancer" />
          </div>
          <div className="mt-4">
            <TypeMotif type="Streaming" active />
          </div>
          <div className="mt-3">
            <Progress value={42} label="Earned so far" />
          </div>
        </Card>
        <Card className="p-5">
          <Row k="Contract value" v={money(1200)} />
          <Row k="Earned so far" v={money(504)} />
          <Row k="Protected in escrow" v={money(696)} />
          <Row k="Resolver" v="Human resolver" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip>Offer funded</Chip>
            <Chip>Accepted</Chip>
            <Chip>Earning</Chip>
          </div>
        </Card>
      </div>
    </Page>
  );
}

function ResolutionScreen() {
  return (
    <Page eyebrow="Resolution Desk" title="Case · Escrow dashboard, milestone 2" right={<StatusBadge status="Disputed" label="Disputed" />}>
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-sm font-semibold text-ink">Statements</p>
          <div className="mt-2 space-y-2 text-sm">
            <p className="rounded-xl bg-paper-2 px-3 py-2 text-ink-soft"><span className="font-semibold text-ink">Employer:</span> Two acceptance criteria are not met in the build.</p>
            <p className="rounded-xl bg-paper-2 px-3 py-2 text-ink-soft"><span className="font-semibold text-ink">Freelancer:</span> Both criteria are covered in the submitted build.</p>
          </div>
          <p className="mt-4 text-sm font-semibold text-ink">Evidence</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip><FileText size={12} className="mr-1 inline" aria-hidden="true" />acceptance-criteria.pdf</Chip>
            <Chip><Paperclip size={12} className="mr-1 inline" aria-hidden="true" />build-milestone-2.zip</Chip>
            <Chip><MessageSquare size={12} className="mr-1 inline" aria-hidden="true" />Message snapshot</Chip>
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Sparkles size={16} className="text-accent" aria-hidden="true" /> {AI_CASE_SUMMARY_COPY.heading}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              <li>Milestone 2 was submitted with one build file.</li>
              <li>The parties disagree on two acceptance criteria.</li>
              <li>Both statements and three evidence items are on file.</li>
            </ul>
            <p className="mt-2 text-xs leading-5 text-ink-faint">{AI_CASE_SUMMARY_COPY.disclaimer}</p>
          </Card>
          <Card className="flex items-center justify-between p-5">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Gavel size={16} className="text-accent" aria-hidden="true" /> Human resolver decision
            </span>
            <Button>{actionLabel("resolveDispute")}</Button>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function MessagesScreen() {
  return (
    <Page eyebrow="Messages" title="Escrow dashboard for a DAO treasury">
      <div className="grid grid-cols-[300px_1fr] gap-4">
        <Card className="space-y-2 p-3">
          {[["Ava Chen", FREELANCER, true], ["Northwind DAO", EMPLOYER, false]].map(([n, w, on]) => (
            <p key={n as string} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${on ? "bg-accent-soft font-semibold text-ink" : "text-ink-soft"}`}>
              <Identicon seed={w as string} size={28} /> {n as string}
            </p>
          ))}
        </Card>
        <Card className="flex flex-col gap-3 p-5 text-sm">
          <span className="self-center rounded-full bg-paper-2 px-3 py-1 text-xs text-ink-faint">Work submitted · Milestone 2</span>
          <span className="max-w-[70%] self-start rounded-2xl bg-paper-2 px-4 py-2.5 text-ink">Milestone 2 is ready for review. The build link is in the delivery.</span>
          <span className="max-w-[70%] self-end rounded-2xl bg-accent px-4 py-2.5 text-white">Thanks, reviewing it today.</span>
          <span className="mt-2 flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-ink-faint">
            Write a message <Send size={15} className="ml-auto" aria-hidden="true" />
          </span>
        </Card>
      </div>
    </Page>
  );
}

function NotificationsScreen() {
  const items = [
    "New proposal on Escrow dashboard for a DAO treasury",
    "Offer funded and sent to Ava Chen",
    "Milestone 2 submitted for review",
    `Work approved: ${money(600)} ready to collect`,
  ];
  return (
    <Page eyebrow="Notifications" title="Activity">
      <Card className="divide-y divide-line">
        {items.map((x, i) => (
          <p key={x} className="flex items-center gap-3 px-5 py-3.5 text-sm text-ink">
            <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Bell size={15} aria-hidden="true" />
            </span>
            {x}
            {i < 2 ? <span className="ml-auto size-2 rounded-full bg-accent" /> : null}
          </p>
        ))}
      </Card>
    </Page>
  );
}

function PricingScreen() {
  return (
    <Page eyebrow={PRICING_COPY.eyebrow} title={PRICING_COPY.heading}>
      <div className="grid grid-cols-3 gap-4">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <Card key={plan.tier} className={`flex flex-col p-5 ${plan.tier === "Premium" ? "ring-2 ring-accent/60" : ""}`}>
            <p className="text-sm font-semibold text-ink">{plan.name}</p>
            <p className="text-xs text-ink-faint">{plan.audience}</p>
            <p className="mt-3 font-display text-[30px] font-semibold tracking-[-0.02em] text-ink">{planPriceLabel(plan, "Monthly")}</p>
            {plan.monthlyUsd > 0 ? <p className="text-xs text-ink-faint">{planDemoUsdtLabel(plan, "Monthly")}</p> : null}
            <p className="mt-3 text-sm font-medium text-ink-soft">{plan.feeLabel}</p>
            <Button variant={plan.purchasable ? "primary" : "secondary"} className="mt-4 w-full">
              {plan.purchasable ? PRICING_COPY.subscribe(plan.name) : PRICING_COPY.freeCta}
            </Button>
          </Card>
        ))}
      </div>
    </Page>
  );
}

function ScreenContent({ slot }: { slot: PitchScreenSlot }) {
  switch (slot) {
    case "marketplace":
      return <MarketplaceScreen />;
    case "proposals":
      return <ProposalsScreen />;
    case "offer":
      return <OfferScreen />;
    case "accept":
      return <AcceptScreen />;
    case "work":
      return <WorkScreen />;
    case "earnings":
      return <EarningsScreen />;
    case "contract":
      return <ContractScreen />;
    case "resolution":
      return <ResolutionScreen />;
    case "messages":
      return <MessagesScreen />;
    case "notifications":
      return <NotificationsScreen />;
    case "pricing":
    default:
      return <PricingScreen />;
  }
}
