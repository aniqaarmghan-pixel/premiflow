import type { ContractRole, PaymentModeName } from "@/lib/streampay-v2";

export const CONTRACT_MESSAGES_TITLE = "Messages";
export const CONTRACT_MESSAGES_SUBTITLE = "Employer ↔ Freelancer";
export const CONTRACT_MESSAGES_CONNECTING =
  "Contract messaging is being connected.";

/**
 * H4b: private message APIs exist. Persistence requires DATABASE_URL.
 * Messages are not end-to-end encrypted.
 */
export const CONTRACT_MESSAGING_STATUS = {
  connected: true,
  persistent: true,
  encrypted: false,
  authenticated: false,
  sendEnabled: true,
  localOnlySendForbidden: true,
  storesOnChain: false,
} as const;

export const CONTRACT_MESSAGE_MAX_LENGTH = 2_000;

export const CONTRACT_MESSAGE_CHANNELS = {
  contractMessages: {
    name: "Contract Messages",
    purpose: "employer ↔ freelancer communication about this contract",
  },
  helpSupport: {
    name: "PREMIFLOW Help & Support",
    purpose: "product and platform help",
    href: "/support",
  },
  resolutionCenter: {
    name: "Resolution Center",
    purpose: "formal contract disagreement",
  },
  assistant: {
    name: "PREMIFLOW Assistant",
    purpose: "explanation and guidance — coming later",
  },
} as const;

export const CONTRACT_MESSAGE_AUTH_PLAN = {
  trustBrowserWalletClaim: false,
  flow: [
    "server issues nonce/challenge",
    "wallet signs challenge",
    "server verifies signature",
    "authenticated session is established",
    "server checks contract participant authorization",
    "message API permits read/write",
  ],
} as const;

export const CONTRACT_MESSAGE_PERSISTENCE = {
  recommended: "app_database" as const,
  installInH4: false,
  implementedInH4b: true,
  comparison: {
    app_database:
      "Smallest production-safe path once PREMIFLOW adds a server session store and a queryable private table keyed by contract address.",
    hosted_service:
      "Acceptable later if the hosted store is PREMIFLOW-owned, private, and not a public chat product.",
    decentralized_storage:
      "Poor fit for private employer/freelancer chat: weak queryability, unread state, moderation, and deletion.",
    on_chain:
      "Rejected for ordinary message text. Public, expensive, immutable, and the wrong evidence surface.",
  },
} as const;

export const WHATSAPP_RECOMMENDATION = {
  required: false,
  addedInH4: false,
  primary: false,
  reason:
    "Optional WhatsApp or other external contact would leave PREMIFLOW without a private, queryable, dispute-safe record. It should stay optional and never replace Contract Messages.",
} as const;

export const CONTRACT_MESSAGE_AI_POLICY = {
  autoReadPrivateChat: false,
  decideDisputes: false,
  determinePaymentSplits: false,
  signTransactions: false,
  requiresExplicitPermission: true,
  intendedLater: [
    "Explain a conversation after a participant grants permission",
    "Summarize selected dispute-evidence snapshots",
    "Find relevant on-chain contract facts",
  ],
} as const;

export const MESSAGE_EVIDENCE_PLAN = {
  actionLabel: "Add to dispute evidence",
  connected: false,
  automaticResolverAccess: false,
  createsSnapshot: true,
  disclosesEntireThread: false,
  explanation:
    "A future action will let a participant submit a selected message snapshot to a dispute. The resolver will not automatically read the private conversation.",
} as const;

export const CONTRACT_MESSAGING_BACKEND_REQUIRED = [
  "Wallet-signed nonce authentication and an HTTP session",
  "Server authorization against on-chain employer and freelancer pubkeys",
  "Private, queryable message persistence keyed by contract address",
  "Unread state per participant",
  "Optional evidence-snapshot records that do not expose the full thread",
] as const;

export type ContractMessageContextKind =
  | "none"
  | "fixed_deliverable"
  | "milestone"
  | "streaming_schedule"
  | "hourly_session"
  | "revision";

export type ContractMessageContext = {
  kind: ContractMessageContextKind;
  label: string;
  workUnitIndex?: number;
  sessionIndex?: number;
};

export type ProposedContractMessage = {
  id: string;
  contractAddress: string;
  senderWallet: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  hiddenAt: string | null;
  replyToMessageId: string | null;
  context: ContractMessageContext | null;
  attachmentRefs: readonly string[];
  evidenceSubmissionId: string | null;
};

export type ProposedEvidenceSnapshot = {
  id: string;
  contractAddress: string;
  submittedBy: string;
  messageId: string;
  bodySnapshot: string;
  createdAtSnapshot: string;
  senderWalletSnapshot: string;
  submittedAt: string;
};

export type MessageThreadAudience = "employer_freelancer" | "none";

export function isContractMessageParticipant(role: ContractRole): boolean {
  return role === "employer" || role === "freelancer";
}

export function resolverIsChatParticipant(_role: ContractRole): boolean {
  return false;
}

export function contractMessagesAudience(role: ContractRole): MessageThreadAudience {
  return isContractMessageParticipant(role) ? "employer_freelancer" : "none";
}

export function messagingAvailableForPaymentMode(
  _mode: PaymentModeName
): boolean {
  return true;
}

export function validateMessageBody(
  body: string
): { ok: true } | { ok: false; error: string } {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Message cannot be empty." };
  }
  if (trimmed.length > CONTRACT_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Message must be ${CONTRACT_MESSAGE_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true };
}

export function plannedMessageContextLabel(
  kind: ContractMessageContextKind,
  detail?: { index?: number }
): string {
  switch (kind) {
    case "fixed_deliverable":
      return "Regarding main deliverable";
    case "milestone":
      return `Regarding milestone ${detail?.index ?? 2}`;
    case "streaming_schedule":
      return "Regarding contract schedule";
    case "hourly_session":
      return `Regarding work session #${detail?.index ?? 4}`;
    case "revision":
      return "Regarding revision request";
    default:
      return "";
  }
}

export function canSelectMessageForEvidence(role: ContractRole): boolean {
  return (
    isContractMessageParticipant(role) &&
    CONTRACT_MESSAGING_STATUS.connected &&
    MESSAGE_EVIDENCE_PLAN.connected
  );
}

export function localOnlySendIsPresentedAsPersistent(): boolean {
  return false;
}

export function contractMessagesCopy(role: ContractRole): {
  status: string;
  body: string;
  audience: string;
} {
  if (role === "resolver") {
    return {
      status: "Unavailable",
      body: "Private contract messages stay between the employer and freelancer. The resolver does not automatically read this conversation. Only a message snapshot a party later submits as dispute evidence would appear in Resolution Center.",
      audience: "Resolver is not a chat participant.",
    };
  }
  if (!isContractMessageParticipant(role)) {
    return {
      status: "Unavailable",
      body: "Only this contract's employer and freelancer can use Contract Messages.",
      audience: "You are not a contract-message participant.",
    };
  }
  return {
    status: "Verify wallet",
    body: "Verify your wallet to open private messages. Send is available only after a verified employer or freelancer session.",
    audience: "Employer and freelancer only.",
  };
}

export const CONTRACT_MESSAGES_TARGET_UX = {
  empty: "No messages yet.",
  loading: "Loading messages…",
  failedSend: "Message was not sent. Try again.",
  retry: "Retry",
  composerPlaceholder: "Write a message…",
  send: "Send",
  unread: "Unread indicators will appear when messaging is connected.",
  clockNote: "Message timestamps will use the messaging server clock, not Solana Clock.",
} as const;
