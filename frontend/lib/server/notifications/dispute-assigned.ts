import {
  DISPUTE_ASSIGNED_NOTIFICATION,
  disputeAssignedUniqueKey,
} from "@/lib/app/dispute-assigned-client";
import type { ContractStatus } from "@/lib/streampay-v2/types";

import type { NotificationStore } from "../stores";
import { createNotification } from "./service";

/**
 * Resolver inbox notification when a contract naming them as resolver is
 * Disputed on-chain. Uses the existing `dispute_opened` kind (no schema
 * change) with a deterministic unique key per contract + disputed_at +
 * resolver, so it is created once and later calls never reset read state.
 */
export type DisputeAssignedFacts = {
  employer: string;
  freelancer: string;
  resolver: string;
  status: ContractStatus;
  disputedAt: number;
};

export class DisputeAssignedError extends Error {
  constructor(
    readonly code: "forbidden" | "state_mismatch",
    message: string
  ) {
    super(message);
    this.name = "DisputeAssignedError";
  }
}

const DEFAULT_PUBKEY = "11111111111111111111111111111111";

export function disputeAssignedHref(contractAddress: string): string {
  return `/contracts/${contractAddress}#resolution`;
}

export async function notifyDisputeAssigned(
  store: NotificationStore,
  input: {
    contractAddress: string;
    callerWallet: string;
    facts: DisputeAssignedFacts;
  },
  now = new Date()
): Promise<{ created: boolean; skipped?: "no_resolver" | "party_resolver" }> {
  const { facts } = input;
  const allowed = [facts.employer, facts.freelancer, facts.resolver];
  if (!allowed.includes(input.callerWallet)) {
    throw new DisputeAssignedError(
      "forbidden",
      "Only a contract party or the designated resolver can sync this notification."
    );
  }
  if (facts.status !== "Disputed" || !(facts.disputedAt > 0)) {
    throw new DisputeAssignedError(
      "state_mismatch",
      "The contract is not Disputed on-chain yet."
    );
  }
  if (!facts.resolver || facts.resolver === DEFAULT_PUBKEY) {
    return { created: false, skipped: "no_resolver" };
  }
  if (facts.resolver === facts.employer || facts.resolver === facts.freelancer) {
    return { created: false, skipped: "party_resolver" };
  }
  const result = await createNotification(
    store,
    {
      recipientWallet: facts.resolver,
      type: "dispute_opened",
      uniqueKey: disputeAssignedUniqueKey(input.contractAddress, facts.disputedAt, facts.resolver),
      title: DISPUTE_ASSIGNED_NOTIFICATION.title,
      body: DISPUTE_ASSIGNED_NOTIFICATION.body,
      contractAddress: input.contractAddress,
      href: disputeAssignedHref(input.contractAddress),
      payload: { status: facts.status, disputedAt: facts.disputedAt, role: "resolver" },
    },
    now
  );
  return { created: result.created };
}
