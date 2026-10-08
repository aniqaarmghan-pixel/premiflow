import { FeeSides } from "@/components/contracts/FeeSides";
import {
  EMPLOYER_FEE_NOTE,
  FREELANCER_FEE_NOTE,
  FROZEN_RATES_NOTE,
  LEGACY_FREELANCER_FEE_NOTE,
  agreedAmountLabel,
  contractFeeSummary,
} from "@/lib/app/platform-fee";
import type { ContractView } from "@/lib/streampay-v2";

/**
 * Both sides of the PREMIFLOW platform fee from the contract's frozen on-chain
 * fee fields. Renders nothing when neither side pays a fee (older feeBps = 0
 * contracts). Pre-upgrade contracts show a 0% freelancer fee. Display only.
 */
export function ProtectionFeeSummary({
  contract,
  decimals,
  role,
}: {
  contract: Pick<
    ContractView,
    "totalAmount" | "feeBps" | "feeReserve" | "freelancerFeeBps" | "paymentMode" | "trialAmount"
  >;
  decimals?: number;
  role?: string;
}) {
  const summary = contractFeeSummary(contract);
  if (!summary.charged) return null;
  const freelancer = role === "freelancer";
  const freelancerNote = summary.freelancerFeeBps > 0 ? FREELANCER_FEE_NOTE : LEGACY_FREELANCER_FEE_NOTE;
  return (
    <div className="mt-3 rounded-2xl border border-line p-3 text-sm" aria-label="Fee summary">
      <FeeSides
        summary={summary}
        decimals={decimals}
        agreedLabel={agreedAmountLabel(contract.paymentMode, contract.trialAmount > 0n)}
        highlight={freelancer ? "freelancer" : "employer"}
      />
      <p className="mt-2 text-xs text-ink-faint">{freelancer ? freelancerNote : EMPLOYER_FEE_NOTE}</p>
      <p className="mt-1 text-xs text-ink-faint">{FROZEN_RATES_NOTE}</p>
    </div>
  );
}
