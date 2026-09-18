import { baseUnitsToUiAmount } from "@/lib/streampay-v2";

export function formatTokenAmount(base: bigint, decimals: number | undefined): string {
  if (decimals == null) return `${base.toString()} units`;
  return baseUnitsToUiAmount(base, decimals);
}

export function formatUsdLike(base: bigint, decimals: number | undefined): string {
  const ui = formatTokenAmount(base, decimals);
  return ui;
}
