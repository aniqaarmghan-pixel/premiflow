import { formatUnix } from "@/lib/app/datetime";
import { presentResolver } from "@/lib/app/dispute-ux";
import {
  HOURLY_COPY,
  displayHourlyWorkLog,
  formatHourlyDuration,
  hourlySessionIndexLabel,
} from "@/lib/app/hourly-ux";
import { remainingAuthorizedSeconds } from "@/lib/streampay-v2/hourly";
import {
  estimatedStreamAccrualForContract,
  paymentModeLabel,
  projectedContestedRemainder,
  workUnitStatusLabel,
  type ContractType,
  type ContractView,
  type HourlySessionView,
  type HourlyStateView,
  type WorkUnitView,
} from "@/lib/streampay-v2";

export const RESOLUTION_CENTER_TITLE = "Resolution Center";

export const RESOLUTION_CENTER_COPY = {
  heading: "Dispute in progress",
  frozen: "This contract is frozen while the dispute is reviewed.",
  resolverReviews:
    "The designated resolver reviews the case and records the settlement decision.",
  noTransfer:
    "Opening or resolving a dispute does not by itself transfer tokens.",
  notStaffReview:
    "PREMIFLOW staff do not currently review this case. The designated resolver records the on-chain settlement.",
  resolvedHeading: "Settlement recorded",
  resolvedBody:
    "The designated resolver recorded the settlement. Tokens move only when the freelancer collects pay or the employer claims a refund.",
} as const;

export const SUPPORT_VS_DISPUTE_COPY = {
  whenToDispute:
    "Use a dispute when you and the other party disagree about the contract, work, or payment and cannot resolve it directly.",
  supportFirst:
    "Wallet errors, a failed transaction, or confusion about Streaming accrual are often support issues, not contractual disputes.",
  examples: [
    "Payment is already released, but the freelancer has not collected it yet.",
    "A wallet transaction failed or was rejected.",
    "You are unsure how Streaming earned pay is recorded.",
  ],
  helpLabel: "Help & Support",
  helpHref: "/support",
} as const;

export const CASE_PREPARATION_COPY = {
  heading: "Prepare case notes",
  notStored:
    "These notes are not recorded on-chain and are not sent with Open dispute. PREMIFLOW does not yet have a Resolution Case backend.",
  pageOnly:
    "Anything you type here stays on this page until you leave. It is not submitted as evidence.",
  categoryLabel: "What is the disagreement about?",
  categoryHint: "Optional. Helps you think through the case. It does not choose a settlement split.",
  descriptionLabel: "Explain what happened",
  descriptionHint:
    "Describe the agreement, what went wrong, and what outcome you are requesting. Optional. Not stored as case evidence yet.",
} as const;

export const EVIDENCE_COPY = {
  heading: "Evidence & case history",
  availableNow: "Available now from the contract account",
  comingLater: "Coming later",
  noInventedHistory: "Only account-derived facts are shown. Event history is not invented.",
} as const;

export const COMING_LATER_EVIDENCE = [
  "Off-chain party statements",
  "File attachments",
  "Support or chat message references",
  "Selected contract-message snapshots",
  "AI case summaries",
] as const;

export const MESSAGE_EVIDENCE_COPY = {
  comingLater: true,
  actionLabel: "Add to dispute evidence",
  body: "A future action will let a participant submit a selected message snapshot. The resolver will not automatically read the private conversation.",
} as const;

export const PARTY_STATEMENTS_COPY = {
  heading: "Party statements",
  unavailable:
    "Structured party statements are not stored yet. There is no Resolution Case backend.",
} as const;

export const AI_CASE_SUMMARY_COPY = {
  heading: "AI case summary",
  comingLater: "Coming later",
  body: "PREMIFLOW Assistant is not active. No AI summary is generated for this case.",
} as const;

