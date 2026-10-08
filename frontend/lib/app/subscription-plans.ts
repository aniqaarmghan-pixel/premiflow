/**
 * PREMIFLOW plans. One subscription applies to both hiring and working when
 * using the subscribed wallet (entitlement is per wallet, on-chain): there is no
 * separate employer plan or freelancer plan. Prices mirror the on-chain
 * constants (programs/streampay/src/v2/constants.rs); the program prices and
 * records every purchase, so this file is display only.
 */
import { FREE_FEE_BPS, PREMIUM_FEE_BPS, PRO_FEE_BPS, type PlanTier } from "@/lib/streampay-v2/fees";

export type BillingTerm = "Monthly" | "Annual";

export type PlanCard = {
  tier: PlanTier;
  name: string;
  /** Headline price in USD terms; on Devnet the same number is paid in Demo USDT. */
  monthlyUsd: number;
  annualUsd: number;
  feeBps: number;
  feeLabel: string;
  audience: string;
  purchasable: boolean;
};

export const SUBSCRIPTION_PLANS: readonly PlanCard[] = [
  {
    tier: "Free",
    name: "Free",
    monthlyUsd: 0,
    annualUsd: 0,
    feeBps: FREE_FEE_BPS,
    feeLabel: "3% platform fee (current launch rate)",
    audience: "For occasional users",
    purchasable: false,
  },
  {
    tier: "Pro",
    name: "Pro",
    monthlyUsd: 25,
    annualUsd: 250,
    feeBps: PRO_FEE_BPS,
    feeLabel: "1% platform fee",
    audience: "For active professionals",
    purchasable: true,
  },
  {
    tier: "Premium",
    name: "Premium",
    monthlyUsd: 60,
    annualUsd: 600,
    feeBps: PREMIUM_FEE_BPS,
    feeLabel: "0% PREMIFLOW platform fee",
    audience: "For high-volume professionals",
    purchasable: true,
  },
];

export function planPriceLabel(plan: PlanCard, term: BillingTerm): string {
  if (plan.monthlyUsd === 0) return "$0/month";
  return term === "Monthly" ? `$${plan.monthlyUsd}/month` : `$${plan.annualUsd}/year`;
}

export function planDemoUsdtLabel(plan: PlanCard, term: BillingTerm): string {
  const amount = term === "Monthly" ? plan.monthlyUsd : plan.annualUsd;
  return `Paid on Devnet as ${amount} Demo USDT per ${term === "Monthly" ? "month" : "year"}`;
}

export const PRICING_COPY = {
  eyebrow: "Pricing",
  heading: "Plans for hiring and working",
  intro:
    "One subscription applies to both hiring and working when using the subscribed wallet. There is no separate employer plan or freelancer plan.",
  monthly: "Monthly",
  annual: "Annual",
  annualNote: "Pay for 10 months. Get 12.",
  currentPlan: (tier: PlanTier) => `Plan for the connected wallet: ${tier}`,
  perSide: (percent: string) => `${percent} PREMIFLOW platform fee on your side of each new contract`,
  subscribe: (name: string) => `Subscribe to ${name}`,
  renew: (name: string) => `Renew ${name}`,
  connect: "Connect wallet to subscribe",
  processing: "Confirm in your wallet\u2026",
  freeCta: "Included with every account",
  tierChangeNote: "Your current paid plan needs to expire before you switch to a different tier.",
  purchased: (name: string, term: BillingTerm) => `${name} ${term.toLowerCase()} plan payment confirmed on-chain.`,
  failed: "Subscription payment did not complete.",
  aboutLink: "Why PREMIFLOW",
  notes: [
    "Each participant's own plan sets their own PREMIFLOW platform fee. Employers pay their fee on top of the contract amount; a freelancer's fee is deducted from principal they actually withdraw.",
    "Rates are frozen when a contract is created. A later plan change or expiry never changes an existing contract.",
    "Solana network fees are separate from PREMIFLOW platform fees and are paid to the network.",
    "No monthly volume cap on any plan.",
    "Monthly plans run 30 days and annual plans run 365 days. Renewing adds a full term to your current expiry.",
    "Your plan is recorded on-chain against the wallet that pays for it, after a wallet-signed payment to the PREMIFLOW treasury. Contracts use the plan of the wallet each participant signs with; other wallets linked to your PREMIFLOW account do not share it.",
    "Free uses the current on-chain platform rate, 3% at launch. It may change for new contracts; existing contracts keep the rate frozen at creation. Pro is 1% and Premium is 0%.",
    "On Devnet, plans are paid in Demo USDT (Devnet test asset). Not official USDT: a Devnet test token with no real value.",
  ],
} as const;
