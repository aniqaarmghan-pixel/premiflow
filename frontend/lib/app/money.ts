import { baseUnitsToUiAmount } from "@/lib/streampay-v2";
import { defaultPaymentToken } from "@/lib/app/premiflow";

export function formatTokenAmount(base: bigint, decimals: number | undefined): string {
  if (decimals == null) return `${base.toString()} units`;
  return baseUnitsToUiAmount(base, decimals);
}

export function formatUsdLike(base: bigint, decimals: number | undefined): string {
  const ui = formatTokenAmount(base, decimals);
  return ui;
}

/**
 * Summary-card display only: ~2 decimal places + configured payment-token symbol.
 * Does not change base-unit math or stored values.
 */
export function formatFriendlyTokenAmount(
  base: bigint,
  decimals: number | undefined,
  symbol?: string | null
): string {
  const unit = (symbol && symbol.trim()) || defaultPaymentToken().symbol;
  if (decimals == null) return `${base.toString()} units`;
  const ui = baseUnitsToUiAmount(base, decimals);
  const n = Number(ui);
  if (!Number.isFinite(n)) return `${ui} ${unit}`;
  // Summary cards: always ~2 decimal places (base-unit math stays elsewhere).
  const friendly = n.toFixed(2);
  return `${friendly} ${unit}`;
}
