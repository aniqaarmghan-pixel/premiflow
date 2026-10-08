"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import {
  readAuthoritativeCreateFeeRates,
  type AuthoritativeCreateFeeRates,
} from "@/lib/app/create-fee-revalidation";
import { getStreamPayV2ReadOnlyProgram } from "@/lib/streampay-v2";

export type CreateFeeRates =
  | { status: "loading" | "unavailable" }
  | ({ status: "ready" } & AuthoritativeCreateFeeRates);

export type CreateFeeRatesState = CreateFeeRates & {
  /** Show freshly re-read authoritative rates (pre-sign revalidation). */
  replace: (rates: AuthoritativeCreateFeeRates) => void;
};

function parseKey(value: string | null | undefined): PublicKey | null {
  if (!value) return null;
  try {
    return new PublicKey(value.trim());
  } catch {
    return null;
  }
}

/**
 * Rates the program would freeze if the contract were created now: read from
 * the same on-chain sources `create_contract` uses (FeeConfig `fee_bps` and
 * both wallets' plan PDAs). Never a hardcoded guess: when the chain cannot be
 * read, status is "unavailable" and no rate is shown.
 */
export function useCreateFeeRates(
  employer: string | null | undefined,
  freelancer: string | null | undefined
): CreateFeeRatesState {
  const { connection } = useConnection();
  const [rates, setRates] = useState<CreateFeeRates>({ status: "loading" });
  const employerKey = parseKey(employer)?.toBase58() ?? null;
  const freelancerKey = parseKey(freelancer)?.toBase58() ?? null;

  useEffect(() => {
    let cancelled = false;
    setRates({ status: "loading" });
    readAuthoritativeCreateFeeRates(
      getStreamPayV2ReadOnlyProgram(connection),
      employerKey ? new PublicKey(employerKey) : null,
      freelancerKey ? new PublicKey(freelancerKey) : null,
      Math.floor(Date.now() / 1000)
    )
      .then((fresh) => {
        if (!cancelled) setRates({ status: "ready", ...fresh });
      })
      .catch(() => {
        if (!cancelled) setRates({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [connection, employerKey, freelancerKey]);

  const replace = useCallback((fresh: AuthoritativeCreateFeeRates) => {
    setRates({ status: "ready", ...fresh });
  }, []);

  return { ...rates, replace };
}
