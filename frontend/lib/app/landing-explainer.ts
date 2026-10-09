/**
 * Landing explainer video section copy. Factual — no guarantees, no stock claims.
 */
export const LANDING_EXPLAINER = {
  eyebrow: "See PREMIFLOW",
  heading: "Protected freelance work, from hire to payout",
  body:
    "A short look at how PREMIFLOW keeps contracts clear and payments protected on Solana — without turning the whole marketplace into a wallet-only experience.",
  playLabel: "Watch how PREMIFLOW works",
  modalTitle: "How PREMIFLOW protects freelance work",
  previewLabel: "Interactive product preview",
  previewNote: "Full product video coming soon",
  steps: [
    { short: "Marketplace", title: "Find the work", caption: "Browse jobs, gigs and freelancer profiles." },
    { short: "Contract", title: "Protected contract", caption: "Agree on scope, payment model and a human resolver." },
    { short: "Escrow", title: "Escrow funded", caption: "The employer funds program escrow on Solana." },
    { short: "Work", title: "Work delivered", caption: "The freelancer submits deliverables against the plan." },
    { short: "Approval", title: "Approval", caption: "The employer approves or requests changes." },
    { short: "Payment", title: "Payment released", caption: "Approved funds release from escrow to the freelancer." },
  ],
  points: [
    {
      title: "Protected contracts & escrow",
      body: "Employers fund an on-chain contract. Funds sit in program escrow until work is approved — not in a PREMIFLOW-controlled wallet.",
    },
    {
      title: "Fixed, Milestone, Streaming & Hourly",
      body: "Pick the payment model that fits the work. Streaming and Hourly suit ongoing delivery; Fixed and Milestone suit scoped deliverables.",
    },
    {
      title: "Disputes with human resolution",
      body: "Structured evidence and a designated human resolver. AI may summarize a case; it never decides the outcome.",
    },
    {
      title: "Why PREMIFLOW",
      body: "Familiar marketplace discovery (jobs, gigs, profiles, messaging) with Solana settlement where it adds protection and clarity.",
    },
  ],
} as const;

/* ------------------------------------------------------------------------- */
/* Narrated product demo (/demo). The same recording becomes the landing      */
/* explainer MP4 (MARKETPLACE_EXPLAINER_VIDEO=/media/premiflow-demo.mp4) and  */
/* the Colosseum product-demo submission. Synthetic data only.                 */
/* ------------------------------------------------------------------------- */

export const PRODUCT_DEMO_ROUTE = "/demo";

export type ProductDemoSceneId =
  | "intro"
  | "marketplace"
  | "proposal"
  | "escrow"
  | "models"
  | "work"
  | "disputes"
  | "fees"
  | "close"
  | "final";

export type ProductDemoScene = {
  id: ProductDemoSceneId;
  /** Short chip label for the scene list. */
  label: string;
  /** On-screen scene heading (empty for full-bleed brand scenes). */
  heading: string;
  /** Fixed slot on the deterministic timeline. */
  durationMs: number;
  /** Short on-screen caption (max ~2 lines). Empty = none (brand end card). */
  caption: string;
  /** Spoken narration: explains the screen rather than reading the caption. */
  narration: string;
};

export const PRODUCT_DEMO_FINAL_LINE = "PREMIFLOW \u2014 Freelance work. Protected on Solana.";

