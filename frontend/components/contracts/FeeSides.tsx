import { DevnetAssetNote } from "@/components/ui/DevnetAssetNote";
import { formatFriendlyTokenAmount } from "@/lib/app/money";
import { feeRowLabel, type PlatformFeeSummary } from "@/lib/app/platform-fee";
import type { PlanTier } from "@/lib/streampay-v2/fees";
import type { PublicKey } from "@solana/web3.js";

const DASH = "—";

/**
 * Both sides of the PREMIFLOW platform fee, never hidden:
 * EMPLOYER Contract amount / Platform fee / Total funding and
 * FREELANCER Gross earnings / Platform fee / Estimated net. Display only.
 * Demo USDT amounts use $-style display with a Devnet test-asset badge.
 */
export function FeeSides({
  summary,
  decimals,
  mint,
  employerPlan,
  freelancerPlan,
  agreedLabel = "Contract amount",
  highlight,
}: {
  summary: PlatformFeeSummary | null;
  decimals?: number;
  mint?: string | PublicKey | null;
  employerPlan?: PlanTier;
  freelancerPlan?: PlanTier;
  agreedLabel?: string;
  highlight?: "employer" | "freelancer";
}) {
  const amount = (value: bigint | undefined) =>
    summary && value !== undefined ? formatFriendlyTokenAmount(value, decimals) : DASH;
  const sides: { id: "employer" | "freelancer"; title: string; plan?: PlanTier; rows: [string, string][] }[] = [
    {
      id: "employer",
      title: "Employer",
      plan: employerPlan,
      rows: [
        [agreedLabel, amount(summary?.agreedAmount)],
        [feeRowLabel(summary?.feeBps ?? 0), amount(summary?.fee)],
        ["Total funding", amount(summary?.employerTotal)],
      ],
    },
    {
      id: "freelancer",
      title: "Freelancer",
      plan: freelancerPlan,
      rows: [
        ["Gross earnings", amount(summary?.agreedAmount)],
        [feeRowLabel(summary?.freelancerFeeBps ?? 0), amount(summary?.freelancerFee)],
        ["Estimated net", amount(summary?.freelancerNet)],
      ],
    },
  ];
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2" aria-label="PREMIFLOW platform fee by participant">
      {sides.map((side) => (
        <section
          key={side.id}
          aria-label={`${side.title} platform fee`}
          className={`min-w-0 rounded-xl border p-3 ${highlight === side.id ? "border-accent/50" : "border-line"}`}
        >
          <p className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <span>{side.title}</span>
            {side.plan ? <span className="normal-case tracking-normal">{side.plan} plan</span> : null}
          </p>
          <dl className="mt-1 divide-y divide-line">
            {side.rows.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                <dt className="text-ink-faint">{label}</dt>
                <dd className="text-right font-medium tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {mint ? (
        <div className="sm:col-span-2">
          <DevnetAssetNote mint={mint} />
        </div>
      ) : null}
    </div>
  );
}
