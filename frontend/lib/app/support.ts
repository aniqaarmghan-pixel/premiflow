import { PREMIFLOW_ASSISTANT, RESOLVER_EXPLANATION } from "@/lib/app/resolution-center";

export const SUPPORT_PAGE = {
  title: "Help & Support",
  intro:
    "This is static PREMIFLOW help. There is no live chat, ticket queue, or AI assistant yet.",
  assistantComingLater: PREMIFLOW_ASSISTANT.navLabel,
} as const;

export type SupportTopicId =
  | "contracts"
  | "payment"
  | "revisions"
  | "streaming"
  | "disputes"
  | "resolver"
  | "wallet";

export type SupportTopic = {
  id: SupportTopicId;
  title: string;
  body: readonly string[];
};

export const SUPPORT_TOPICS: readonly SupportTopic[] = [
  {
    id: "contracts",
    title: "How contracts work",
    body: [
      "The employer funds the contract first. Tokens sit in escrow until released amounts are collected or refunded.",
      "Fixed uses one official deliverable. Milestone uses stages. Streaming accrues with elapsed contract time.",
      "Accepting a contract is consent. Activation is a separate employer step.",
    ],
  },
  {
    id: "payment",
    title: "Payment and Collect pay",
    body: [
      "Approving work or recording earned pay updates accounting. It does not by itself transfer tokens.",
      "Collect pay moves already-released tokens from escrow to the freelancer wallet.",
      "If pay is released but not collected, that is usually a Collect pay step, not a dispute.",
    ],
  },
  {
    id: "revisions",
    title: "Revisions",
    body: [
      "The employer may request a revision while a deliverable is under review, within the revision cap.",
      "After the revision deadline, the employer may end an expired revision. That does not release, transfer, or refund tokens.",
    ],
  },
  {
    id: "streaming",
    title: "Streaming",
    body: [
      "Streaming pay accrues from the contract clock, not from start/stop work sessions.",
      "Record earned pay writes accrued value into released accounting. Collect pay transfers it.",
      "Confusion about the clock or recorded amount is often a support question, not a contractual dispute.",
    ],
  },
  {
    id: "disputes",
    title: "Disputes",
    body: [
      "Open a dispute when you and the other party disagree about the contract, work, or payment and cannot resolve it directly.",
      "Opening a dispute freezes the contract. It does not transfer tokens, refund the employer, or pay the freelancer.",
      "After the designated resolver records a settlement, each party collects or claims their own amount.",
    ],
  },
  {
    id: "resolver",
    title: RESOLVER_EXPLANATION.title,
    body: [RESOLVER_EXPLANATION.definition, ...RESOLVER_EXPLANATION.points, RESOLVER_EXPLANATION.configured],
  },
  {
    id: "wallet",
    title: "Wallet and transaction problems",
    body: [
      "A rejected Phantom prompt or a failed simulation does not change contract settlement by itself.",
      "Refresh the contract and review the latest on-chain state before sending the same action again.",
      "Missing token accounts or an empty wallet balance are support issues, not Resolution Center cases.",
    ],
  },
];

export function supportTopicHref(id: SupportTopicId): string {
  return `/support#${id}`;
}
