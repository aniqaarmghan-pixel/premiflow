"use client";

import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { explorerTxUrl } from "@/lib/network";
import { txPhaseDetail, txPhaseLabel, type TxState } from "@/lib/app/tx-state";
import { Address } from "./Address";

export function TransactionStatus({ state }: { state: TxState }) {
  if (state.phase === "ready") return null;
  const busy =
    state.phase === "preparing" ||
    state.phase === "awaiting_wallet" ||
    state.phase === "submitting" ||
    state.phase === "confirming";
  const detail = state.message ?? txPhaseDetail(state.phase);
  const awaiting = state.phase === "awaiting_wallet";

  return (
    <motion.div
      key={state.phase}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      aria-live="polite"
      className={
        awaiting
          ? "rounded-2xl border border-cyan/40 bg-cyan/10 px-4 py-3 text-sm shadow-[0_0_0_1px_rgba(46,230,214,0.12)]"
          : "rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
      }
    >
      <div className="flex items-center gap-2 font-medium text-ink">
        {busy ? <Loader2 size={16} className="animate-spin shrink-0" /> : null}
        {state.phase === "success" ? (
          <motion.span initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <CheckCircle2 size={16} className="text-ok" />
          </motion.span>
        ) : null}
        {state.phase === "pending_confirmation" ? (
          <AlertCircle size={16} className="text-[var(--warn)]" />
        ) : null}
        {state.phase === "failed" ? <XCircle size={16} className="text-danger" /> : null}
        {txPhaseLabel(state.phase)}
      </div>
      {detail ? <p className="mt-1 text-ink-soft">{detail}</p> : null}
      {state.phase === "failed" &&
      state.diagnostic &&
      process.env.NODE_ENV === "development" ? (
        <p className="mt-1 font-mono text-xs text-ink-faint">{state.diagnostic}</p>
      ) : null}
      {state.signature ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Address value={state.signature} label="Signature" href={explorerTxUrl(state.signature)} />
          <a
            className="text-xs text-accent underline"
            href={explorerTxUrl(state.signature)}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer
          </a>
        </div>
      ) : null}
    </motion.div>
  );
}
