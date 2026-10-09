/**
 * Speaker script for the /demo/pitch deck. Edit freely: slide timing is
 * derived from the word count (about 150 words per minute plus a short pause).
 * - narration: spoken line (browser voice or a prerecorded track).
 * - caption: short on-screen caption (max ~2 lines), not the full script.
 * - notes: presenter-only notes, shown outside Record Mode.
 * Facts only: no traction, revenue or user numbers; no competitor claims.
 */
export type PitchSlideId =
  | "title"
  | "problem"
  | "solution"
  | "models"
  | "product"
  | "protection"
  | "solana"
  | "business"
  | "current"
  | "closing";

export type PitchScript = { narration: string; caption: string; notes: string };

export const PITCH_NARRATION: Record<PitchSlideId, PitchScript> = {
  title: {
    narration:
      "This is PREMIFLOW, a freelance marketplace where work agreements and payments are protected on Solana. One marketplace, and four ways to get paid: fixed, milestone, streaming and hourly.",
    caption: "A freelance marketplace with payments protected on Solana.",
    notes: "Introduce yourself briefly, then the one-line positioning. Keep it calm and short.",
  },
  problem: {
    narration:
      "Freelance work often starts between strangers. Payment terms tend to be rigid, freelancers spend time following up on payments, and discovery and payment tools usually live in different places. When something goes wrong, disputes are hard to handle.",
    caption: "Trust gaps, rigid terms, payment follow-up, scattered tools, hard disputes.",
    notes: "Keep this neutral. No competitor names and no claims about what other platforms lack.",
  },
  solution: {
    narration:
      "PREMIFLOW keeps the marketplace experience people already know. You find work or hire talent, send a proposal and agree on terms. The employer then funds a protected contract on Solana, the work is reviewed, and approved payment is released.",
    caption: "Familiar marketplace UX, with funding and settlement on Solana.",
    notes: "Optional: drop a short contract or payment clip from the product demo into this slide.",
  },
  models: {
    narration:
      "Not all work is paid the same way, so PREMIFLOW supports four models. Fixed is one agreed payment. Milestones release payment stage by stage. Streaming lets earnings accrue over time, and Hourly follows approved working time.",
    caption: "Fixed, Milestone, Streaming and Hourly contracts.",
    notes: "All four contract types are implemented on Devnet today.",
  },
  product: {
    narration:
      "And it covers the full freelance lifecycle: jobs and gigs, freelancer profiles, proposals, protected contract creation, work submission and review, messaging, notifications and payment settlement, with account and wallet support built in.",
    caption: "Marketplace, proposals, contracts, review, messaging and settlement.",
    notes: "Optional: replace the mockups with a short marketplace clip from the product demo.",
  },
  protection: {
    narration:
      "Funding follows the terms both sides agreed on. If there's a dispute, each party adds a statement and evidence. An AI assistant prepares a neutral case summary, but it does not decide. A human resolver makes the final settlement decision.",
    caption: "AI assists. A human resolver decides.",
    notes:
      "Submitted message snapshots and evidence files are stored as immutable case records. Do not say AI decides or resolves disputes.",
  },
  solana: {
    narration:
      "We use blockchain where it adds value. Solana gives us fast settlement and low transaction costs, which suits frequent streaming and hourly payments, and funding and settlement actions are verifiable. Profiles, jobs, messages and support stay familiar web experiences.",
    caption: "Fast, low-cost, verifiable funding and settlement.",
    notes: "Be clear that not everything is on-chain: marketplace data, messaging and support are regular web services.",
  },
  business: {
    narration:
      "The business model is simple. Free has a three percent platform fee at the current launch rate. Pro is twenty-five dollars a month for one percent, and Premium is sixty dollars a month for zero percent. Each participant's fee follows their own plan, and one subscription applies to both hiring and working when using the subscribed wallet.",
    caption: "Each participant's own plan sets their PREMIFLOW platform fee.",
    notes:
      "Devnet prices are paid in Demo USDT. Annual: Pro 250, Premium 600 (pay for 10 months, get 12). The plan is per wallet; do not say it covers every linked wallet.",
  },
  current: {
    narration:
      "This is more than a prototype. Running on Solana Devnet today: the marketplace, all four contract types, paid trials where supported, notifications, a Help Desk, a Resolution Desk with statements, evidence and AI summaries, the three-plan fee model, and a safe cancel and revise flow for offers.",
    caption: "Running on Solana Devnet today.",
    notes: "No user numbers, revenue or traction claims. Everything listed exists in the current build.",
  },
  closing: {
    narration:
      "PREMIFLOW brings marketplace discovery, flexible work agreements and protected Solana payments into one workflow. Whether you want to find work or hire talent, we'd love for you to try it. Thank you.",
    caption: "Find work. Hire talent. Protected on Solana.",
    notes: "Optional: end on a short product-demo clip, then hold on the brand frame.",
  },
};
