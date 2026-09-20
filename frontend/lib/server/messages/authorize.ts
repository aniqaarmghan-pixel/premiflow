import type { ContractParties } from "../solana/read-contract-parties";

export function isAuthorizedMessageWallet(
  wallet: string,
  parties: ContractParties
): boolean {
  return wallet === parties.employer || wallet === parties.freelancer;
}
