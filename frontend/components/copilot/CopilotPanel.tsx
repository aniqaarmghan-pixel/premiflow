"use client";

import { ContractAssistant } from "@/components/copilot/ContractAssistant";
import type { CopilotRoleLabel } from "@/lib/app/copilot-schemas";

export const COPILOT_PANEL_ENABLED_MODES = ["create", "contract", "action", "dispute"] as const;

export function CopilotPanel({
  variant = "live",
  contractAddress,
  role,
  paymentMode,
  statusLabel,
}: {
  variant?: "create" | "live";
  contractAddress?: string;
  role?: CopilotRoleLabel;
  paymentMode?: string;
  statusLabel?: string;
}) {
  if (variant !== "live" || !contractAddress || !role || !paymentMode || !statusLabel) {
    return null;
  }
  return (
    <ContractAssistant
      contractAddress={contractAddress}
      role={role}
      paymentMode={paymentMode}
      statusLabel={statusLabel}
    />
  );
}
