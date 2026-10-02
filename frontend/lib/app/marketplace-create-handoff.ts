/**
 * Browser-side helper that stores a server-built marketplace handoff for the
 * Create flow. It never overwrites an in-progress create intent and never sends
 * anything; Create applies the terms only on the user's explicit choice.
 */
import { savePendingHandoff } from "@/lib/app/marketplace-handoff-store";
import { loadCreateIntent, type IntentScope } from "@/lib/app/milestone-create-plan";
import { ACTIVE_CLUSTER_ID } from "@/lib/cluster";
import { deriveContractPda } from "@/lib/streampay-v2";
import { STREAMPAY_PROGRAM_ID } from "@/lib/streampay-v2/constants";
import type { CreateHandoff } from "@/lib/server/marketplace/service";
import { PublicKey } from "@solana/web3.js";

export const CREATE_SCOPE: IntentScope = {
  cluster: ACTIVE_CLUSTER_ID,
  programId: STREAMPAY_PROGRAM_ID.toBase58(),
};

export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createIntentExists(employer: string): boolean {
  const result = loadCreateIntent(browserStorage(), CREATE_SCOPE, employer, (e, f, id) =>
    deriveContractPda(new PublicKey(e), new PublicKey(f), id, STREAMPAY_PROGRAM_ID).address.toBase58()
  );
  return result.kind !== "none";
}

export type StashResult = "saved" | "intent_exists" | "storage_failed";

export function stashCreateHandoff(employer: string, handoff: CreateHandoff): StashResult {
  if (createIntentExists(employer)) return "intent_exists";
  const written = savePendingHandoff(browserStorage(), CREATE_SCOPE, employer, handoff, Date.now());
  return written ? "saved" : "storage_failed";
}
