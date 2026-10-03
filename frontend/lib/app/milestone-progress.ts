import type { ContractView, WorkUnitView } from "@/lib/streampay-v2";

/**
 * Milestone Progress panel model. Built only from the loaded contract and
 * its Milestone work units (on-chain data); nothing is estimated or invented.
 * Dates are shown only where the program stores them.
 */
export type MilestoneStepState =
  | "completed"
  | "current"
  | "submitted"
  | "revising"
  | "upcoming"
  | "void"
  | "disputed";

export type MilestoneStep = {
  index: number;
  label: string;
  amount: bigint;
  state: MilestoneStepState;
  stateLabel: string;
  /** contract start + stored due offset; null when not stored / not started. */
  dueAt: number | null;
  /** review window end while submitted (stored action deadline). */
  reviewEndsAt: number | null;
  submittedAt: number | null;
  revisionsUsed: number;
  maxRevisions: number;
  releasedAmount: bigint;
  releasedAt: number | null;
  releasedVia: "Employer approval" | "Review timeout" | null;
};

export type MilestoneProgressModel = {
  steps: MilestoneStep[];
  completedCount: number;
  voidCount: number;
  milestoneTotal: bigint;
  milestoneReleased: bigint;
  contractTotal: bigint;
  contractReleased: bigint;
  /** contract releasedAmount / totalAmount, 0-100 (one decimal). */
  releasedPct: number;
};

export const MILESTONE_STATE_LABELS: Record<MilestoneStepState, string> = {
  completed: "Released",
  current: "In progress",
  submitted: "Submitted for review",
  revising: "Revision requested",
  upcoming: "Upcoming",
  void: "Void",
  disputed: "In dispute",
};

function pct(part: bigint, total: bigint): number {
  if (total <= 0n || part <= 0n) return 0;
  const clamped = part > total ? total : part;
  return Number((clamped * 1000n) / total) / 10;
}

export function milestoneProgress(
  contract: ContractView,
  units: readonly WorkUnitView[] | null | undefined
): MilestoneProgressModel {
  const milestones = (units ?? [])
    .filter((u) => u && u.kind === "Milestone")
    .slice()
    .sort((a, b) => a.index - b.index);
  const disputed = contract.status === "Disputed";
  const live = contract.status === "Active" || disputed;
  let currentAssigned = false;

  const steps = milestones.map((unit, position): MilestoneStep => {
    let state: MilestoneStepState;
    if (unit.status === "Released") state = "completed";
    else if (unit.status === "Void") state = "void";
    else if (disputed) state = "disputed";
    else if (unit.status === "Submitted") state = "submitted";
    else if (unit.status === "Revising") state = "revising";
    else if (live && !currentAssigned) state = "current";
    else state = "upcoming";
    if (state === "current" || state === "submitted" || state === "revising") currentAssigned = true;

    const dueAt =
      contract.startTime > 0 && unit.dueOffsetSeconds > 0 ? contract.startTime + unit.dueOffsetSeconds : null;
    const released = unit.status === "Released";
    return {
      index: unit.index,
      label: `Milestone ${position + 1}`,
      amount: unit.amount,
      state,
      stateLabel: MILESTONE_STATE_LABELS[state],
      dueAt,
      reviewEndsAt: unit.status === "Submitted" && unit.actionDeadline > 0 ? unit.actionDeadline : null,
      submittedAt: unit.submittedAt > 0 ? unit.submittedAt : null,
      revisionsUsed: unit.revisionCount,
      maxRevisions: contract.maxRevisions,
      releasedAmount: released ? unit.amount : 0n,
      releasedAt: released && unit.releasedAt > 0 ? unit.releasedAt : null,
      releasedVia: !released
        ? null
        : unit.releaseTrigger === "EmployerApproval"
          ? "Employer approval"
          : unit.releaseTrigger === "ReviewTimeout"
            ? "Review timeout"
            : null,
    };
  });

  const milestoneTotal = steps.reduce((sum, s) => sum + s.amount, 0n);
  const milestoneReleased = steps.reduce((sum, s) => sum + s.releasedAmount, 0n);
  return {
    steps,
    completedCount: steps.filter((s) => s.state === "completed").length,
    voidCount: steps.filter((s) => s.state === "void").length,
    milestoneTotal,
    milestoneReleased,
    contractTotal: contract.totalAmount,
    contractReleased: contract.releasedAmount,
    releasedPct: pct(contract.releasedAmount, contract.totalAmount),
  };
}
