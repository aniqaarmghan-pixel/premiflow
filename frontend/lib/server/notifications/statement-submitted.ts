import type { NotificationStore } from "../stores";
import type { ContractCaseFacts } from "../solana/read-contract-case-facts";
import { createNotification } from "./service";
import { disputeAssignedHref } from "./dispute-assigned";

/**
 * First party-statement submission notifies the other party and the
 * designated resolver, linking to the contract Resolution Center. Uses the
 * existing `dispute_opened` kind (no schema change / migration). The unique
 * key is per contract + submitting role + recipient, so retries or edits
 * never create a duplicate row.
 */
export type StatementRole = "employer" | "freelancer";

const DEFAULT_PUBKEY = "11111111111111111111111111111111";

export function statementSubmittedUniqueKey(
  contractAddress: string,
  role: StatementRole,
  recipientWallet: string
): string {
  return `dispute_statement:${contractAddress}:${role}:${recipientWallet}`;
}

export function statementSubmittedNotice(role: StatementRole, audience: "party" | "resolver") {
  const who = role === "employer" ? "The employer" : "The freelancer";
  return {
    title: "Dispute statement submitted",
    body:
      audience === "resolver"
        ? `${who} submitted their dispute statement. Review it in the Resolution Center.`
        : `${who} submitted their dispute statement. Read it and add yours in the Resolution Center.`,
  };
}

export function statementSubmittedRecipients(
  facts: Pick<ContractCaseFacts, "employer" | "freelancer" | "resolver">,
  role: StatementRole
): Array<{ wallet: string; audience: "party" | "resolver" }> {
  const submitter = role === "employer" ? facts.employer : facts.freelancer;
  const other = role === "employer" ? facts.freelancer : facts.employer;
  const out: Array<{ wallet: string; audience: "party" | "resolver" }> = [];
  if (other && other !== submitter) out.push({ wallet: other, audience: "party" });
  const r = facts.resolver;
  if (r && r !== DEFAULT_PUBKEY && r !== submitter && !out.some((o) => o.wallet === r)) {
    out.push({ wallet: r, audience: "resolver" });
  }
  return out;
}

export async function notifyStatementSubmitted(
  store: NotificationStore,
  input: {
    contractAddress: string;
    role: StatementRole;
    facts: Pick<ContractCaseFacts, "employer" | "freelancer" | "resolver">;
  },
  now = new Date()
): Promise<number> {
  let created = 0;
  for (const recipient of statementSubmittedRecipients(input.facts, input.role)) {
    const notice = statementSubmittedNotice(input.role, recipient.audience);
    const result = await createNotification(
      store,
      {
        recipientWallet: recipient.wallet,
        type: "dispute_opened",
        uniqueKey: statementSubmittedUniqueKey(input.contractAddress, input.role, recipient.wallet),
        title: notice.title,
        body: notice.body,
        contractAddress: input.contractAddress,
        href: disputeAssignedHref(input.contractAddress),
        payload: { event: "statement_submitted", statementRole: input.role, audience: recipient.audience },
      },
      now
    );
    if (result.created) created += 1;
  }
  return created;
}
