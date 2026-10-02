import { isRealSignature } from "@/lib/app/resolve-signature-store";

import { randomId } from "../crypto";
import type { CaseStore } from "../stores";
import type { ContractFactsReader } from "../solana/read-contract-case-facts";
import { casePartyRoleFromChain } from "./authorize";
import {
  CASE_EVENT_TYPES,
  CASE_SIGNATURE_MAX,
  CaseAccessError,
  CaseStateError,
  CaseValidationError,
  parseContractAddress,
} from "./service";

export type ResolveTxVerdict = "ok" | "not_found" | "failed" | "mismatch";

/** Confirms on-chain that a signature is a successful tx signed by the resolver touching the contract. */
export type ResolveTxVerifier = (
  signature: string,
  expect: { contract: string; resolver: string }
) => Promise<ResolveTxVerdict>;

const VERDICT_MESSAGES: Record<Exclude<ResolveTxVerdict, "ok">, string> = {
  not_found: "The settlement transaction is not confirmed yet. Try again shortly.",
  failed: "The settlement transaction failed on-chain and cannot be recorded.",
  mismatch:
    "The transaction was not signed by the designated resolver for this contract.",
};

export type RecordResolveSignatureResult = {
  resolveSignature: string;
  recorded: boolean;
};

/**
 * Write-once: stores the confirmed resolve_dispute signature on the existing
 * Resolution Case. Only the on-chain resolver may record it, only once the
 * contract is Resolved on-chain, and only after RPC verification.
 */
export async function recordCaseResolveSignature(
  store: CaseStore,
  reader: ContractFactsReader,
  verify: ResolveTxVerifier,
  input: { contractAddress: string; sessionWallet: string; signature: unknown },
  now = new Date()
): Promise<RecordResolveSignatureResult> {
  const contractAddress = parseContractAddress(input.contractAddress);
  const signature = input.signature;
  if (!isRealSignature(signature) || signature.length > CASE_SIGNATURE_MAX) {
    throw new CaseValidationError("Transaction signature is not valid.");
  }
  const facts = await reader.read(contractAddress);
  if (casePartyRoleFromChain(input.sessionWallet, facts) !== "resolver") {
    throw new CaseAccessError(
      "Only the designated resolver can record the settlement transaction."
    );
  }
  if (facts.status !== "Resolved") {
    throw new CaseStateError("not_resolved", "The contract is not Resolved on-chain.");
  }
  const existing = await store.getCaseByContract(contractAddress);
  if (!existing) {
    throw new CaseStateError("case_not_found", "Resolution Case was not found.");
  }
  if (existing.resolveSignature) {
    if (existing.resolveSignature === signature) {
      return { resolveSignature: signature, recorded: false };
    }
    throw new CaseStateError(
      "signature_already_recorded",
      "A settlement transaction is already recorded for this case."
    );
  }
  const verdict = await verify(signature, { contract: contractAddress, resolver: facts.resolver });
  if (verdict !== "ok") {
    throw new CaseStateError(`signature_${verdict}`, VERDICT_MESSAGES[verdict]);
  }
  await store.updateCase(existing.id, { resolveSignature: signature, updatedAt: now });
  await store.insertEvent({
    id: randomId(),
    caseId: existing.id,
    eventType: CASE_EVENT_TYPES.settlementConfirmed,
    actorWallet: input.sessionWallet,
    payload: JSON.stringify({ signature }),
    createdAt: now,
  });
  return { resolveSignature: signature, recorded: true };
}
