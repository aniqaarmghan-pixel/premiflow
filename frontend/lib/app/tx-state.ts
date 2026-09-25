export type TxPhase =
  | "ready"
  | "preparing"
  | "awaiting_wallet"
  | "submitting"
  | "confirming"
  | "success"
  | "pending_confirmation"
  | "failed";

export type TxState = {
  phase: TxPhase;
  signature?: string;
  message?: string;
  /** Development-only technical diagnostic; never shown in production UI. */
  diagnostic?: string;
};

export type TxEvent =
  | { type: "start" }
  | { type: "wallet" }
  | { type: "submit" }
  | { type: "confirm"; signature: string }
  | { type: "success"; signature: string }
  | { type: "pending"; signature: string; message: string }
  | { type: "fail"; message: string; diagnostic?: string }
  | { type: "reset" };

export const initialTxState: TxState = { phase: "ready" };

export function txReducer(state: TxState, event: TxEvent): TxState {
  switch (event.type) {
    case "start":
      return { phase: "preparing" };
    case "wallet":
      return { phase: "awaiting_wallet" };
    case "submit":
      return { phase: "submitting" };
    case "confirm":
      return { phase: "confirming", signature: event.signature };
    case "success":
      return { phase: "success", signature: event.signature };
    case "pending":
      return {
        phase: "pending_confirmation",
        signature: event.signature,
        message: event.message,
      };
    case "fail":
      return {
        phase: "failed",
        signature: state.signature,
        message: event.message,
        diagnostic: event.diagnostic,
      };
    case "reset":
      return initialTxState;
  }
}

export function isTxBusy(phase: TxPhase): boolean {
  return (
    phase === "preparing" ||
    phase === "awaiting_wallet" ||
    phase === "submitting" ||
    phase === "confirming" ||
    phase === "pending_confirmation"
  );
}

export function txPhaseLabel(phase: TxPhase): string {
  switch (phase) {
    case "ready":
      return "Ready";
    case "preparing":
      return "Preparing transaction…";
    case "awaiting_wallet":
      return "Waiting for wallet approval…";
    case "submitting":
      return "Submitting transaction…";
    case "confirming":
      return "Confirming on Devnet…";
    case "success":
      return "Success";
    case "pending_confirmation":
      return "Confirmation unknown";
    case "failed":
      return "Failed";
  }
}

/** Optional supporting line under the phase label. */
export function txPhaseDetail(phase: TxPhase): string | null {
  switch (phase) {
    case "awaiting_wallet":
      return "Review and approve the transaction in your wallet.";
    case "submitting":
      return "Broadcasting to Solana…";
    case "confirming":
      return "Waiting for Devnet confirmation…";
    case "preparing":
      return "Building the transaction…";
    default:
      return null;
  }
}
