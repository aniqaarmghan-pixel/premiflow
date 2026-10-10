/**
 * Speaker script for the /demo/pitch deck. Slide slots are set per slide in
 * pitch-deck.ts (never shorter than the spoken line at 150 words per minute
 * plus a short transition hold).
 * - narration: spoken line (prerecorded track or the browser preview voice).
 * - caption: short on-screen caption (one line), not the full script.
 * - notes: presenter-only notes, shown in /demo/pitch/studio only.
 * Market figures and sources are quoted exactly as supplied; the SOM is a
 * PREMIFLOW internal target assumption and the $500K is a proposed target.
 */
export type PitchSlideId =
  | "title"
  | "problem"
  | "solution"
  | "advantage"
  | "proof"
  | "market"
  | "team"
  | "gtm"
  | "funding"
  | "closing";

export type PitchScript = { narration: string; caption: string; notes: string };

export const PITCH_NARRATION: Record<PitchSlideId, PitchScript> = {
  title: {
    narration:
      "PREMIFLOW is building a more flexible and protected way for freelancers and employers to work together, combining marketplace discovery, clear agreements and Solana-powered settlement in one workflow.",
    caption: "Discovery, agreements and settlement in one workflow.",
    notes: "Calm, confident opener. Let the title breathe before the first line.",
  },
  problem: {
    narration:
      "Freelance work increasingly connects people across borders who may never have worked together before. But hiring, agreements, payments and disputes can remain fragmented. Freelancers want payment confidence, employers want delivery confidence, and different projects need different ways to pay.",
    caption: "Trust is still spread across separate tools.",
    notes: "Keep it neutral. No competitor names and no claims about what other platforms lack.",
  },
  solution: {
    narration:
      "PREMIFLOW connects the freelance lifecycle. Users discover opportunities, send proposals, create and fund protected agreements, manage work, approve progress and settle earnings through one connected experience.",
    caption: "One connected freelance lifecycle.",
    notes: "The two screens are the real PREMIFLOW components rendered with sample data (or real screenshots once added).",
  },
  advantage: {
    narration:
      "PREMIFLOW is not designed as only a marketplace or only an escrow tool. Its advantage is bringing discovery, protected funding, work management, four different payment models, safe contract revisions and dispute handling into one connected product.",
    caption: "Marketplace + flexible contracts + protected settlement.",
    notes:
      "Columns are generalized categories, not specific products. 'Varies' means support differs by provider; never say other platforms lack a feature.",
  },
  proof: {
    narration:
      "This is already a working Devnet product. PREMIFLOW includes marketplace discovery, protected offer creation, Fixed, Milestone, Streaming and Hourly contracts, work review, payments, revisions, notifications and a Resolution Desk.",
    caption: "Running on Solana Devnet today.",
    notes: "Only real screenshots appear here. Empty slots show the file to capture into public/media/pitch/.",
  },
  market: {
    narration:
      "The opportunity is substantial. The global freelance-platform market was estimated at about 8.35 billion dollars in 2025 and is projected to exceed 20 billion by 2030. Asia-Pacific, the Middle East and Africa represent roughly a 3.05 billion dollar initial serviceable market. Capturing just half of one percent would represent an approximately 15 million dollar annual opportunity for PREMIFLOW.",
    caption: "TAM $8.35B \u00b7 SAM ~$3.05B \u00b7 SOM ~$15M target.",
    notes:
      "Market data: The Business Research Company, 2026 report; World Bank, Working Without Borders. The SOM is a PREMIFLOW internal target assumption, not independent research.",
  },
  team: {
    narration:
      "PREMIFLOW is being developed by Armghan Ashraf and Miss Rabia Noor. The team is focused on product execution, Web3 infrastructure and building a freelance experience that remains understandable for everyday users.",
    caption: "Small team. Working product. Execution first.",
    notes: "Names only. No titles, degrees, prior companies or years of experience.",
  },
  gtm: {
    narration:
      "Our market-entry strategy starts with communities rather than expensive mass acquisition. We plan to use freelancer and Solana communities, ambassador programs, educational content and targeted partnerships to acquire early users, prove successful contracts and then scale through referrals and performance marketing.",
    caption: "Community first, then referrals and performance.",
    notes: "This is a plan, not results. No user or partner numbers.",
  },
  funding: {
    narration:
      "To move from a working Devnet product toward a real market launch, our proposed pre-seed requirement is approximately five hundred thousand dollars. The largest investment would go into engineering, security and audits, followed by customer acquisition, compliance, infrastructure and strategic partnerships.",
    caption: "Proposed $500K pre-seed target.",
    notes: "A proposed future funding target. Nothing has been raised; do not imply committed investors.",
  },
  closing: {
    narration:
      "Our ambition is bigger than building another freelance marketplace. We want protected, flexible agreements to become as natural as sending a proposal \u2014 wherever employer and freelancer happen to live. PREMIFLOW. From first proposal to final payment.",
    caption: "Protected, flexible freelance agreements.",
    notes: "Slow down for the ambition line, then hold on the brand frame.",
  },
};
