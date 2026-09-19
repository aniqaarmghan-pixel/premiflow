import {
  TransactionConfirmationUnknownError,
  TransactionFailedOnChainError,
} from "./confirm";
import { TransactionExpiredBeforeSubmitError } from "./send";

export type ParsedClientError = {
  kind:
    | "anchor"
    | "streampay_v2"
    | "wallet_rejected"
    | "rpc"
    | "insufficient_balance"
    | "missing_ata"
    | "simulation"
    | "pending_confirmation"
    | "expired_before_submit"
    | "unknown";
  code?: number;
  name?: string;
  uiMessage: string;
  raw: string;
  signature?: string;
};

const V2_ERROR_MESSAGES: Record<number, { name: string; message: string }> = {
  6100: { name: "InvalidAmount", message: "Amount must be greater than zero." },
  6101: { name: "InvalidDuration", message: "Duration is outside the permitted range." },
  6102: {
    name: "InvalidCheckpointInterval",
    message: "Checkpoint interval is invalid for this duration.",
  },
  6103: {
    name: "InvalidReviewDuration",
    message: "Review duration is outside the permitted range.",
  },
  6104: { name: "TooManyCheckpoints", message: "This would create too many checkpoints." },
  6105: { name: "InvalidMaxRevisions", message: "Maximum revisions exceeds the permitted limit." },
  6106: {
    name: "InvalidAcceptanceDeadline",
    message: "Acceptance deadline must be in the future.",
  },
  6107: {
    name: "InvalidScheduledStart",
    message: "Scheduled start must not precede the acceptance deadline.",
  },
  6108: {
    name: "InvalidMetadata",
    message: "Metadata reference is missing or too long.",
  },
  6109: {
    name: "SelfContract",
    message: "Employer and freelancer must be different wallets.",
  },
  6110: {
    name: "InvalidPaymentMode",
    message: "This operation is not valid for the contract's payment mode.",
  },
  6111: {
    name: "InvalidState",
    message: "The contract is not in the required state for this operation.",
  },
  6112: {
    name: "ContractNotStarted",
    message: "The contract has not started yet.",
  },
  6113: { name: "ContractTerminal", message: "The contract is in a terminal state." },
  6114: { name: "TermsNotFinalized", message: "Contract terms have not been finalized." },
  6115: { name: "AcceptanceExpired", message: "The acceptance deadline has passed." },
  6116: {
    name: "AcceptanceNotExpired",
    message: "The acceptance deadline has not yet passed.",
  },
  6117: {
    name: "ObligationsOutstanding",
    message: "Outstanding obligations remain on this contract.",
  },
  6118: { name: "Unauthorized", message: "You are not authorized for this operation." },
  6119: {
    name: "MilestoneAllocationExceeded",
    message: "Milestone amounts exceed the funded total.",
  },
  6120: {
    name: "MilestoneAllocationIncomplete",
    message: "Milestone amounts do not sum to the funded total.",
  },
  6121: {
    name: "NoMilestones",
    message: "This payment mode requires at least one milestone.",
  },
  6122: {
    name: "FixedNeedsOneUnit",
    message: "A fixed contract requires exactly one work unit.",
  },
  6123: {
    name: "StreamingHasNoMilestones",
    message: "A streaming contract cannot define milestones.",
  },
  6124: { name: "InvalidWorkUnit", message: "The work unit is invalid for this contract." },
  6125: { name: "BadUnitIndex", message: "Work unit index does not match the next index." },
  6126: { name: "UnitNotSubmittable", message: "This work unit is not awaiting submission." },
  6127: { name: "UnitNotUnderReview", message: "This work unit is not under review." },
  6128: { name: "UnitAlreadyReleased", message: "This work unit has already been released." },
  6129: { name: "UnitVoided", message: "This work unit has been voided." },
  6130: { name: "UnitNotStale", message: "This work unit is not stale and cannot be voided." },
  6131: { name: "ReviewAlreadyOpen", message: "Another work unit is still awaiting review." },
  6132: { name: "ReviewWindowOpen", message: "The review window is still open." },
  6133: { name: "ReviewWindowClosed", message: "The review window has already closed." },
  6134: {
    name: "RevisionLimitReached",
    message: "The maximum number of revisions has been reached.",
  },
  6135: { name: "PeriodNotComplete", message: "The checkpoint period is not yet complete." },
  6136: {
    name: "StreamFullyCheckpointed",
    message: "All streaming periods have already been checkpointed.",
  },
  6137: { name: "EmptyCheckpoint", message: "This checkpoint period has no earned amount." },
  6138: { name: "GraceWindowClosed", message: "The post-termination grace window has closed." },
  6139: { name: "NothingToWithdraw", message: "There is nothing available to withdraw." },
  6140: { name: "NothingToRefund", message: "There is nothing available to refund." },
  6141: { name: "NothingReleasable", message: "Nothing has been released on this contract." },
  6142: {
    name: "OpenReviewBlocksCancel",
    message: "Cannot cancel while a work unit is under review.",
  },
  6143: { name: "EscrowNotSettled", message: "Escrow still holds funds owed to a party." },
  6144: { name: "ArithmeticOverflow", message: "A math calculation overflowed." },
  6145: {
    name: "EscrowFundingMismatch",
    message: "Escrow did not receive the full contract amount.",
  },
  6146: {
    name: "TooManyMilestones",
    message: "This contract already has the maximum number of milestones.",
  },
  6147: { name: "InvalidDueDate", message: "Milestone due offset is invalid." },
  6148: {
    name: "InvalidActivationReview",
    message: "Activation review duration is outside the permitted range.",
  },
  6149: {
    name: "ApprovalWindowExpired",
    message: "The employer activation window has closed.",
  },
  6150: {
    name: "ScheduledStartElapsed",
    message: "The scheduled start has already elapsed.",
  },
  6151: { name: "InvalidTrialAmount", message: "Trial amount is invalid." },
  6152: { name: "TrialNotConfigured", message: "This contract has no paid trial." },
  6153: {
    name: "TrialRequired",
    message: "A paid trial is configured; this instruction cannot bypass it.",
  },
  6154: {
    name: "InvalidTrialState",
    message: "The trial work unit is not in the required state.",
  },
  6155: {
    name: "UnsupportedWorkUnitKind",
    message: "This work unit cannot use the post-activation review instructions.",
  },
  6156: {
    name: "ReleaseAmountExceeded",
    message: "This release would exceed the contract amount.",
  },
  6157: {
    name: "InsufficientEscrowBalance",
    message: "Escrow holds fewer tokens than the entitlement being claimed.",
  },
  6158: {
    name: "InvalidResolver",
    message: "Resolver must be a distinct non-default public key.",
  },
  6159: {
    name: "DisputeNotAllowed",
    message: "A dispute cannot be opened in this contract state.",
  },
  6160: { name: "ContractAlreadyDisputed", message: "This contract is already disputed." },
  6161: {
    name: "InvalidDisputeAward",
    message: "The dispute award exceeds the contested amount.",
  },
  6162: {
    name: "CompletionNotAllowed",
    message: "Successful completion is not allowed in this contract state.",
  },
  6163: {
    name: "UnresolvedWorkRemaining",
    message: "Required work is still unresolved.",
  },
  6164: {
    name: "ContractNotReadyForCompletion",
    message: "The contract is not ready for completion.",
  },
  6165: { name: "ContractAlreadyCompleted", message: "This contract is already completed." },
};

