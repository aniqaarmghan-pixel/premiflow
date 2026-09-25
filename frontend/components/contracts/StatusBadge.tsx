"use client";

import { Badge } from "@/components/ui/Badge";
import type { ContractStatus } from "@/lib/streampay-v2";

const TONE: Record<ContractStatus, "neutral" | "accent" | "gold" | "danger" | "ok"> = {
  Draft: "neutral",
  PendingAcceptance: "gold",
  PendingEmployerApproval: "gold",
  Active: "accent",
  Completed: "ok",
  Declined: "danger",
  Expired: "neutral",
  Cancelled: "neutral",
  ActivationRejected: "danger",
  Disputed: "danger",
  Resolved: "ok",
};

export function StatusBadge({
  status,
  label,
  compact = false,
}: {
  status: ContractStatus;
  label: string;
  compact?: boolean;
}) {
  return (
    <Badge
      tone={TONE[status]}
      className={compact ? "px-2 py-0.5 text-[10px]" : undefined}
    >
      {label}
    </Badge>
  );
}
