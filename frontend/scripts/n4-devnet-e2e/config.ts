/**
 * PREMIFLOW N4 scripted Devnet E2E — test-only constants.
 * Does not alter production N1–N4 behavior.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEVNET_CLUSTER } from "@/lib/cluster";

/** Solana Devnet genesis hash — hard-fail if RPC differs. */
export const EXPECTED_DEVNET_GENESIS =
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export const EXPECTED_PROGRAM = "EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd";
export const EXPECTED_MINT = "9JTBN7QLcoam7LkN44YDhtMQsYt4zKLW7KUE4FscgZtx";
export const EXPECTED_MINT_DECIMALS = 6;

/** Disposable N4 E2E wallets (public only). */
export const EXPECTED_EMPLOYER =
  "CgonbiWvw7vAKhAXP8HbjrKcC8RFXqewKKkQ2SA2wLpz";
export const EXPECTED_FREELANCER =
  "FH8KBiqYJRyHTvwW3y9BdXkitqruXr7b1mnbJ2tMXQE6";

/** 1 PFT at 6 decimals — minimum escrow for the planned lifecycle. */
export const MIN_EMPLOYER_PFT_RAW = 1_000_000n;
export const PFT_ESCROW_RAW = 1_000_000n;

export const PLANNED_CONTRACT = {
  paymentMode: "Milestone" as const,
  /** Product "Immediate" maps to on-chain StartMode OnActivation. */
  startMode: "OnActivation" as const,
  totalAmount: PFT_ESCROW_RAW,
  trialAmount: 0n,
  reviewDuration: 3600,
  maxRevisions: 2,
  milestoneCount: 1,
  milestoneAmount: PFT_ESCROW_RAW,
};

export function repoRootFromScript(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // frontend/scripts/n4-devnet-e2e → repo root
  return path.resolve(here, "../../..");
}

export function n4E2eDir(root = repoRootFromScript()): string {
  return path.join(root, ".local", "n4-e2e");
}

export function employerKeypairPath(root = repoRootFromScript()): string {
  return path.join(n4E2eDir(root), "n4-e2e-employer-keypair.json");
}

export function freelancerKeypairPath(root = repoRootFromScript()): string {
  return path.join(n4E2eDir(root), "n4-e2e-freelancer-keypair.json");
}

export function expectedResolver(): string {
  const resolver = DEVNET_CLUSTER.resolver;
  if (!resolver) {
    throw new Error("DEVNET_CLUSTER.resolver is not configured.");
  }
  return resolver;
}

export function assertDevnetClusterBundle(): void {
  if (DEVNET_CLUSTER.id !== "devnet") {
    throw new Error(`DEVNET_CLUSTER.id must be devnet, got ${DEVNET_CLUSTER.id}`);
  }
  if (DEVNET_CLUSTER.programId !== EXPECTED_PROGRAM) {
    throw new Error(
      `DEVNET_CLUSTER.programId mismatch: ${DEVNET_CLUSTER.programId}`
    );
  }
  if (DEVNET_CLUSTER.paymentMint !== EXPECTED_MINT) {
    throw new Error(
      `DEVNET_CLUSTER.paymentMint mismatch: ${DEVNET_CLUSTER.paymentMint}`
    );
  }
  if (DEVNET_CLUSTER.paymentMintDecimals !== EXPECTED_MINT_DECIMALS) {
    throw new Error(
      `DEVNET_CLUSTER.paymentMintDecimals mismatch: ${DEVNET_CLUSTER.paymentMintDecimals}`
    );
  }
}
