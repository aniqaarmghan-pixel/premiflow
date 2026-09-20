import type { ContractCaseFacts } from "../solana/read-contract-case-facts";
import type { PartyStatementRole } from "../stores";

export type CasePartyAccess = {
  role: PartyStatementRole;
};

export function isAuthorizedCasePartyWallet(
  wallet: string,
  facts: Pick<ContractCaseFacts, "employer" | "freelancer">
): boolean {
  return wallet === facts.employer || wallet === facts.freelancer;
}

export function isAuthorizedCaseResolverWallet(
  wallet: string,
  facts: Pick<ContractCaseFacts, "resolver">
): boolean {
  return wallet === facts.resolver;
}

/**
 * Party role is derived from the authenticated session wallet and the
 * on-chain Contract account. Browser-supplied wallet/role/resolver values
 * are never used.
 */
export function casePartyRoleFromChain(
  wallet: string,
  facts: Pick<ContractCaseFacts, "employer" | "freelancer" | "resolver">
): PartyStatementRole | "resolver" | null {
  if (wallet === facts.employer) return "employer";
  if (wallet === facts.freelancer) return "freelancer";
  if (wallet === facts.resolver) return "resolver";
  return null;
}

export function requirePartyRole(
  wallet: string,
  facts: Pick<ContractCaseFacts, "employer" | "freelancer">
): PartyStatementRole {
  if (wallet === facts.employer) return "employer";
  if (wallet === facts.freelancer) return "freelancer";
  throw Object.assign(new Error("Not a party on this contract."), {
    name: "CaseAccessError",
    code: "forbidden",
  });
}
