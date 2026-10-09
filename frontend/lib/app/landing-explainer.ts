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
