import type { PublicKey } from "@solana/web3.js";

import type { ContractView } from "@/lib/streampay-v2";

export type AccountContractRole =
  | "employer"
  | "freelancer"
  | "both"
  | "resolver"
  | "none";

/**
 * True when a contract party belongs to any verified wallet linked
 * to the signed-in PREMIFLOW account.
 */
export function walletSetIncludesParty(
  wallets: readonly PublicKey[],
  party: PublicKey
): boolean {
  return wallets.some((wallet) => wallet.equals(party));
}

/**
 * Read-only account-facing role across all verified linked wallets.
 *
 * This does not grant transaction authority. Signed actions must still
 * use the actually connected wallet.
 */
export function accountRoleForContract(
  wallets: readonly PublicKey[],
  contract: Pick<ContractView, "employer" | "freelancer" | "resolver">
): AccountContractRole {
  const employer = walletSetIncludesParty(wallets, contract.employer);
  const freelancer = walletSetIncludesParty(wallets, contract.freelancer);

  if (employer && freelancer) return "both";
  if (freelancer) return "freelancer";
  if (employer) return "employer";
  if (walletSetIncludesParty(wallets, contract.resolver)) return "resolver";

  return "none";
}


export function accountRoleLabel(role: AccountContractRole): string {
  switch (role) {
    case "employer":
      return "Hiring";
    case "freelancer":
      return "Working";
    case "both":
      return "Hiring & Working";
    case "resolver":
      return "Resolver";
    case "none":
      return "Observer";
  }
}
