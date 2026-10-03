import { formatTokenAmount } from "@/lib/app/money";
import {
  PROTECTION_FEE_CONFIG,
  protectionFeeBreakdown,
  type ProtectionFeeConfig,
} from "@/lib/app/protection-fee";

/**
 * Optional review / summary rows: Freelancer receives / fee / Employer total.
 * Renders nothing while the fee is disabled (the default), so today no fee
 * is shown anywhere. Display only; never feeds a transaction.
 */
export function ProtectionFeeSummary({
  agreedAmount,
  decimals,
  config = PROTECTION_FEE_CONFIG,
}: {
  agreedAmount: bigint;
  decimals?: number;
  config?: ProtectionFeeConfig;
}) {
  const breakdown = protectionFeeBreakdown(agreedAmount, config);
  if (!breakdown.enabled) return null;
  const rows = [
    { label: "Freelancer receives", value: breakdown.freelancerReceives },
    { label: breakdown.label, value: breakdown.fee },
    { label: "Employer total", value: breakdown.employerTotal },
  ];
  return (
    <dl className="mt-3 grid gap-2 rounded-2xl border border-line p-3 text-sm" aria-label="Fee summary">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 items-center justify-between gap-3">
          <dt className="text-ink-soft">{row.label}</dt>
          <dd className="font-medium tabular-nums text-ink">{formatTokenAmount(row.value, decimals)}</dd>
        </div>
      ))}
    </dl>
  );
}
