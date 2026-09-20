import { formatTokenAmount } from "@/lib/app/money";
import type { ContractView, UiAction, WorkUnitStatus } from "@/lib/streampay-v2";

export const TRIAL_EXIT_COPY = {
  approveTitle: "Approve trial & start contract",
  approveBody:
    "You accept the trial work and want to continue with the freelancer. The trial amount becomes available for the freelancer to collect and the main contract starts.",
  payEndTitle: "Pay trial & don't continue",
  payEndBody:
    "You accept that the trial should be paid, but you do not want to continue with the main engagement. The trial amount becomes available to the freelancer. The remaining funded main amount becomes refundable to you. No dispute is opened.",
  revisionTitle: "Request revision",
  revisionBody:
    "Ask the freelancer to revise the submitted trial. This does not pay the trial, does not start the main contract, and does not end the engagement.",
  disputeTitle: "Dispute trial",
  disputeBody:
    "Use this when you disagree that the submitted trial should be paid as-is. The contract enters dispute and the configured resolver reviews the contested amount.",
  endBeforeTitle: "End before trial work",
  endBeforeBody:
    "The freelancer has not submitted the trial. The main contract will not start. Your funded amount becomes refundable. This does not open a dispute. The resolver is not involved.",
  doNotStartTitle: "Do not start contract",
  doNotStartBody:
    "The main contract will not start. Your funded amount becomes refundable. This does not open a dispute. The resolver is not involved.",
  laterFullRefund:
    "After confirmation, use Claim refund to return the funded tokens to your wallet.",
  noImmediateTransfer:
    "This is an on-chain transaction. Tokens do not move during this action.",
  laterCollect: "The freelancer must Collect pay later to receive the trial amount.",
  laterRefund: "You must Claim refund later to recover the remaining funded main amount.",
  noDispute: "No dispute will be opened. The resolver will not be involved.",
  mainWillNotStart: "The main contract will not start.",
  streamingDoesNotStart: "Ending after the trial does not start the payment stream.",
  hourlyDoesNotActivate: "Ending after the trial does not activate Hourly work sessions.",
} as const;

export type TrialEmployerDecision = {
  action: UiAction;
  title: string;
  body: string;
};

export function trialEmployerDecisions(input: {
  actions: readonly UiAction[];
}): TrialEmployerDecision[] {
  const decisions: TrialEmployerDecision[] = [];
  if (input.actions.includes("approveTrialAndActivate")) {
    decisions.push({
      action: "approveTrialAndActivate",
      title: TRIAL_EXIT_COPY.approveTitle,
      body: TRIAL_EXIT_COPY.approveBody,
    });
  }
  if (input.actions.includes("settleTrialAndEnd")) {
    decisions.push({
      action: "settleTrialAndEnd",
      title: TRIAL_EXIT_COPY.payEndTitle,
      body: TRIAL_EXIT_COPY.payEndBody,
    });
  }
  if (input.actions.includes("requestTrialRevision")) {
    decisions.push({
      action: "requestTrialRevision",
      title: TRIAL_EXIT_COPY.revisionTitle,
      body: TRIAL_EXIT_COPY.revisionBody,
    });
  }
  if (input.actions.includes("rejectActivation")) {
    decisions.push({
      action: "rejectActivation",
      title: TRIAL_EXIT_COPY.disputeTitle,
      body: TRIAL_EXIT_COPY.disputeBody,
    });
  }
  return decisions;
}

export function settleTrialAndEndConfirmation(input: {
  contract: Pick<ContractView, "trialAmount" | "mainAmount" | "paymentMode">;
  decimals?: number;
}): {
  trialAmountLabel: string;
  employerRefundableLabel: string;
  points: string[];
} {
  const trialAmountLabel = formatTokenAmount(input.contract.trialAmount, input.decimals);
  const employerRefundableLabel = formatTokenAmount(
    input.contract.mainAmount,
    input.decimals
  );
  const points = [
    `Trial entitlement: ${trialAmountLabel}.`,
    `Employer refundable remainder: ${employerRefundableLabel}.`,
    TRIAL_EXIT_COPY.mainWillNotStart,
    TRIAL_EXIT_COPY.noDispute,
    TRIAL_EXIT_COPY.noImmediateTransfer,
    TRIAL_EXIT_COPY.laterCollect,
    TRIAL_EXIT_COPY.laterRefund,
  ];
  if (input.contract.paymentMode === "Streaming") {
    points.push(TRIAL_EXIT_COPY.streamingDoesNotStart);
  }
  if (input.contract.paymentMode === "Hourly") {
    points.push(TRIAL_EXIT_COPY.hourlyDoesNotActivate);
  }
  return { trialAmountLabel, employerRefundableLabel, points };
}

export function endBeforeTrialWorkConfirmation(input: {
  contract: Pick<ContractView, "totalAmount" | "trialAmount" | "paymentMode">;
  decimals?: number;
}): {
  fundedAmountLabel: string;
  points: string[];
} {
  const fundedAmountLabel = formatTokenAmount(input.contract.totalAmount, input.decimals);
  const points = [
    input.contract.trialAmount > 0n
      ? "The freelancer has not submitted the trial."
      : "No trial work is waiting for review.",
    TRIAL_EXIT_COPY.mainWillNotStart,
    `Your funded amount becomes refundable: ${fundedAmountLabel}.`,
    TRIAL_EXIT_COPY.noDispute,
    TRIAL_EXIT_COPY.noImmediateTransfer,
    TRIAL_EXIT_COPY.laterFullRefund,
  ];
  if (input.contract.paymentMode === "Streaming") {
    points.push(TRIAL_EXIT_COPY.streamingDoesNotStart);
  }
  if (input.contract.paymentMode === "Hourly") {
    points.push(TRIAL_EXIT_COPY.hourlyDoesNotActivate);
  }
  return { fundedAmountLabel, points };
}

export function isSubmittedTrialDisputeLabel(status?: WorkUnitStatus): boolean {
  return status === "Submitted" || status === "Revising";
}
