import type { ContractStatus } from "@/lib/streampay-v2/types";

import type { NotificationStore } from "../stores";
import { createNotification } from "./service";

/**
 * Offer lifecycle inbox notifications (offer received, offer accepted, contract
 * activated). The caller must be the party whose confirmed transaction caused
 * the transition, and the contract's on-chain status (read server-side by the
 * route) must already reflect it. The unique key is contract + recipient +
 * kind, so retries and repeated calls never create a second row.
 */
export type OfferLifecycleKind =
  | "contract_offer_received"
  | "offer_accepted"
  | "contract_activated";

export const OFFER_LIFECYCLE_KINDS: readonly OfferLifecycleKind[] = [
  "contract_offer_received",
  "offer_accepted",
  "contract_activated",
];

type Party = "employer" | "freelancer";

export type OfferLifecycleRule = {
  caller: Party;
  recipient: Party;
  statuses: readonly ContractStatus[];
  title: string;
  body: string;
};

export const OFFER_LIFECYCLE_RULES: Record<OfferLifecycleKind, OfferLifecycleRule> = {
  contract_offer_received: {
    caller: "employer",
    recipient: "freelancer",
    statuses: ["PendingAcceptance"],
    title: "New contract offer",
    body: "An employer sent you a contract offer. Review the terms and respond before the acceptance deadline.",
  },
  offer_accepted: {
    caller: "freelancer",
    recipient: "employer",
    statuses: ["PendingEmployerApproval", "Active"],
    title: "Offer accepted",
    body: "The freelancer accepted your offer. Review activation to start the contract.",
  },
  contract_activated: {
    caller: "employer",
    recipient: "freelancer",
    statuses: ["Active"],
    title: "Contract activated",
    body: "The employer activated your contract. Work and pay can now proceed.",
  },
};

export type OfferLifecycleFacts = {
  employer: string;
  freelancer: string;
  status: ContractStatus;
};

export class OfferLifecycleError extends Error {
  constructor(
    readonly code: "forbidden" | "state_mismatch",
    message: string
  ) {
    super(message);
    this.name = "OfferLifecycleError";
  }
}

export function isOfferLifecycleKind(value: unknown): value is OfferLifecycleKind {
  return (
    typeof value === "string" &&
    (OFFER_LIFECYCLE_KINDS as readonly string[]).includes(value)
  );
}

export function offerLifecycleUniqueKey(
  kind: OfferLifecycleKind,
  contractAddress: string,
  recipientWallet: string
): string {
  return `${kind}:${contractAddress}:${recipientWallet}`;
}

export function offerLifecycleHref(contractAddress: string): string {
  return `/contracts/${contractAddress}`;
}

export async function notifyOfferLifecycle(
  store: NotificationStore,
  input: {
    kind: OfferLifecycleKind;
    contractAddress: string;
    callerWallet: string;
    facts: OfferLifecycleFacts;
  },
  now = new Date()
): Promise<{ created: boolean; skipped?: "self" }> {
  const rule = OFFER_LIFECYCLE_RULES[input.kind];
  const callerParty =
    rule.caller === "employer" ? input.facts.employer : input.facts.freelancer;
  if (input.callerWallet !== callerParty) {
    throw new OfferLifecycleError(
      "forbidden",
      `Only the ${rule.caller} can send this notification.`
    );
  }
  if (!rule.statuses.includes(input.facts.status)) {
    throw new OfferLifecycleError(
      "state_mismatch",
      "The contract is not in the expected on-chain state yet."
    );
  }
  const recipient =
    rule.recipient === "employer" ? input.facts.employer : input.facts.freelancer;
  if (recipient === input.callerWallet) {
    // Same wallet on both sides: nothing to tell yourself.
    return { created: false, skipped: "self" };
  }
  const result = await createNotification(
    store,
    {
      recipientWallet: recipient,
      type: input.kind,
      uniqueKey: offerLifecycleUniqueKey(input.kind, input.contractAddress, recipient),
      title: rule.title,
      body: rule.body,
      contractAddress: input.contractAddress,
      href: offerLifecycleHref(input.contractAddress),
      payload: { status: input.facts.status },
    },
    now
  );
  return { created: result.created };
}
