"use client";

import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { explorerTxUrl } from "@/lib/network";
import { txPhaseLabel, type TxState } from "@/lib/app/tx-state";
import { Address } from "./Address";

export function TransactionStatus({ state }: { state: TxState }) {
  if (state.phase === "ready") return null;
  const busy =
    state.phase === "awaiting_wallet" ||
    state.phase === "submitting" ||
    state.phase === "confirming";
  return (
    <motion.div
      key={state.phase}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
    >
      <div className="flex items-center gap-2 font-medium text-ink">
        {busy ? <Loader2 size={16} className="animate-spin" /> : null}
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
      {state.message ? <p className="mt-1 text-ink-soft">{state.message}</p> : null}
      {state.signature ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Address value={state.signature} label="Signature" />
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
