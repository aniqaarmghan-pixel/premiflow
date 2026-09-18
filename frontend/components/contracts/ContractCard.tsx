"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Flag, Layers, Waves } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Identicon } from "@/components/ui/Identicon";
import { Progress } from "@/components/ui/Progress";
import { StatusBadge } from "./StatusBadge";
import { formatTokenAmount } from "@/lib/app/money";
import {
  counterparty,
  financialProgress,
  presentStatus,
  presentType,
  roleForContract,
  roleLabel,
} from "@/lib/app/view-model";
import type { ContractRole, ContractStatus, ContractType, ContractView } from "@/lib/streampay-v2";

export function ContractCard({
  contract,
  decimals,
}: {
  contract: ContractView;
  decimals?: number;
}) {
  const { publicKey } = useWallet();
  if (!publicKey) return null;
  const role = roleForContract(publicKey, contract);
  const other = counterparty(publicKey, contract);
  const progress = financialProgress(contract);

  return (
    <Link href={`/contracts/${contract.address.toBase58()}`} className="block min-w-0">
      <Card hover className="relative overflow-hidden p-5">
        <span
          className={`absolute inset-y-0 left-0 w-1 ${
            contract.paymentMode === "Streaming"
              ? "bg-cyan"
              : contract.paymentMode === "Milestone"
                ? "bg-violet"
                : "bg-accent-2"
          }`}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Identicon seed={other.address.toBase58()} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {other.label} {other.address.toBase58().slice(0, 6)}…
              </p>
              <p className="text-xs text-ink-faint">{roleLabel(role)} on this contract</p>
            </div>
          </div>
          <StatusBadge status={contract.status} label={presentStatus(contract.status)} />
        </div>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
              {contract.paymentMode === "Streaming" ? (
                <Waves size={13} />
              ) : contract.paymentMode === "Milestone" ? (
                <Layers size={13} />
              ) : (
                <Flag size={13} />
              )}
              {presentType(contract.paymentMode)}
            </p>
            <p className="font-display text-3xl text-ink">
              {formatTokenAmount(contract.totalAmount, decimals)}
            </p>
          </div>
          {contract.trialAmount > 0n ? (
            <span className="rounded-full bg-gold-soft px-2 py-1 text-[11px] font-semibold text-gold">
              Paid trial
            </span>
          ) : null}
        </div>
        <div className="mt-4">
          <Progress value={progress.releasedPct} label="Released of funded total" />
        </div>
        <p className="mt-3 text-xs font-medium text-accent">
          {nextHint(role, contract.status, contract.paymentMode)}
        </p>
      </Card>
    </Link>
  );
}

function nextHint(role: ContractRole, status: ContractStatus, type: ContractType): string {
  if (status === "PendingAcceptance" && role === "freelancer") return "Next: accept or decline";
  if (status === "PendingEmployerApproval" && role === "employer") return "Next: review activation";
  if (status === "Active" && type === "Streaming") return "Next: watch the stream";
  if (status === "Active" && role === "freelancer") return "Next: submit work when ready";
  if (status === "Active" && role === "employer") return "Next: review deliverables";
  if (status === "Disputed") return "Next: resolver award";
  if (status === "Completed" || status === "Cancelled" || status === "Resolved") {
    return "Next: withdraw or refund remaining claims";
  }
  return "Open contract";
}
