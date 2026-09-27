import type { ContractParties } from "../solana/read-contract-parties";
import type { NotificationStore } from "../stores";
import { createNotification } from "./service";

export const MESSAGE_RECEIVED_TITLE = "New message";
export const MESSAGE_RECEIVED_BODY =
  "You received a new message about this contract.";

/**
 * Counterparty for a verified message sender.
 * Derived only from on-chain employer/freelancer — never from the client.
 */
export function otherMessageParty(
  senderWallet: string,
  parties: ContractParties
): string | null {
  if (senderWallet === parties.employer) return parties.freelancer;
  if (senderWallet === parties.freelancer) return parties.employer;
  return null;
}

export function messageReceivedUniqueKey(
  messageId: string,
  recipientWallet: string
): string {
  return `message_received:${messageId}:${recipientWallet}`;
}

/** Opens contract detail and requests chat panel via existing Messages UI. */
export function messageNotificationHref(contractAddress: string): string {
  return `/contracts/${contractAddress}?chat=1`;
}

/**
 * Creates a wallet-scoped message_received notification for the other party.
 * Call only after the message row is persisted. Failures should be swallowed by
 * the caller so message delivery is never rolled back.
 */
export async function notifyOtherPartyOfMessage(
  store: NotificationStore,
  input: {
    contractAddress: string;
    messageId: string;
    senderWallet: string;
    parties: ContractParties;
  },
  now = new Date()
): Promise<{ created: boolean; skipped?: string }> {
  const recipientWallet = otherMessageParty(input.senderWallet, input.parties);
  if (!recipientWallet) {
    return { created: false, skipped: "no_counterparty" };
  }
  if (recipientWallet === input.senderWallet) {
    return { created: false, skipped: "self" };
  }

  const result = await createNotification(
    store,
    {
      recipientWallet,
      type: "message_received",
      uniqueKey: messageReceivedUniqueKey(input.messageId, recipientWallet),
      title: MESSAGE_RECEIVED_TITLE,
      body: MESSAGE_RECEIVED_BODY,
      contractAddress: input.contractAddress,
      href: messageNotificationHref(input.contractAddress),
      payload: { messageId: input.messageId },
    },
    now
  );

  return { created: result.created };
}