export const PREMIFLOW_ASSISTANT = {
  name: "PREMIFLOW Assistant",
  comingLater: true,
  navLabel: "AI contract assistance — coming later",
  intended: [
    "Explain contract state",
    "Explain why an action is or is not available",
    "Distinguish support problems from contractual disputes",
    "Organize dispute statements and evidence",
    "Summarize both sides for the resolver",
  ],
  mustNot: [
    "Automatically decide who wins",
    "Automatically allocate escrow",
    "Replace the designated resolver",
    "Sign resolve_dispute",
  ],
} as const;

export const RESOLVER_EXPLANATION = {
  title: "What is a resolver?",
  definition:
    "A resolver is the designated third party authorized to decide how the remaining disputed contract amount is allocated between the freelancer and employer.",
  points: [
    "The resolver does not receive the escrow.",
    "The resolver cannot collect funds for either party.",
    "The resolver records the settlement decision.",
    "The freelancer and employer later transfer their own claimable amounts.",
  ],
  configured:
    "Current contracts use the configured PREMIFLOW resolver. This is not a decentralized resolver network.",
} as const;

export const RESOLUTION_LIFECYCLE = [
  { id: "problem", label: "Problem" },
  { id: "open", label: "Open dispute" },
  { id: "frozen", label: "Contract frozen" },
  { id: "review", label: "Resolver review" },
  { id: "recorded", label: "Settlement recorded" },
  { id: "claims", label: "Collect / Claim refund" },
] as const;

export type ResolutionLifecycleId = (typeof RESOLUTION_LIFECYCLE)[number]["id"];
export type LifecycleMark = "done" | "current" | "future" | "later";

export type DisputeCategoryId =
  | "work_not_delivered"
  | "incomplete_work"
  | "work_quality"
  | "scope"
  | "payment"
  | "deadline_abandonment"
  | "time_hours"
  | "other";

export type DisputeCategory = {
  id: DisputeCategoryId;
  label: string;
  hint: string;
};

export const DISPUTE_CATEGORIES: readonly DisputeCategory[] = [
  {
    id: "work_not_delivered",
    label: "Work not delivered",
    hint: "The agreed deliverable was never submitted.",
  },
  {
    id: "incomplete_work",
    label: "Incomplete work",
    hint: "Some work arrived, but the agreed scope is unfinished.",
  },
  {
    id: "work_quality",
    label: "Work quality disagreement",
    hint: "The parties disagree about whether the work meets the agreement.",
  },
  {
    id: "scope",
    label: "Scope or requirements disagreement",
    hint: "The parties disagree about what was included in the contract.",
  },
  {
    id: "payment",
    label: "Payment disagreement",
    hint: "The parties disagree about released, collected, or remaining pay.",
  },
  {
    id: "deadline_abandonment",
    label: "Deadline or abandonment",
    hint: "A deadline was missed, or a party stopped responding.",
  },
  {
    id: "time_hours",
    label: "Time or hours disagreement",
    hint: "Streaming tracks elapsed contract time. Hourly tracks recorded Start work / Stop work sessions.",
  },
  {
    id: "other",
    label: "Other",
    hint: "A disagreement that does not fit the other categories.",
  },
] as const;

export const RESOLUTION_CASE_PERSISTENCE = {
  onChain: false,
  backend: false,
  requiredForOpenDispute: false,
  discardedIfLeft: true,
} as const;

export type EvidenceFact = {
  label: string;
  value: string;
  source: "account";
};

export type ResolutionContext = {
  paymentMode: ContractType | "Hourly";
  facts: EvidenceFact[];
  notes: readonly string[];
  trial: EvidenceFact[] | null;
};

export function disputeCategoryById(id: DisputeCategoryId): DisputeCategory | undefined {
  return DISPUTE_CATEGORIES.find((category) => category.id === id);
}

/**
 * Categories never map to a settlement percentage. The resolver enters
 * freelancer_contested_award. Employer remainder is derived by Rust.
 */
export function suggestedAwardFromCategory(
  _category: DisputeCategoryId | null
): null {
  return null;
}

export function categoryImpliesAutomaticSplit(category: DisputeCategoryId): boolean {
  return suggestedAwardFromCategory(category) != null;
}

