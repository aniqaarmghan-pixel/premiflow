import { PREMIFLOW_ASSISTANT, RESOLVER_EXPLANATION } from "@/lib/app/resolution-center";

export const SUPPORT_PAGE = {
  title: "Help & Support",
  intro:
    "This is static PREMIFLOW help. There is no live chat or ticket queue. For guided questions, use the floating PREMIFLOW Assistant.",
  assistantStatus: "Available now",
  assistantTagline: PREMIFLOW_ASSISTANT.navLabel,
  assistantBody:
    "PREMIFLOW Assistant can explain contract types, protected payments, status and actions, paid trials, Collect / Claim, disputes and the resolver’s role, and how to navigate PREMIFLOW.",
  assistantWillNot:
    "It does not sign wallet transactions, move funds, create or fund contracts, approve work, Collect or Claim, cancel contracts, resolve disputes, or decide winners.",
} as const;

export type SupportTopicId =
  | "contracts"
  | "payment"
  | "revisions"
  | "streaming"
  | "messages"
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
      "Fixed uses one official deliverable. Milestone uses stages. Streaming accrues with elapsed contract time. Hourly records explicit Start work / Stop work sessions.",
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
      "Release accrued pay writes accrued value into released accounting. Collect pay transfers it.",
      "Confusion about the clock or recorded amount is often a support question, not a contractual dispute.",
    ],
  },
  {
    id: "messages",
    title: "Contract Messages",
    body: [
      "Contract Messages is employer and freelancer communication about one contract. That is not Help & Support, not Resolution Center, and not PREMIFLOW Assistant.",
      "Ordinary message text is stored by PREMIFLOW off-chain, not on Solana. Access requires a verified wallet that is the employer or freelancer. This is not end-to-end encryption.",
      "The resolver does not automatically read private chat. A later “Add to dispute evidence” action would submit a selected snapshot, not the entire conversation.",
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
