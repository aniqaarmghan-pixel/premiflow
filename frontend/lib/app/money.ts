import { baseUnitsToUiAmount } from "@/lib/streampay-v2";
import { defaultPaymentToken } from "@/lib/app/premiflow";

export function formatTokenAmount(base: bigint, decimals: number | undefined): string {
  if (decimals == null) return `${base.toString()} units`;
  return baseUnitsToUiAmount(base, decimals);
}

export function formatUsdLike(base: bigint, decimals: number | undefined): string {
  return formatFriendlyTokenAmount(base, decimals);
}

/**
 * Summary-card / monetary-summary display only (~2 decimal places).
 * Demo USDT (the Devnet test asset) → "$7.93". Not real USD: always pair with
 * `DevnetAssetNote` / `DEMO_USDT_BADGE` nearby. Other tokens → "7.93 SYMBOL".
 * Does not change base-unit math, mint, decimals, or on-chain logic.
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
  const friendly = n.toFixed(2);
  if (unit === defaultPaymentToken().symbol) return `$${friendly}`;
  return `${friendly} ${unit}`;
}
