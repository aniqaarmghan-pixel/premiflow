import type { UiAction, WorkUnitStatus } from "@/lib/streampay-v2";

/**
 * Small notice catalog for in-app toasts, later Activity rows, and optional sound.
 * No playback lives here. Sound must never be the only signal, and browsers
 * may block audio until a user gesture.
 */
export type NoticeKind =
  | "contract_created"
  | "contract_accepted"
  | "contract_declined"
  | "activation_approved"
  | "activation_declined"
  | "activation_rejected_disputed"
  | "trial_submitted"
  | "trial_approved_and_activated"
  | "work_submitted"
  | "work_approved"
  | "revision_requested"
  | "revision_approaching_deadline"
  | "revision_deadline_passed"
  | "expired_revision_ended"
  | "revised_deliverable_submitted"
  | "payment_released"
  | "withdrawal_completed"
  | "refund_claimed"
  | "contract_cancelled"
  | "dispute_opened"
  | "dispute_resolved"
  | "contract_completed";

export type NoticeCopy = {
  kind: NoticeKind;
  title: string;
  body: string;
};

export type NoticeKindContext = {
  workUnitStatus?: WorkUnitStatus;
};

export const SOUND_PREF_KEY = "premiflow.soundEnabled";

export const NOTICE_CATALOG: Record<NoticeKind, NoticeCopy> = {
  contract_created: {
    kind: "contract_created",
    title: "Contract created",
    body: "The funded contract is waiting for the other party. Title and notes stay in this browser.",
  },
  contract_accepted: {
    kind: "contract_accepted",
    title: "Contract accepted",
    body: "The freelancer accepted. Activation is still a separate step.",
  },
  contract_declined: {
    kind: "contract_declined",
    title: "Contract declined",
    body: "The freelancer declined this contract. This action did not transfer tokens.",
  },
  activation_approved: {
    kind: "activation_approved",
    title: "Contract activated",
    body: "The contract is now active. This action did not transfer tokens.",
  },
  activation_declined: {
    kind: "activation_declined",
    title: "Activation declined",
    body: "The employer did not activate this contract. No tokens moved.",
  },
  activation_rejected_disputed: {
    kind: "activation_rejected_disputed",
    title: "Activation declined, dispute opened",
    body: "The submitted trial is now frozen in dispute for the named resolver. No tokens moved.",
  },
  trial_submitted: {
    kind: "trial_submitted",
    title: "Trial submitted",
    body: "The trial is waiting for employer review. Payment is not transferred yet.",
  },
  trial_approved_and_activated: {
    kind: "trial_approved_and_activated",
    title: "Trial approved and contract activated",
    body: "The trial amount was released in contract accounting and the contract is now active. The freelancer withdraws released funds separately.",
  },
  work_submitted: {
    kind: "work_submitted",
    title: "Work submitted",
    body: "Official review has started. Payment is not transferred yet.",
  },
  work_approved: {
    kind: "work_approved",
    title: "Work approved",
    body: "The approved amount is now released in accounting. The freelancer withdraws available funds separately.",
  },
  revision_requested: {
    kind: "revision_requested",
    title: "Revision requested",
    body: "The deliverable is waiting for a new official submission.",
  },
  revision_approaching_deadline: {
    kind: "revision_approaching_deadline",
    title: "Revision deadline approaching",
    body: "The resubmission window is nearly over. After it passes, the employer can end this revision.",
  },
  revision_deadline_passed: {
    kind: "revision_deadline_passed",
    title: "Revision deadline passed",
    body: "The employer can now end this revision. A late resubmission may still land until that action is confirmed on-chain.",
  },
  expired_revision_ended: {
    kind: "expired_revision_ended",
    title: "Expired revision ended",
    body: "The deliverable was marked Void. No payment was released, transferred, or refunded.",
  },
  revised_deliverable_submitted: {
    kind: "revised_deliverable_submitted",
    title: "Revised deliverable submitted",
    body: "A new official submission is under review. Payment is not transferred yet.",
  },
  payment_released: {
    kind: "payment_released",
    title: "Release recorded",
    body: "Released accounting increased. Tokens move only when withdrawn.",
  },
  withdrawal_completed: {
    kind: "withdrawal_completed",
    title: "Withdrawal complete",
    body: "Available released funds were transferred to your wallet.",
  },
  refund_claimed: {
    kind: "refund_claimed",
    title: "Refund claimed",
    body: "Available employer refund was transferred from escrow.",
  },
  contract_cancelled: {
    kind: "contract_cancelled",
    title: "Contract cancelled",
    body: "Settlement was recorded. Tokens move only when withdraw or refund is claimed.",
  },
  dispute_opened: {
    kind: "dispute_opened",
    title: "Dispute opened",
    body: "Contested value is frozen until the named resolver awards a split.",
  },
  dispute_resolved: {
    kind: "dispute_resolved",
    title: "Dispute resolved",
    body: "Settlement accounting was recorded. Withdraw and refund remain separate claims.",
  },
  contract_completed: {
    kind: "contract_completed",
    title: "Contract completed",
    body: "Final settlement was recorded. This action did not itself transfer tokens.",
  },
};

export function noticeKindForAction(
  action: UiAction,
  context?: NoticeKindContext
): NoticeKind | null {
  switch (action) {
    case "acceptContract":
      return "contract_accepted";
    case "declineContract":
      return "contract_declined";
    case "approveActivation":
      return "activation_approved";
    case "rejectActivation":
      return context?.workUnitStatus === "Submitted" ||
        context?.workUnitStatus === "Revising"
        ? "activation_rejected_disputed"
        : "activation_declined";
    case "submitTrialWork":
      return "trial_submitted";
    case "submitWorkUnit":
      return context?.workUnitStatus === "Revising"
        ? "revised_deliverable_submitted"
        : "work_submitted";
    case "approveWorkUnit":
      return "work_approved";
    case "approveTrialAndActivate":
      return "trial_approved_and_activated";
    case "requestWorkRevision":
    case "requestTrialRevision":
      return "revision_requested";
    case "voidStaleRevision":
      return "expired_revision_ended";
    case "finalizeReviewTimeout":
    case "releaseStreamAccrual":
      return "payment_released";
    case "withdrawFreelancer":
      return "withdrawal_completed";
    case "claimEmployerRefund":
      return "refund_claimed";
    case "cancelActiveContract":
      return "contract_cancelled";
    case "openDispute":
      return "dispute_opened";
    case "resolveDispute":
      return "dispute_resolved";
    case "completeContract":
      return "contract_completed";
    case "addMilestone":
    case "finalizeTerms":
      return null;
    default:
      return null;
  }
}

export function noticeCopyForAction(
  action: UiAction,
  context?: NoticeKindContext
): NoticeCopy | null {
  const kind = noticeKindForAction(action, context);
  return kind ? NOTICE_CATALOG[kind] : null;
}

export function noticeCopyForKind(kind: NoticeKind): NoticeCopy {
  return NOTICE_CATALOG[kind];
}

/** Read the user sound preference. Defaults off. Never throws. */
export function isNoticeSoundEnabled(storage?: Pick<Storage, "getItem"> | null): boolean {
  const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!store) return false;
  try {
    return store.getItem(SOUND_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNoticeSoundEnabled(
  enabled: boolean,
  storage?: Pick<Storage, "getItem" | "setItem"> | null
): void {
  const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!store) return;
  try {
    store.setItem(SOUND_PREF_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore quota / private-mode failures.
  }
}
