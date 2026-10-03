/**
 * Browser wiring for automatic marketplace contract linking. Uses only the
 * existing contract-links endpoint and the signed session cookie; it never
 * prompts the wallet, signs, or sends a transaction.
 */
import { CREATE_SCOPE, browserStorage } from "@/lib/app/marketplace-create-handoff";
import { linkMarketplaceContract } from "@/lib/app/marketplace-client";
import { confirmPendingLink, runPendingLinks, type RunPendingResult } from "@/lib/app/marketplace-link-store";
import type { IntentScope } from "@/lib/app/milestone-create-plan";

/** Retry any confirmed-but-unlinked contracts for this wallet (reload / revisit). */
export function resumeMarketplaceLinks(employer: string | null, scope: IntentScope = CREATE_SCOPE): Promise<RunPendingResult> {
  return runPendingLinks(browserStorage(), scope, employer, linkMarketplaceContract, Date.now());
}

/** Called from the Create wizard's verified on-chain success path only. */
export function linkConfirmedMarketplaceContract(
  employer: string,
  contractAddress: string,
  scope: IntentScope = CREATE_SCOPE
): Promise<RunPendingResult> {
  const marker = confirmPendingLink(browserStorage(), scope, employer, contractAddress, Date.now());
  if (!marker) return Promise.resolve({ linked: [], rejected: [], retry: [] });
  return resumeMarketplaceLinks(employer, scope);
}
