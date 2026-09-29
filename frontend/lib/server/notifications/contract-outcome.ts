import type { ContractCaseFacts } from "../solana/read-contract-case-facts";
import type { NotificationStore } from "../stores";
import { createNotification } from "./service";

/**
 * Confirmed-outcome inbox notifications. The route re-reads the contract from
 * chain; the caller must be a party (or, for settlement, the resolver) and the
 * on-chain status must already reflect the outcome. Keys are
 * kind + contract + recipient, so retries never duplicate a row.
 * Reuses the existing contract_cancelled / dispute_resolved kinds (no migration).
 */
export type ContractOutcomeKind = "contract_ended" | "settlement_recorded";
export const CONTRACT_OUTCOME_KINDS: readonly ContractOutcomeKind[] = [
  "contract_ended",
  "settlement_recorded",
];
export const CONTRACT_ENDED_STATUSES: readonly string[] = ["Completed", "Cancelled"];

export type ContractOutcomeFacts = Pick<
  ContractCaseFacts,
  | "employer"
  | "freelancer"
  | "resolver"
  | "status"
  | "freelancerSettlementAmount"
  | "employerRefundableAmount"
  | "withdrawnAmount"
  | "refundedAmount"
>;

export class ContractOutcomeError extends Error {
  constructor(
    readonly code: "forbidden" | "state_mismatch",
    message: string
  ) {
    super(message);
    this.name = "ContractOutcomeError";
  }
}

export function isContractOutcomeKind(value: unknown): value is ContractOutcomeKind {
  return typeof value === "string" && (CONTRACT_OUTCOME_KINDS as readonly string[]).includes(value);
}

export function contractOutcomeUniqueKey(
  kind: ContractOutcomeKind,
  contractAddress: string,
  recipientWallet: string
): string {
  return `${kind}:${contractAddress}:${recipientWallet}`;
}

export type OutcomeNotice = {
  recipient: string;
  role: "employer" | "freelancer";
  title: string;
  body: string;
};

function toBig(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function contractOutcomeNotices(
  kind: ContractOutcomeKind,
  facts: ContractOutcomeFacts,
  callerWallet: string
): OutcomeNotice[] {
  const isEmployer = callerWallet === facts.employer;
  const isFreelancer = callerWallet === facts.freelancer;
  const isResolver = callerWallet === facts.resolver;
  if (kind === "contract_ended") {
    if (!isEmployer && !isFreelancer) {
      throw new ContractOutcomeError("forbidden", "Only a contract party can send this notification.");
    }
    if (!CONTRACT_ENDED_STATUSES.includes(facts.status)) {
      throw new ContractOutcomeError("state_mismatch", "The contract has not ended on-chain.");
    }
    const cancelled = facts.status === "Cancelled";
    const title = cancelled ? "Contract cancelled" : "Contract ended";
    const verb = cancelled ? "was cancelled" : "ended";
    const notices: OutcomeNotice[] = [];
    if (!isEmployer) {
      notices.push({
        recipient: facts.employer,
        role: "employer",
        title,
        body: `The contract ${verb} on-chain. Open it to claim any refund still available to you.`,
      });
    }
    if (!isFreelancer) {
      notices.push({
        recipient: facts.freelancer,
        role: "freelancer",
        title,
        body: `The contract ${verb} on-chain. Open it to collect any earned pay still available to you.`,
      });
    }
    return notices;
  }
  if (!isEmployer && !isFreelancer && !isResolver) {
    throw new ContractOutcomeError(
      "forbidden",
      "Only a party or the designated resolver can send this notification."
    );
  }
  if (facts.status !== "Resolved") {
    throw new ContractOutcomeError("state_mismatch", "The settlement is not recorded on-chain yet.");
  }
  const freelancerLeft = toBig(facts.freelancerSettlementAmount) - toBig(facts.withdrawnAmount);
  const employerLeft = toBig(facts.employerRefundableAmount) - toBig(facts.refundedAmount);
  const notices: OutcomeNotice[] = [
    {
      recipient: facts.freelancer,
      role: "freelancer",
      title: "Settlement recorded",
      body:
        freelancerLeft > 0n
          ? "The resolver recorded a settlement. Funds are available for you to collect."
          : "The resolver recorded a settlement. There is nothing further for you to collect.",
    },
  ];
  if (facts.employer !== facts.freelancer) {
    notices.push({
      recipient: facts.employer,
      role: "employer",
      title: "Settlement recorded",
      body:
        employerLeft > 0n
          ? "The resolver recorded a settlement. A refund is available for you to claim."
          : "The resolver recorded a settlement. No refund is due to you.",
    });
  }
  return notices;
}

export async function notifyContractOutcome(
  store: NotificationStore,
  input: {
    kind: ContractOutcomeKind;
    contractAddress: string;
    callerWallet: string;
    facts: ContractOutcomeFacts;
  },
  now = new Date()
): Promise<{ created: boolean; notified: Array<OutcomeNotice & { created: boolean }> }> {
  const notices = contractOutcomeNotices(input.kind, input.facts, input.callerWallet);
  const notified: Array<OutcomeNotice & { created: boolean }> = [];
  for (const notice of notices) {
    const result = await createNotification(
      store,
      {
        recipientWallet: notice.recipient,
        type: input.kind === "settlement_recorded" ? "dispute_resolved" : "contract_cancelled",
        uniqueKey: contractOutcomeUniqueKey(input.kind, input.contractAddress, notice.recipient),
        title: notice.title,
        body: notice.body,
        contractAddress: input.contractAddress,
        href:
          input.kind === "settlement_recorded"
            ? `/contracts/${input.contractAddress}#resolution`
            : `/contracts/${input.contractAddress}`,
        payload: { status: input.facts.status, role: notice.role },
      },
      now
    );
    notified.push({ ...notice, created: result.created });
  }
  return { created: notified.some((n) => n.created), notified };
}
