import type { UiAction } from "@/lib/streampay-v2";

/**
 * Small notice catalog for later toasts, Activity rows, and optional sound.
 * No playback lives here. Sound must never be the only signal, and browsers
 * may block audio until a user gesture.
 */
export type NoticeKind =
  | "contract_accepted"
  | "work_submitted"
  | "work_approved"
  | "revision_requested"
  | "revision_approaching_deadline"
  | "revision_deadline_passed"
  | "expired_revision_ended"
  | "revised_deliverable_submitted"
  | "payment_released"
  | "withdrawal_completed"
  | "dispute_opened"
  | "dispute_resolved"
  | "contract_completed";

export type NoticeCopy = {
  kind: NoticeKind;
  title: string;
  body: string;
};

export const SOUND_PREF_KEY = "premiflow.soundEnabled";

export const NOTICE_CATALOG: Record<NoticeKind, NoticeCopy> = {
  contract_accepted: {
    kind: "contract_accepted",
    title: "Contract accepted",
    body: "The freelancer accepted. Activation is still a separate step.",
  },
  work_submitted: {
    kind: "work_submitted",
    title: "Work submitted",
    body: "Official review has started. Payment is not transferred yet.",
  },
  work_approved: {
    kind: "work_approved",
    title: "Work approved",
    body: "The amount is released in accounting. Withdraw is a separate transfer.",
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
    title: "Payment released",
    body: "Released value increased. Tokens move only when withdrawn.",
  },
  withdrawal_completed: {
    kind: "withdrawal_completed",
    title: "Withdrawal complete",
    body: "Released tokens left escrow for the freelancer token account.",
  },
  dispute_opened: {
    kind: "dispute_opened",
    title: "Dispute opened",
    body: "Contested value is frozen until the named resolver awards a split.",
  },
  dispute_resolved: {
    kind: "dispute_resolved",
    title: "Dispute resolved",
    body: "Settlement is frozen. Withdraw and refund remain separate claims.",
  },
  contract_completed: {
    kind: "contract_completed",
    title: "Contract completed",
    body: "Final settlement is recorded. Completing does not transfer tokens.",
  },
};

export function noticeKindForAction(action: UiAction): NoticeKind | null {
  switch (action) {
    case "acceptContract":
      return "contract_accepted";
    case "submitWorkUnit":
    case "submitTrialWork":
      return "work_submitted";
    case "approveWorkUnit":
    case "approveTrialAndActivate":
      return "work_approved";
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
    case "openDispute":
      return "dispute_opened";
    case "resolveDispute":
      return "dispute_resolved";
    case "completeContract":
      return "contract_completed";
    default:
      return null;
  }
}

export function noticeCopyForAction(action: UiAction): NoticeCopy | null {
  const kind = noticeKindForAction(action);
  return kind ? NOTICE_CATALOG[kind] : null;
}

/** Read the user sound preference. Defaults off. Never throws. */
export function isNoticeSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNoticeSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore quota / private-mode failures.
  }
}
