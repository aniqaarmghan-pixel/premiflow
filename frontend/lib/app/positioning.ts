/**
 * PREMIFLOW positioning copy (About and Pricing). Factual and neutral: no
 * superlatives, no guarantees, no named competitors, no throughput claims.
 * The comparison is against a generic traditional freelance workflow.
 */
export const WHY_PREMIFLOW = {
  eyebrow: "Why PREMIFLOW",
  heading: "One freelance marketplace. Four ways to get paid on Solana.",
  intro:
    "Hire or work through Fixed, Milestone, Streaming and Hourly contracts, with funding and settlement on Solana and the rest of the marketplace kept familiar.",
  points: [
    {
      title: "Fixed, Milestone, Streaming and Hourly",
      body: "Choose the payment model that fits the work, from a single deliverable to ongoing hourly sessions.",
    },
    { title: "Paid trials", body: "Start with a short paid trial before committing to the main engagement." },
    {
      title: "One account",
      body: "Hire, freelance, or both from one account. A plan applies to both roles when using the subscribed wallet.",
    },
    {
      title: "Transparent fees",
      body: "Each participant sees their own plan, rate and deduction before a contract is created.",
    },
    {
      title: "Protected funding and settlement",
      body: "Work is funded into contract escrow up front and settles through wallet-authorized actions.",
    },
    { title: "Structured dispute evidence", body: "Both sides submit evidence in a structured, reviewable format." },
    {
      title: "Neutral AI case summary",
      body: "AI organizes and summarizes a case for reviewers. It is informational and never decides the outcome.",
    },
    { title: "Human final resolution", body: "A human resolver makes the final decision on every dispute." },
  ],
  pricingLink: "See plans and platform fees",
} as const;

export const WHY_SOLANA = {
  heading: "Why Solana",
  points: [
    "Fast settlement for funding, releases and withdrawals.",
    "Low transaction costs, so small and frequent payments stay practical.",
    "Well suited to frequent Streaming and Hourly settlement.",
    "Financial actions are authorized by your wallet.",
    "Verifiable settlement history.",
    "Transparent contract state.",
  ],
} as const;

export const WHY_WEB3 = {
  heading: "Why Web3, where it helps",
  points: [
    "PREMIFLOW uses Web3 where it adds practical value: funding, payment protection, settlement and verifiable contract actions.",
    "Profiles, jobs, gigs, messaging, discovery and the Help Desk work like a familiar marketplace.",
    "Private messages, support tickets and dispute evidence stay off-chain.",
    "Not everything is decentralized, and PREMIFLOW does not claim it is.",
  ],
} as const;

export const APPROACH = {
  heading: "How PREMIFLOW approaches freelance work",
  intro: "A general side-by-side look at a traditional freelance workflow and how PREMIFLOW handles the same steps.",
  items: [
    "Marketplace discovery",
    "Fixed",
    "Milestone",
    "Streaming",
    "Hourly",
    "Paid trials",
    "Solana-backed settlement",
    "Structured dispute evidence",
    "Human resolution",
    "Neutral AI case summary",
    "One account for hiring and working",
    "Transparent plan-based fees",
  ],
  columns: { topic: "Area", traditional: "Traditional freelance workflow", premiflow: "PREMIFLOW" },
  rows: [
    {
      topic: "Discovery",
      traditional: "Profiles, job posts and proposals",
      premiflow: "Marketplace discovery across profiles, jobs and gigs",
    },
    {
      topic: "Payment models",
      traditional: "Commonly fixed-price or hourly",
      premiflow: "Fixed, Milestone, Streaming and Hourly",
    },
    { topic: "Trials", traditional: "Arranged case by case", premiflow: "Paid trials built into the contract" },
    {
      topic: "Funding and settlement",
      traditional: "Typically handled through internal platform balances",
      premiflow: "Solana-backed escrow and wallet-authorized settlement",
    },
    {
      topic: "Disputes",
      traditional: "Platform review processes",
      premiflow: "Structured evidence, a neutral AI case summary and human resolution",
    },
    {
      topic: "Accounts",
      traditional: "Client and freelancer roles are often set up separately",
      premiflow: "One account for hiring and working",
    },
    {
      topic: "Fees",
      traditional: "Vary by platform and plan",
      premiflow: "Transparent plan-based fees shown for both participants",
    },
  ],
  disclaimer: "Traditional workflows vary. This is a general comparison, not a statement about any specific platform.",
} as const;