function asError(err: unknown): {
  message: string;
  code?: number;
  logs?: string[];
  name?: string;
  transactionMessage?: string;
  errorCode?: { code?: string; number?: number };
} {
  if (typeof err === "string") return { message: err };
  if (err instanceof Error) {
    const extra = err as Error & {
      code?: number;
      logs?: string[];
      transactionMessage?: string;
      error?: { errorCode?: { code?: string; number?: number } };
    };
    return {
      message: err.message,
      code: extra.code,
      logs: extra.logs,
      name: err.name,
      transactionMessage: extra.transactionMessage,
      errorCode: extra.error?.errorCode,
    };
  }
  if (err && typeof err === "object") {
    const obj = err as {
      message?: string;
      code?: number;
      logs?: string[];
      name?: string;
      transactionMessage?: string;
      error?: { errorCode?: { code?: string; number?: number } };
    };
    return {
      message: obj.message ?? JSON.stringify(err),
      code: obj.code,
      logs: obj.logs,
      name: obj.name,
      transactionMessage: obj.transactionMessage,
      errorCode: obj.error?.errorCode,
    };
  }
  return { message: String(err) };
}

function extractNumericCode(text: string): number | undefined {
  const custom = text.match(/custom program error:\s*(0x[0-9a-fA-F]+|\d+)/);
  if (custom) {
    const raw = custom[1];
    return raw.startsWith("0x") ? Number.parseInt(raw, 16) : Number(raw);
  }
  const named = text.match(/Error Code:\s*(\w+)\.\s*Error Number:\s*(\d+)/);
  if (named) return Number(named[2]);
  const borshCustom = text.match(/"Custom"\s*:\s*(\d+)/);
  if (borshCustom) return Number(borshCustom[1]);
  return undefined;
}

export const DELIVERABLE_STATE_CHANGED_MESSAGE =
  "The deliverable state changed before this action was confirmed. Refresh and review the latest contract state.";

const DELIVERABLE_RACE_CODES: Record<string, readonly number[]> = {
  voidStaleRevision: [6111, 6127, 6128, 6129],
  submitWorkUnit: [6111, 6126, 6129],
};

/**
 * When a late resubmit and End expired revision race, the losing tx fails
 * because the unit already moved. Keep original messages for other actions.
 */