export function resolutionLifecycleState(
  status: ContractView["status"]
): Array<{ id: ResolutionLifecycleId; label: string; state: LifecycleMark }> {
  const currentId: ResolutionLifecycleId | null =
    status === "Disputed"
      ? "review"
      : status === "Resolved"
        ? "recorded"
        : status === "Active" || status === "PendingEmployerApproval"
          ? "problem"
          : null;

  const order: ResolutionLifecycleId[] = RESOLUTION_LIFECYCLE.map((step) => step.id);
  const currentIndex = currentId ? order.indexOf(currentId) : -1;

  return RESOLUTION_LIFECYCLE.map((step, i) => {
    let state: LifecycleMark = "future";
    if (currentIndex < 0) state = "future";
    else if (i < currentIndex) state = "done";
    else if (i === currentIndex) state = "current";
    return { id: step.id, label: step.label, state };
  });
}

export type HourlyResolutionInput = {
  hourlyState?: HourlyStateView | null;
  hourlySession?: HourlySessionView | null;
};

export function resolutionContext(
  contract: ContractView,
  units: readonly WorkUnitView[],
  now: number,
  formatAmount: (amount: bigint) => string = (amount) => amount.toString(),
  hourly?: HourlyResolutionInput
): ResolutionContext {
  const facts: EvidenceFact[] = [
    accountFact("Contract type", paymentModeLabel(contract.paymentMode)),
    accountFact("Total funded", formatAmount(contract.totalAmount)),
    accountFact("Released", formatAmount(contract.releasedAmount)),
    accountFact("Collected", formatAmount(contract.withdrawnAmount)),
    accountFact("Refunded", formatAmount(contract.refundedAmount)),
  ];

  if (contract.status === "Disputed" || contract.status === "Resolved") {
    facts.push(accountFact("Amount under dispute", formatAmount(contract.contestedAmount)));
    if (contract.disputedAt > 0) {
      facts.push(accountFact("Dispute opened", formatUnix(contract.disputedAt)));
    }
    if (contract.disputeInitiator !== "None") {
      facts.push(accountFact("Opened by", contract.disputeInitiator));
    }
  } else {
    facts.push(
      accountFact(
        "Amount currently subject to dispute",
        formatAmount(projectedContestedRemainder(contract, now))
      )
    );
  }

  const resolver = presentResolver(contract.resolver);
  facts.push(accountFact("Designated resolver", resolver.displayName));

  const notes = contextNotes(contract, hourly);
  const trial = trialFacts(contract, units, formatAmount);
  const typed = typeFacts(contract, units, now, formatAmount, hourly);
  return {
    paymentMode: contract.paymentMode,
    facts: [...facts, ...typed],
    notes,
    trial,
  };
}

function accountFact(label: string, value: string): EvidenceFact {
  return { label, value, source: "account" };
}

function contextNotes(contract: ContractView, hourly?: HourlyResolutionInput): string[] {
  const notes: string[] = [];
  if (contract.paymentMode === "Hourly") {
    notes.push(
      "Hourly pay accrues only from recorded Start work / Stop work sessions, not from calendar time passing."
    );
    if (hourly?.hourlySession?.status === "Open") {
      notes.push(HOURLY_COPY.disputeDuringSession);
    }
  }
  if (contract.paymentMode === "Streaming") {
    notes.push(
      "Streaming tracks elapsed contract time on the funded stream, not freelancer work sessions or hours."
    );
    if (contract.status === "Active" || contract.status === "Disputed") {
      notes.push(
        "For an active stream, accrued pay is accounted for before the remaining amount becomes disputed."
      );
    }
  }
  if (contract.paymentMode === "Milestone") {
    notes.push(
      "A disagreement may concern one or more project stages. Unreleased milestone amounts stay in the disputed remainder."
    );
  }
  if (contract.paymentMode === "Fixed") {
    notes.push(
      "Fixed contracts have one official deliverable. Revision and deadline state come from that work unit when it exists."
    );
  }
  return notes;
}

