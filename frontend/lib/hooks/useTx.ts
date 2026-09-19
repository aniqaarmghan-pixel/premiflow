"use client";

import { useReducer } from "react";

import { useNotices } from "@/components/shell/NoticeProvider";
import type { NoticeKind } from "@/lib/app/notices";
import { unlockNoticeAudio } from "@/lib/app/notice-sound";
import { withDisputeRaceMessage } from "@/lib/app/dispute-ux";
import {
  parseClientError,
  withDeliverableRaceMessage,
  type PaymentModeName,
  type UiAction,
  type WorkUnitStatus,
} from "@/lib/streampay-v2";
import {
  initialTxState,
  isTxBusy,
  txReducer,
  type TxState,
} from "@/lib/app/tx-state";

export type TxRunContext = {
  action?: UiAction;
  workUnitStatus?: WorkUnitStatus;
  paymentMode?: PaymentModeName;
  noticeKind?: NoticeKind;
  /** Skip toast/sound. Used by create, which already has SuccessMoment. */
  suppressNotice?: boolean;
};

export function useTx() {
  const [state, dispatch] = useReducer(txReducer, initialTxState);
  const notices = useNotices();

  async function run(
    label: string,
    fn: () => Promise<{ signature: string }>,
    context?: UiAction | TxRunContext
  ): Promise<boolean> {
    const resolved: TxRunContext =
      typeof context === "string" ? { action: context } : context ?? {};
    if (isTxBusy(state.phase)) return false;
    unlockNoticeAudio();
    dispatch({ type: "wallet" });
    try {
      dispatch({ type: "submit" });
      const result = await fn();
      dispatch({ type: "confirm", signature: result.signature });
      dispatch({ type: "success", signature: result.signature });
      if (!resolved.suppressNotice) {
        notices.notifyConfirmed({
          signature: result.signature,
          action: resolved.action,
          workUnitStatus: resolved.workUnitStatus,
          paymentMode: resolved.paymentMode,
          noticeKind: resolved.noticeKind,
        });
      }
      return true;
    } catch (err) {
      const parsed = withDisputeRaceMessage(
        resolved.action,
        withDeliverableRaceMessage(resolved.action, parseClientError(err))
      );
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
