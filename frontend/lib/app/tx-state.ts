export type TxPhase =
  | "ready"
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
};

export type TxEvent =
  | { type: "start" }
  | { type: "wallet" }
  | { type: "submit" }
  | { type: "confirm"; signature: string }
  | { type: "success"; signature: string }
  | { type: "pending"; signature: string; message: string }
  | { type: "fail"; message: string }
  | { type: "reset" };

export const initialTxState: TxState = { phase: "ready" };

export function txReducer(state: TxState, event: TxEvent): TxState {
  switch (event.type) {
    case "start":
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
      };
    case "reset":
      return initialTxState;
  }
}

export function isTxBusy(phase: TxPhase): boolean {
  return (
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
    case "awaiting_wallet":
      return "Awaiting wallet approval";
    case "submitting":
      return "Submitting";
    case "confirming":
      return "Confirming";
    case "success":
      return "Success";
    case "pending_confirmation":
      return "Confirmation unknown";
    case "failed":
      return "Failed";
  }
}
