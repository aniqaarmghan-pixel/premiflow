/**
 * Homepage "Why PREMIFLOW" copy and verified-reputation wording. Plain data so
 * tests can check it: no superlative claims, stats, users or testimonials.
 */

export type WhyPremiflowMode = {
  key: "fixed" | "milestone" | "streaming" | "hourly";
  title: string;
  summary: string;
  fit: string;
  featured?: boolean;
  points?: readonly string[];
};

export const WHY_PREMIFLOW = {
  eyebrow: "Why PREMIFLOW",
  title: "One freelance marketplace. Four ways to get paid on Solana.",
  subtitle:
    "Pick the payment model that fits the work. Funds sit in an on-chain contract and are released by the rules both sides agreed to.",
  modes: [
    { key: "fixed", title: "Fixed", summary: "One price for a defined job.", fit: "One-off deliverables" },
    { key: "milestone", title: "Milestone", summary: "Pay as agreed stages are completed.", fit: "Projects with clear stages" },
    {
      key: "streaming",
      title: "Streaming",
      summary:
        "Payment accrues as contract time passes, so ongoing work is paid continuously instead of in lump sums at the end.",
      fit: "Retainers, ongoing support and scheduled consulting",
      featured: true,
      points: [
        "Earned value grows on the agreed schedule",
        "Accrued and remaining amounts are visible on the contract",
        "No chasing invoices for recurring work",
      ],
    },
    { key: "hourly", title: "Hourly", summary: "Track approved work time and pay by the hour.", fit: "Flexible work where hours vary" },
  ] satisfies readonly WhyPremiflowMode[],
  trials: {
    title: "Paid trials + revisions",
    body: "Start with a paid trial that is smaller than the full contract, and keep revision requests inside the agreed terms.",
  },
  lifecycle: {
    title: "Protected contract lifecycle",
    body: "Every contract follows the same protected path, with disputes handled by a resolver instead of off-platform.",
    steps: ["Offer and accept", "Funds held on-chain", "Deliver and review", "Release or resolve"],
  },
} as const;

export const VERIFIED_REPUTATION_COPY = {
  title: "Verified reputation",
  line: "Verified through completed PREMIFLOW contracts.",
  empty: "No verified reviews yet. Reviews appear only after a completed PREMIFLOW contract.",
} as const;

/** Compact card label from the existing trust summary; null hides the badge. */
export function verifiedBadgeLabel(summary: { reviewCount: number; averageScore: number | null } | null | undefined): string | null {
  if (!summary || summary.reviewCount <= 0 || summary.averageScore === null) return null;
  const noun = summary.reviewCount === 1 ? "verified review" : "verified reviews";
  return `${summary.averageScore.toFixed(1)}/5 - ${summary.reviewCount} ${noun}`;
}
