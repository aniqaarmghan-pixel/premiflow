import type { PublicKey } from "@solana/web3.js";

import type { PlanTier } from "./fees";
import { deriveSubscriptionPda } from "./pda";
import type { StreamPayV2Program } from "./program";

export type SubscriptionTerm = "Monthly" | "Annual";

export type SubscriptionView = {
  address: PublicKey;
  owner: PublicKey;
  tier: PlanTier;
  lastTerm: SubscriptionTerm;
  startedAt: number;
  expiresAt: number;
  totalPaid: bigint;
};

function enumName(value: unknown): string {
  if (typeof value === "string") return value.charAt(0).toUpperCase() + value.slice(1);
  if (value && typeof value === "object") {
    const key = Object.keys(value as Record<string, unknown>)[0] ?? "";
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
  return "";
}

export function decodePlanTier(value: unknown): PlanTier {
  const name = enumName(value);
  return name === "Pro" || name === "Premium" ? name : "Free";
}

export function decodeSubscriptionTerm(value: unknown): SubscriptionTerm {
  return enumName(value) === "Annual" ? "Annual" : "Monthly";
}

/** Mirrors Rust `Subscription::effective_tier`: paid tier only while `now < expires_at`. */
export function effectivePlanTier(
  view: Pick<SubscriptionView, "tier" | "expiresAt"> | null | undefined,
  nowSeconds: number
): PlanTier {
  if (!view || view.tier === "Free") return "Free";
  return nowSeconds < view.expiresAt ? view.tier : "Free";
}

export function encodePlanTier(tier: "Pro" | "Premium"): { pro: Record<string, never> } | { premium: Record<string, never> } {
  return tier === "Pro" ? { pro: {} } : { premium: {} };
}

export function encodeSubscriptionTerm(term: SubscriptionTerm): { monthly: Record<string, never> } | { annual: Record<string, never> } {
  return term === "Monthly" ? { monthly: {} } : { annual: {} };
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof (value as { toString(): string }).toString === "function") return Number((value as { toString(): string }).toString());
  return 0;
}

/** Read-only fetch of a wallet's plan account; null when the wallet never subscribed. */
export async function fetchSubscriptionIfExists(
  program: StreamPayV2Program,
  owner: PublicKey
): Promise<SubscriptionView | null> {
  const address = deriveSubscriptionPda(owner, program.programId).address;
  const raw = (await program.account.subscription.fetchNullable(address)) as Record<string, unknown> | null;
  if (!raw) return null;
  return {
    address,
    owner: raw.owner as PublicKey,
    tier: decodePlanTier(raw.tier),
    lastTerm: decodeSubscriptionTerm(raw.lastTerm),
    startedAt: num(raw.startedAt),
    expiresAt: num(raw.expiresAt),
    totalPaid: BigInt(String(raw.totalPaid ?? 0)),
  };
}
