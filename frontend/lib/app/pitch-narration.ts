/**
 * Speaker script for the /demo/pitch deck. Slide timing is derived from the
 * word count (150 words per minute plus a fixed hold, see pitch-deck.ts), so
 * adjust the hold there rather than rewording these lines.
 * - narration: spoken line (prerecorded track or the browser preview voice).
 * - caption: short on-screen caption (one line), not the full script.
 * - notes: presenter-only notes, shown in /demo/pitch/studio only.
 * Facts only: no traction, revenue or user numbers; no competitor names.
 */
export type PitchSlideId =
  | "title"
  | "problem"
  | "solution"
  | "how"
  | "models"
  | "protection"
  | "solana"
  | "business"
  | "product"
  | "closing";

export type PitchScript = { narration: string; caption: string; notes: string };

export const PITCH_NARRATION: Record<PitchSlideId, PitchScript> = {
  title: {
    narration:
      "PREMIFLOW is a Solana-powered freelance marketplace that brings discovery, flexible agreements and protected payments into one connected workflow.",
    caption: "One connected, protected freelance workflow.",
    notes: "Calm, confident opener. Let the title breathe before the first line.",
  },
  problem: {
    narration:
      "Freelancers and employers often work with people they have never met. Hiring, agreements, communication, payments and disputes can be spread across different systems. Freelancers want confidence they will be paid, while employers want confidence that agreed work will be delivered.",
    caption: "Trust is spread across too many tools.",
    notes: "Keep it neutral. No competitor names and no claims about what other platforms lack.",
  },
  solution: {
    narration:
      "PREMIFLOW connects those steps. Employers and freelancers discover each other in a marketplace, agree clear terms, fund protected contracts and manage work through completion.",
    caption: "Discovery to payment in one flow.",
    notes: "The screens are the real PREMIFLOW components rendered with sample data.",
  },
  how: {
    narration:
      "The workflow starts with marketplace discovery and proposals. The employer creates and funds the offer, the freelancer accepts, work is submitted and reviewed, and approved earnings become available for withdrawal.",
    caption: "Six steps from discovery to earnings.",
    notes: "Each step appears with its product screen. Funding happens before the freelancer accepts.",
  },
  models: {
    narration:
      "PREMIFLOW supports four contract models. Fixed works for clearly scoped jobs. Milestones divide larger work into stages. Streaming supports ongoing engagements where earnings accrue over time. Hourly contracts follow approved working time.",
    caption: "Fixed, Milestone, Streaming and Hourly.",
    notes: "All four contract types are implemented on Devnet today.",
  },
  protection: {
    narration:
      "Funded terms cannot simply be edited behind either party\u2019s back. Before acceptance, changes use a safe cancel-and-revise flow. If a dispute occurs, both sides can provide statements and evidence. AI organizes the case, but a human resolver makes the final decision.",
    caption: "AI assists. A human resolver decides.",
    notes:
      "The AI produces a neutral case summary only: no winner, award or recommendation. Do not say AI decides or resolves disputes.",
  },
  solana: {
    narration:
      "Solana gives PREMIFLOW a fast, low-cost settlement layer for programmable agreements and transparent contract state, while the marketplace experience remains familiar to normal users.",
    caption: "A fast, low-cost settlement layer.",
    notes: "Keep it simple. Do not claim Solana solves every freelance problem.",
  },
  business: {
    narration:
      "PREMIFLOW uses a subscription-plus-transaction model. Free users currently pay a three percent platform fee, Pro reduces that to one percent, and Premium removes the platform fee for new contracts. Each participant\u2019s own plan controls their own fee.",
    caption: "Each participant\u2019s own plan sets their own fee.",
    notes:
      "Current Devnet pricing, paid in Demo USDT (a Devnet test asset). The plan belongs to the wallet that paid for it; other linked wallets do not share it.",
  },
  product: {
    narration:
      "PREMIFLOW is already a functioning Devnet product. Marketplace discovery, four contract models, protected funding, work approval, safe revisions, dispute handling, notifications, pricing and subscriptions are implemented.",
    caption: "Running on Solana Devnet today.",
    notes: "No user numbers, revenue or traction claims. Everything listed exists in the current build.",
  },
  closing: {
    narration:
      "PREMIFLOW is building a more flexible and protected way for freelancers and employers to work together. PREMIFLOW. Freelance work. Protected on Solana.",
    caption: "Freelance work. Protected on Solana.",
    notes: "Hold on the brand frame for a beat after the last line.",
  },
};
