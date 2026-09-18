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

export function StatusBadge({ status, label }: { status: ContractStatus; label: string }) {
  return <Badge tone={TONE[status]}>{label}</Badge>;
}