export function withDeliverableRaceMessage(
  action: string | undefined,
  parsed: ParsedClientError
): ParsedClientError {
  if (!action) return parsed;
  const codes = DELIVERABLE_RACE_CODES[action];
  if (!codes || parsed.code === undefined || !codes.includes(parsed.code)) {
    return parsed;
  }
  return { ...parsed, uiMessage: DELIVERABLE_STATE_CHANGED_MESSAGE };
}

export function parseClientError(err: unknown): ParsedClientError {
  const parsed = asError(err);
  const raw = [parsed.message, ...(parsed.logs ?? [])].join("\n");
  console.error("[streampay-v2]", err);

  if (err instanceof TransactionExpiredBeforeSubmitError) {
    return {
      kind: "expired_before_submit",
      name: err.name,
      uiMessage: err.message,
      raw,
    };
  }

  if (err instanceof TransactionConfirmationUnknownError) {
    return {
      kind: "pending_confirmation",
      name: err.name,
      signature: err.signature,
      uiMessage:
        "The transaction was sent, but confirmation timed out. It may still have landed. Check the signature before sending again.",
      raw,
    };
  }

  if (err instanceof TransactionFailedOnChainError) {
    const failedRaw = `${raw}\n${JSON.stringify(err.err)}`;
    const code = extractNumericCode(failedRaw);
    if (code !== undefined && V2_ERROR_MESSAGES[code]) {
      const mapped = V2_ERROR_MESSAGES[code];
      return {
        kind: "streampay_v2",
        code,
        name: mapped.name,
        signature: err.signature,
        uiMessage: mapped.message,
        raw: failedRaw,
      };
    }
    return {
      kind: "unknown",
      signature: err.signature,
      uiMessage: "The transaction failed on-chain.",
      raw: failedRaw,
    };
  }

  if (
    parsed.name === "TransactionExpiredTimeoutError" ||
    /was not confirmed in .* seconds/i.test(raw)
  ) {
    const signature = raw.match(/Check signature\s+(\S+)/i)?.[1];
    return {
      kind: "pending_confirmation",
      name: parsed.name,
      signature,
      uiMessage:
        "The transaction was sent, but confirmation timed out. It may still have landed. Check the signature before sending again.",
      raw,
    };
  }

  if (
    parsed.code === 4001 ||
    /user rejected|WalletSignTransactionError|rejected the request/i.test(raw)
  ) {
    return {
      kind: "wallet_rejected",
      code: 4001,
      uiMessage: "The wallet rejected this transaction.",
      raw,
    };
  }

  if (
    /insufficient (lamports|funds|tokens)|0x1\b/i.test(raw) &&
    /token|spl|balance/i.test(raw)
  ) {
    return {
      kind: "insufficient_balance",
      uiMessage: "Insufficient token balance to fund or settle this transaction.",
      raw,
    };
  }

  if (
    /associated token|could not find.*token account|AccountNotFound|AccountNotInitialized|0xbc4/i.test(
      raw
    )
  ) {
    return {
      kind: "missing_ata",
      uiMessage: "A required token account is missing. Create the associated token account first.",
      raw,
    };
  }

  if (/simulation failed|Transaction simulation failed/i.test(raw)) {
    const code = parsed.errorCode?.number ?? extractNumericCode(raw);
    if (code !== undefined && V2_ERROR_MESSAGES[code]) {
      const mapped = V2_ERROR_MESSAGES[code];
      return {
        kind: "streampay_v2",
        code,
        name: mapped.name,
        uiMessage: mapped.message,
        raw,
      };
    }
    const detail = parsed.transactionMessage?.trim();
    const combined = `${raw}\n${detail ?? ""}`;
    if (/blockhash not found/i.test(combined)) {
      return {
        kind: "simulation",
        code,
        uiMessage:
          detail && /blockhash not found/i.test(detail)
            ? detail
            : "Transaction simulation failed: Blockhash not found",
        raw,
      };
    }
    return {
      kind: "simulation",
      code,
      uiMessage:
        detail && !/^simulation failed\.?$/i.test(detail)
          ? detail
          : "The transaction simulation failed. See logs for details.",
      raw,
    };
  }

  const code = parsed.errorCode?.number ?? parsed.code ?? extractNumericCode(raw);
  if (code !== undefined && V2_ERROR_MESSAGES[code]) {
    const mapped = V2_ERROR_MESSAGES[code];
    return {
      kind: "streampay_v2",
      code,
      name: mapped.name,
      uiMessage: mapped.message,
      raw,
    };
  }

  if (parsed.errorCode || /AnchorError|Error Code:/i.test(raw)) {
    return {
      kind: "anchor",
      code,
      name: parsed.errorCode?.code,
      uiMessage: parsed.message || "The program rejected this transaction.",
      raw,
    };
  }

  if (/failed to fetch|429|timeout|ECONNREFUSED|503|504/i.test(raw)) {
    return {
      kind: "rpc",
      uiMessage: "The Solana RPC request failed. Try again in a moment.",
      raw,
    };
  }

  return {
    kind: "unknown",
    code,
    uiMessage: parsed.message || "Something went wrong.",
    raw,
  };
}

export { V2_ERROR_MESSAGES };
