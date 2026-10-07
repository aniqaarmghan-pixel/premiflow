import { formatTokenAmount } from "@/lib/app/money";
import {
  EMPLOYER_FEE_NOTE,
  FREELANCER_FEE_NOTE,
  agreedAmountLabel,
  contractFeeSummary,
  feeRowLabel,
} from "@/lib/app/platform-fee";
import type { ContractView } from "@/lib/streampay-v2";

/**
 * Contract amount / PREMIFLOW fee / total funded, from the contract's on-chain
 * fee fields. Renders nothing for contracts without a fee (feeBps = 0), so
 * older contracts never show a charged fee. Display only.
 */
export function ProtectionFeeSummary({
  contract,
  decimals,
  role,
}: {
  contract: Pick<ContractView, "totalAmount" | "feeBps" | "feeReserve" | "paymentMode" | "trialAmount">;
  decimals?: number;
  role?: string;
}) {
  const summary = contractFeeSummary(contract);
  if (!summary.charged) return null;
  const freelancer = role === "freelancer";
  const rows = freelancer
    ? [{ label: "You receive (agreed amount)", value: summary.agreedAmount }]
    : [
        {
          label: agreedAmountLabel(contract.paymentMode, contract.trialAmount > 0n),
          value: summary.agreedAmount,
        },
        { label: feeRowLabel(summary.feeBps), value: summary.fee },
        { label: "Total funded by employer", value: summary.employerTotal },
      ];
  return (
    <div className="mt-3 rounded-2xl border border-line p-3 text-sm" aria-label="Fee summary">
      <dl className="grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex min-w-0 items-center justify-between gap-3">
            <dt className="text-ink-soft">{row.label}</dt>
            <dd className="font-medium tabular-nums text-ink">{formatTokenAmount(row.value, decimals)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-faint">{freelancer ? FREELANCER_FEE_NOTE : EMPLOYER_FEE_NOTE}</p>
    </div>
  );
}
