import type { PublicKey } from "@solana/web3.js";

import { DEVNET_TEST_ASSET_COPY, isDevnetTestAsset } from "@/lib/app/premiflow";

/**
 * "Devnet test asset" caption with the "Not official USDT" tooltip. Renders
 * only for the configured Devnet test mint; custom/other tokens show nothing.
 */
export function DevnetAssetNote({
  mint,
  className = "",
}: {
  mint: string | PublicKey | null | undefined;
  className?: string;
}) {
  if (!isDevnetTestAsset(mint)) return null;
  return (
    <span
      title={DEVNET_TEST_ASSET_COPY.tooltip}
      aria-label={`${DEVNET_TEST_ASSET_COPY.label}. ${DEVNET_TEST_ASSET_COPY.tooltip}`}
      className={`inline-flex w-fit items-center rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-faint ${className}`}
    >
      {DEVNET_TEST_ASSET_COPY.label}
    </span>
  );
}
