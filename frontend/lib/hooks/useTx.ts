"use client";

import { useReducer } from "react";

import {
  parseClientError,
  withDeliverableRaceMessage,
  type UiAction,
} from "@/lib/streampay-v2";
import {
  initialTxState,
  isTxBusy,
  txReducer,
  type TxState,
} from "@/lib/app/tx-state";

export function useTx() {
  const [state, dispatch] = useReducer(txReducer, initialTxState);

  async function run(
    label: string,
    fn: () => Promise<{ signature: string }>,
    action?: UiAction
  ): Promise<boolean> {
    if (isTxBusy(state.phase)) return false;
    dispatch({ type: "wallet" });
    try {
      dispatch({ type: "submit" });
      const result = await fn();
      dispatch({ type: "confirm", signature: result.signature });
      dispatch({ type: "success", signature: result.signature });
      return true;
    } catch (err) {
      const parsed = withDeliverableRaceMessage(action, parseClientError(err));
      if (parsed.kind === "pending_confirmation") {
        dispatch({
          type: "pending",
          signature: parsed.signature ?? "",
          message: parsed.uiMessage || `${label} confirmation is unknown.`,
        });
        return false;
      }
      dispatch({ type: "fail", message: parsed.uiMessage || `${label} failed.` });
      return false;
    }
  }

  return {
    state: state as TxState,
    busy: isTxBusy(state.phase),
    run,
    reset: () => dispatch({ type: "reset" }),
  };
}