function typeFacts(
  contract: ContractView,
  units: readonly WorkUnitView[],
  now: number,
  formatAmount: (amount: bigint) => string,
  hourly?: HourlyResolutionInput
): EvidenceFact[] {
  const facts: EvidenceFact[] = [];
  const main = units.filter((unit) => unit.kind !== "Trial");

  if (contract.paymentMode === "Fixed") {
    facts.push(accountFact("Agreed main amount", formatAmount(contract.mainAmount)));
    const deliverable = main.find((unit) => unit.kind === "Fixed") ?? main[0];
    if (deliverable) {
      facts.push(accountFact("Official deliverable", workUnitStatusLabel(deliverable.status)));
      facts.push(
        accountFact(
          "Revisions used",
          `${deliverable.revisionCount} / ${contract.maxRevisions}`
        )
      );
      if (deliverable.actionDeadline > 0) {
        facts.push(accountFact("Action deadline", formatUnix(deliverable.actionDeadline)));
      }
      if (deliverable.submissionUri) {
        facts.push(accountFact("Submission reference", deliverable.submissionUri));
      }
    }
  }

  if (contract.paymentMode === "Milestone") {
    facts.push(accountFact("Allocated to stages", formatAmount(contract.allocatedAmount)));
    facts.push(
      accountFact(
        "Released stages",
        `${contract.releasedUnitCount} of ${contract.workUnitCount}`
      )
    );
    for (const unit of main) {
      facts.push(
        accountFact(
          `Stage ${unit.index + 1}`,
          `${workUnitStatusLabel(unit.status)} · ${formatAmount(unit.amount)}`
        )
      );
    }
  }

  if (contract.paymentMode === "Hourly" && hourly?.hourlyState) {
    const state = hourly.hourlyState;
    const remaining = remainingAuthorizedSeconds(state);
    facts.push(accountFact("Hourly rate", `${formatAmount(state.hourlyRate)} / hour`));
    facts.push(
      accountFact("Authorized time", formatHourlyDuration(Number(state.authorizedSeconds)))
    );
    facts.push(
      accountFact("Recorded time", formatHourlyDuration(Number(state.approvedSeconds)))
    );
    facts.push(
      accountFact("Remaining authorized time", formatHourlyDuration(Number(remaining)))
    );
    facts.push(accountFact("Active session", hourlySessionIndexLabel(state)));
    if (hourly.hourlySession?.status === "Open") {
      facts.push(accountFact("Session status", "Open"));
    }
    const workLog = displayHourlyWorkLog(hourly.hourlySession?.workLogUri);
    if (workLog) {
      facts.push(accountFact("Work log reference", workLog));
    }
  }

  if (contract.paymentMode === "Streaming") {
    facts.push(accountFact("Funded stream (main)", formatAmount(contract.mainAmount)));
    facts.push(accountFact("Recorded stream", formatAmount(contract.streamReleasedAmount)));
    if (contract.startTime > 0 && contract.endTime > contract.startTime) {
      facts.push(accountFact("Stream start", formatUnix(contract.startTime)));
      facts.push(accountFact("Stream end", formatUnix(contract.endTime)));
      facts.push(
        accountFact(
          "Display earned so far",
          formatAmount(estimatedStreamAccrualForContract(contract, now))
        )
      );
    }
  }

  return facts;
}

function trialFacts(
  contract: ContractView,
  units: readonly WorkUnitView[],
  formatAmount: (amount: bigint) => string
): EvidenceFact[] | null {
  if (contract.trialAmount === 0n) return null;
  const trial = units.find((unit) => unit.kind === "Trial");
  const facts: EvidenceFact[] = [
    accountFact("Trial amount", formatAmount(contract.trialAmount)),
  ];
  if (trial) {
    facts.push(accountFact("Trial status", workUnitStatusLabel(trial.status)));
    if (trial.submissionUri) {
      facts.push(accountFact("Trial submission", trial.submissionUri));
    }
  }
  return facts;
}

export function assistantDecidesSettlement(): boolean {
  return false;
}

export function caseNotesAreOnChain(): boolean {
  return RESOLUTION_CASE_PERSISTENCE.onChain;
}

export function caseNotesRequiredToOpenDispute(): boolean {
  return RESOLUTION_CASE_PERSISTENCE.requiredForOpenDispute;
}
