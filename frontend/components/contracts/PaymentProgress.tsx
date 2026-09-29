import { Card } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { formatTokenAmount } from "@/lib/app/money";
import { financialProgress } from "@/lib/app/view-model";
import type { ContractView } from "@/lib/streampay-v2";

export function PaymentProgress({
  contract,
  decimals,
}: {
  contract: ContractView;
  decimals?: number;
}) {
  const progress = financialProgress(contract);
  const streaming = contract.paymentMode === "Streaming";
  const rows: Array<{ label: string; value: bigint }> = [
    { label: "Total contract value", value: progress.total },
    {
      label: streaming ? "Recorded for collection" : "Released",
      value: progress.released,
    },
    {
      label: streaming ? "Already collected" : "Withdrawn",
      value: progress.withdrawn,
    },
    { label: "Already refunded", value: progress.refunded },
    {
      label: streaming ? "Available to collect" : "Available to withdraw",
      value: progress.claimRemaining,
    },
    { label: "Employer refundable", value: progress.refundableRemaining },
    {
      label: streaming ? "Remaining escrow" : "Remaining in escrow",
      value: progress.remainingInEscrow,
    },
  ];

  return (
    <Card className="p-4 sm:p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">Payment</p>
      <h3 className="mt-1 font-display text-xl">On-chain balances</h3>
      <p className="mt-1 text-xs text-ink-faint">
        Displayed from the contract account. The program remains authoritative.
      </p>
      <div className="mt-4">
        <Progress
          value={progress.releasedPct}
          label={streaming ? "Recorded of total" : "Released of total"}
        />
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl bg-paper px-3 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-ink-faint">
              {row.label}
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {formatTokenAmount(row.value, decimals)}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
