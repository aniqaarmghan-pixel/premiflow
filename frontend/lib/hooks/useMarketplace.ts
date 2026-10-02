"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";

import { ensureMessagingSession } from "@/lib/app/messaging-session";
import type { MarketplaceApiError } from "@/lib/app/marketplace-client";

/** Connected wallet plus an on-demand signed session (same flow as Messages). */
export function useMarketplaceSession() {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  async function ensure(): Promise<string> {
    if (!wallet) throw new Error("Connect your wallet to continue.");
    await ensureMessagingSession({ wallet, signMessage });
    return wallet;
  }
  return { wallet, ensure };
}

function toApiError(err: unknown): MarketplaceApiError {
  if (err && typeof err === "object" && "status" in err) return err as MarketplaceApiError;
  return { status: 0, code: "network", message: "Could not reach PREMIFLOW. Try again." };
}

export type MarketplaceQuery<T> =
  | { status: "idle" | "loading"; reload: () => void }
  | { status: "error"; error: MarketplaceApiError; reload: () => void }
  | { status: "ready"; data: T; reload: () => void };

/** Keyed loader; a null key stays idle. State is only set from async callbacks. */
export function useMarketplaceQuery<T>(
  key: string | null,
  loader: () => Promise<T>
): MarketplaceQuery<T> {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<
    { key: string; data?: T; error?: MarketplaceApiError } | null
  >(null);
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });
  const fullKey = key == null ? null : `${key}#${version}`;
  useEffect(() => {
    if (fullKey == null) return;
    let cancelled = false;
    loaderRef.current().then(
      (data) => {
        if (!cancelled) setResult({ key: fullKey, data });
      },
      (err: unknown) => {
        if (!cancelled) setResult({ key: fullKey, error: toApiError(err) });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [fullKey]);
  const reload = () => setVersion((v) => v + 1);
  if (fullKey == null) return { status: "idle", reload };
  if (!result || result.key !== fullKey) return { status: "loading", reload };
  if (result.error) return { status: "error", error: result.error, reload };
  return { status: "ready", data: result.data as T, reload };
}
