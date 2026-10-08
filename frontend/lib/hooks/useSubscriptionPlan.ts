"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { getStreamPayV2ReadOnlyProgram } from "@/lib/streampay-v2";
import { DEFAULT_PLATFORM_FEE_BPS, planFeeBps, type PlanTier } from "@/lib/streampay-v2/fees";
import {
  effectivePlanTier,
  fetchSubscriptionIfExists,
  type SubscriptionView,
} from "@/lib/streampay-v2/subscription";

export type SubscriptionPlanState = {
  tier: PlanTier;
  /** Display estimate; the program determines the real rate at contract creation. */
  feeBps: number;
  subscription: SubscriptionView | null;
  loading: boolean;
  refresh: () => void;
};

function ownerKey(owner: string | null | undefined): string | null {
  if (!owner) return null;
  try {
    return new PublicKey(owner.trim()).toBase58();
  } catch {
    return null;
  }
}

/** Read-only view of a wallet's on-chain plan (Free when absent or expired). */
export function useSubscriptionPlan(owner: string | null | undefined): SubscriptionPlanState {
  const { connection } = useConnection();
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const key = ownerKey(owner);

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setSubscription(null);
      return;
    }
    setLoading(true);
    fetchSubscriptionIfExists(getStreamPayV2ReadOnlyProgram(connection), new PublicKey(key))
      .then((view) => {
        if (!cancelled) setSubscription(view);
      })
      .catch(() => {
        if (!cancelled) setSubscription(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, key, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const tier = effectivePlanTier(subscription, Math.floor(Date.now() / 1000));
  return { tier, feeBps: planFeeBps(tier, DEFAULT_PLATFORM_FEE_BPS), subscription, loading, refresh };
}
