/**
 * Pre-sign fee revalidation for every new contract (Fixed, Milestone,
 * Streaming, Hourly). Immediately before the create transaction is signed we
 * re-read the same on-chain sources the program uses (FeeConfig, employer plan,
 * freelancer plan) and compare the rates with what the Review screen showed.
 * Any difference blocks signing until the user reviews the refreshed fees.
 * The program stays authoritative: no fee bps are ever sent to it.
 */
import type { PublicKey } from "@solana/web3.js";

import { createContractFeeRates, type PlanTier } from "@/lib/streampay-v2/fees";
import { deriveFeeConfigPda } from "@/lib/streampay-v2/pda";
import type { StreamPayV2Program } from "@/lib/streampay-v2/program";
import { effectivePlanTier, fetchSubscriptionIfExists } from "@/lib/streampay-v2/subscription";

export const FEE_CHANGED_MESSAGE =
  "Your plan or platform fee changed. Please review the updated fees before signing.";
export const FEE_RECHECK_UNAVAILABLE_MESSAGE =
  "Current fee rates could not be confirmed on-chain, so nothing was sent. Please try again.";
export const FEE_RECONFIRM_LABEL = "I have reviewed the updated fees";

export type AuthoritativeCreateFeeRates = {
  baseFeeBps: number;
  employerTier: PlanTier;
  freelancerTier: PlanTier;
  employerFeeBps: number;
  freelancerFeeBps: number;
};

export type ShownFeeRates = Pick<AuthoritativeCreateFeeRates, "employerFeeBps" | "freelancerFeeBps">;

/** Same reads as `create_contract`: FeeConfig fee_bps (0 if absent) + both plan PDAs. */
export async function readAuthoritativeCreateFeeRates(
  program: StreamPayV2Program,
  employer: PublicKey | null,
  freelancer: PublicKey | null,
  nowSeconds: number
): Promise<AuthoritativeCreateFeeRates> {
  const tierOf = async (key: PublicKey | null): Promise<PlanTier> =>
    key ? effectivePlanTier(await fetchSubscriptionIfExists(program, key), nowSeconds) : "Free";
  const [cfg, employerTier, freelancerTier] = await Promise.all([
    program.account.feeConfig.fetchNullable(deriveFeeConfigPda(program.programId).address),
    tierOf(employer),
    tierOf(freelancer),
  ]);
  const baseFeeBps = cfg ? Number(cfg.feeBps) : 0;
  return {
    baseFeeBps,
    employerTier,
    freelancerTier,
    ...createContractFeeRates({ baseFeeBps, employerTier, freelancerTier }),
  };
}

export function feeRatesDiffer(shown: ShownFeeRates, fresh: ShownFeeRates): boolean {
  return shown.employerFeeBps !== fresh.employerFeeBps || shown.freelancerFeeBps !== fresh.freelancerFeeBps;
}

export type PreSignFeeCheck =
  | { ok: true; rates: AuthoritativeCreateFeeRates }
  | { ok: false; reason: "changed"; rates: AuthoritativeCreateFeeRates }
  | { ok: false; reason: "unavailable" };

/**
 * `shown` = rates displayed on Review (null if none were shown). Signing may
 * proceed only when fresh authoritative rates were read and match exactly.
 */
export async function revalidateCreateFees(
  shown: ShownFeeRates | null,
  read: () => Promise<AuthoritativeCreateFeeRates>
): Promise<PreSignFeeCheck> {
  let fresh: AuthoritativeCreateFeeRates;
  try {
    fresh = await read();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!shown || feeRatesDiffer(shown, fresh)) return { ok: false, reason: "changed", rates: fresh };
  return { ok: true, rates: fresh };
}
