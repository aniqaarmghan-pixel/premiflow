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
/* Narrated product demo: landing inline player + /demo. A product-operation  */
/* walkthrough with synthetic data in PREMIFLOW UI. The same recording can    */
/* become the landing MP4 (MARKETPLACE_EXPLAINER_VIDEO). No wallet, RPC or    */
/* transactions: every on-screen action is a visual simulation.               */
/* ------------------------------------------------------------------------- */

export const PRODUCT_DEMO_ROUTE = "/demo";

export type ProductDemoSceneId =
  | "intro"
  | "marketplace"
  | "hire"
  | "offer"
  | "accept"
  | "models"
  | "work"
  | "payment"
  | "changes"
  | "dispute"
  | "close";

export type ProductDemoScene = {
  id: ProductDemoSceneId;
  /** Short label (studio scene list, accessibility). */
  label: string;
  /** Fixed slot on the deterministic timeline. */
  durationMs: number;
  /** Short on-screen caption (max ~2 lines). Empty = none (brand frames). */
  caption: string;
  /** Spoken narration: complements the screen instead of describing it. */
  narration: string;
  /** True when the scene is an operated product screen (not a brand frame). */
  productUi: boolean;
};

/** End card: exactly two lines. */
export const PRODUCT_DEMO_END_CARD = ["PREMIFLOW", "Freelance work. Protected on Solana."] as const;

export const PRODUCT_DEMO_SCENES: readonly ProductDemoScene[] = [
  {
    id: "intro",
    label: "Intro",
    durationMs: 4000,
    caption: "",
    narration: "PREMIFLOW. Freelance work, protected on Solana.",
    productUi: false,
  },
  {
    id: "marketplace",
    label: "Marketplace",
    durationMs: 9000,
    caption: "Browse jobs, open the details, send a proposal.",
    narration:
      "Freelancers browse open jobs, open the details, check the budget and timeline, then send a proposal in a few clicks.",
    productUi: true,
  },
  {
    id: "hire",
    label: "Proposal & hire",
    durationMs: 9000,
    caption: "A proposal arrives. The employer hires into a protected offer.",
    narration:
      "On the other side, employers see proposals arrive, compare talent and hire the best fit straight into a protected offer.",
    productUi: true,
  },
  {
    id: "offer",
    label: "Create offer",
    durationMs: 10500,
    caption: "Model, amount, schedule. One approval, and the offer is funded.",
    narration:
      "The offer wizard sets the payment model, amount and schedule. One approval in the wallet, and the offer is funded before work starts.",
    productUi: true,
  },
  {
    id: "accept",
    label: "Freelancer accepts",
    durationMs: 7000,
    caption: "Accept, request changes or decline.",
    narration: "Once funded, the freelancer can accept, request changes or decline.",
    productUi: true,
  },
  {
    id: "models",
    label: "Payment models",
    durationMs: 9000,
    caption: "Fixed \u00b7 Milestone \u00b7 Streaming \u00b7 Hourly",
    narration: "Work can be paid Fixed, by Milestone, through Streaming, or Hourly, on the same contract workflow.",
    productUi: true,
  },
  {
    id: "work",
    label: "Submit & approve",
    durationMs: 9500,
    caption: "Submit the milestone. Review. Approve.",
    narration:
      "The freelancer submits the milestone with a quick update. The employer opens the submission, reviews it and approves.",
    productUi: true,
  },
  {
    id: "payment",
    label: "Payment",
    durationMs: 8500,
    caption: "$100 earned \u00b7 $3 PREMIFLOW platform fee (Free plan) \u00b7 $97 net",
    narration:
      "After approval, earned funds become available for withdrawal. The PREMIFLOW platform fee and net amount are shown clearly.",
    productUi: true,
  },
  {
    id: "changes",
    label: "Request changes",
    durationMs: 9000,
    caption: "Funded terms are never silently edited.",
    narration:
      "Need different terms? The freelancer requests changes, and the employer cancels and revises the offer. Funded terms are never silently edited.",
    productUi: true,
  },
  {
    id: "dispute",
    label: "Dispute protection",
    durationMs: 10000,
    caption: "AI assists. A human resolver decides.",
    narration:
      "If a dispute occurs, both sides provide statements and evidence. AI prepares a neutral summary, while a human resolver makes the final decision.",
    productUi: true,
  },
  {
    id: "close",
    label: "End card",
    durationMs: 4500,
    caption: "",
    narration: "PREMIFLOW. Freelance work. Protected on Solana.",
    productUi: false,
  },
];

/** A spoken preview line may run past its slot by at most this much. */
export const PRODUCT_DEMO_SPEECH_OVERRUN_CAP_MS = 1500;

export function productDemoTotalMs(scenes: readonly ProductDemoScene[] = PRODUCT_DEMO_SCENES): number {
  return scenes.reduce((sum, s) => sum + s.durationMs, 0);
}

export function productDemoSceneStartMs(
  index: number,
  scenes: readonly ProductDemoScene[] = PRODUCT_DEMO_SCENES
): number {
  return scenes.slice(0, Math.max(0, index)).reduce((sum, s) => sum + s.durationMs, 0);
}

/** Total spoken words in the product demo script. */
export function productDemoWordCount(scenes: readonly ProductDemoScene[] = PRODUCT_DEMO_SCENES): number {
  return scenes.reduce((sum, s) => sum + s.narration.trim().split(/\s+/).filter(Boolean).length, 0);
}

/** "1:30" style label. */
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
