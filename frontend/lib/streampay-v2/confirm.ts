import type {
  Connection,
  SignatureStatus,
  TransactionError,
} from "@solana/web3.js";

/** Default HTTP confirmation budget. Dummy WebSocket is never used. */
export const HTTP_CONFIRM_TIMEOUT_MS = 60_000;
export const HTTP_CONFIRM_INTERVAL_MS = 1_000;

export type SignatureStatusValue = Pick<
  SignatureStatus,
  "err" | "confirmationStatus"
> | null;

export type SignatureStatusFetcher = (
  signature: string
) => Promise<SignatureStatusValue>;

export type ConfirmSignatureOutcome =
  | {
      outcome: "confirmed";
      signature: string;
      confirmationStatus: "confirmed" | "finalized";
    }
  | {
      outcome: "failed";
      signature: string;
      err: TransactionError;
    }
  | {
      outcome: "unknown";
      signature: string;
      reason: "timeout" | "rpc_error";
      lastError?: string;
    };

export type ConfirmSignatureOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** Sent, but HTTP polling did not reach a confirmed/finalized status. */
export class TransactionConfirmationUnknownError extends Error {
  readonly signature: string;
  readonly reason: "timeout" | "rpc_error";

  constructor(
    signature: string,
    reason: "timeout" | "rpc_error",
    lastError?: string
  ) {
    super(
      reason === "rpc_error"
        ? `Transaction ${signature} was sent, but confirmation polling failed${
            lastError ? `: ${lastError}` : ""
          }. It is unknown if it succeeded.`
        : `Transaction ${signature} was sent, but was not confirmed in time. It is unknown if it succeeded.`
    );
    this.name = "TransactionConfirmationUnknownError";
    this.signature = signature;
    this.reason = reason;
  }
}

/** Cluster reported an on-chain error for this signature. */
export class TransactionFailedOnChainError extends Error {
  readonly signature: string;
  readonly err: TransactionError;

  constructor(signature: string, err: TransactionError) {
    super(
      `Transaction ${signature} failed on-chain (${JSON.stringify(err)}).`
    );
    this.name = "TransactionFailedOnChainError";
    this.signature = signature;
    this.err = err;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Poll `getSignatureStatuses` over HTTP. Does not open a WebSocket and never
 * resends the transaction.
 */
export async function confirmSignatureHttp(
  fetchStatus: SignatureStatusFetcher,
  signature: string,
  options: ConfirmSignatureOptions = {}
): Promise<ConfirmSignatureOutcome> {
  const timeoutMs = options.timeoutMs ?? HTTP_CONFIRM_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? HTTP_CONFIRM_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = now() + timeoutMs;

  let lastRpcError: string | undefined;

  while (now() <= deadline) {
    try {
      const status = await fetchStatus(signature);
      lastRpcError = undefined;
      if (status?.err != null) {
        return { outcome: "failed", signature, err: status.err };
      }
      const confirmation = status?.confirmationStatus;
      if (confirmation === "confirmed" || confirmation === "finalized") {
        return {
          outcome: "confirmed",
          signature,
          confirmationStatus: confirmation,
        };
      }
    } catch (err) {
      lastRpcError = err instanceof Error ? err.message : String(err);
    }

    if (now() + intervalMs > deadline) {
      break;
    }
    await sleep(intervalMs);
  }

  return {
    outcome: "unknown",
    signature,
    reason: lastRpcError ? "rpc_error" : "timeout",
    lastError: lastRpcError,
  };
}

export async function confirmSignatureOnConnection(
  connection: Connection,
  signature: string,
  options: ConfirmSignatureOptions = {}
): Promise<ConfirmSignatureOutcome> {
  return confirmSignatureHttp(
    async (sig) => {
      const { value } = await connection.getSignatureStatuses([sig], {
        searchTransactionHistory: true,
      });
      return value[0];
    },
    signature,
    options
  );
}

export function throwIfNotConfirmed(
  result: ConfirmSignatureOutcome
): asserts result is Extract<ConfirmSignatureOutcome, { outcome: "confirmed" }> {
  if (result.outcome === "failed") {
    throw new TransactionFailedOnChainError(result.signature, result.err);
  }
  if (result.outcome === "unknown") {
    throw new TransactionConfirmationUnknownError(
      result.signature,
      result.reason,
      result.lastError
    );
  }
}