export const PRODUCT_DEMO_SCENES: readonly ProductDemoScene[] = [
  {
    id: "intro",
    label: "Intro",
    heading: "",
    durationMs: 8000,
    caption: "A freelance marketplace with protected payments, built around Solana.",
    narration:
      "PREMIFLOW is a freelance marketplace where agreements and protected payments are built around Solana.",
  },
  {
    id: "marketplace",
    label: "Marketplace",
    heading: "One marketplace for both sides",
    durationMs: 12000,
    caption: "Find work or hire talent from the same account.",
    narration:
      "Employers can find talent, freelancers can find work, and both sides use the same marketplace and account experience.",
  },
  {
    id: "proposal",
    label: "Offer",
    heading: "Select a proposal, then send a protected offer",
    durationMs: 13000,
    caption: "Pick a proposal, then Create & Send Offer with clear terms.",
    narration:
      "Once both sides agree, the employer creates and sends a protected offer with clear payment, schedule and review terms.",
  },
  {
    id: "escrow",
    label: "Escrow",
    heading: "Funds are secured before work begins",
    durationMs: 13000,
    caption: "The contract is funded before any work starts.",
    narration:
      "Funds are placed into the contract workflow before work begins, so payment doesn't rely only on trust.",
  },
  {
    id: "models",
    label: "Payment models",
    heading: "Four ways to work",
    durationMs: 18000,
    caption: "Fixed \u00b7 Milestones \u00b7 Streaming \u00b7 Hourly",
    narration:
      "PREMIFLOW supports four ways to work: Fixed payments, Milestones, Streaming payments over time, and Hourly sessions. Fixed and Milestones suit scoped deliverables, while Streaming and Hourly suit ongoing work.",
  },
  {
    id: "work",
    label: "Work & payment",
    heading: "Submit, review, release",
    durationMs: 12000,
    caption: "Submit work, get it approved, withdraw approved earnings.",
    narration:
      "The freelancer submits work, the employer reviews it, and approved earnings become available for withdrawal.",
  },
  {
    id: "disputes",
    label: "Disputes",
    heading: "Disputes get a human decision",
    durationMs: 14000,
    caption: "Statements and evidence. AI summarizes; a human resolver decides.",
    narration:
      "If something goes wrong, both parties can provide statements and evidence. AI creates a neutral case summary, but a human resolver makes the final decision.",
  },
  {
    id: "fees",
    label: "Pricing",
    heading: "Your plan sets your PREMIFLOW platform fee",
    durationMs: 12000,
    caption: "PREMIFLOW platform fee by plan: Free 3%, Pro 1%, Premium 0%.",
    narration:
      "Each participant's plan sets their own platform fee. Free starts at three percent, Pro at one percent, and Premium at zero percent for new contracts.",
  },
  {
    id: "close",
    label: "Summary",
    heading: "One Solana-powered workflow",
    durationMs: 8000,
    caption: "Discovery, protected agreements and flexible payments in one place.",
    narration:
      "PREMIFLOW combines marketplace discovery, protected agreements and flexible payments in one Solana-powered workflow.",
  },
  {
    id: "final",
    label: "End card",
    heading: "",
    durationMs: 5000,
    caption: "",
    narration: "PREMIFLOW. Freelance work, protected on Solana.",
  },
];

/** A spoken line may run past its slot by at most this much before the scene advances. */
export const PRODUCT_DEMO_SPEECH_OVERRUN_CAP_MS = 4000;

export function productDemoTotalMs(scenes: readonly ProductDemoScene[] = PRODUCT_DEMO_SCENES): number {
  return scenes.reduce((sum, s) => sum + s.durationMs, 0);
}

export function productDemoSceneStartMs(
  index: number,
  scenes: readonly ProductDemoScene[] = PRODUCT_DEMO_SCENES
): number {
  return scenes.slice(0, Math.max(0, index)).reduce((sum, s) => sum + s.durationMs, 0);
}

/** "1:55" style label. */
export function formatDemoTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export type NarrationVoiceLike = { name: string; lang: string; default?: boolean };

/**
 * Best available English voice without hardcoding any OS-specific voice:
 * prefer en-US / en-GB, names that suggest natural / neural / premium
 * quality, and avoid novelty voices. Null = let the browser use its default.
 */
export function pickNarrationVoice<T extends NarrationVoiceLike>(voices: readonly T[]): T | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang ?? ""));
  if (english.length === 0) return null;
  const score = (v: T): number => {
    let s = 0;
    if (/^en[-_](us|gb)/i.test(v.lang)) s += 3;
    else if (/^en[-_](au|ca|ie|nz)/i.test(v.lang)) s += 2;
    if (/natural|neural|premium|enhanced|wavenet|studio/i.test(v.name)) s += 5;
    if (/online/i.test(v.name)) s += 1;
    if (/compact|novelty|whisper|bad news|bells|bubbles|cellos|zarvox|trinoids|robot|organ|jester/i.test(v.name)) s -= 6;
    if (v.default) s += 1;
    return s;
  };
  return english.reduce((best, v) => (score(v) > score(best) ? v : best), english[0]);
}
