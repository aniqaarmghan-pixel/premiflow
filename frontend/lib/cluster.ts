/**
 * Authoritative PREMIFLOW cluster configuration bundles.
 *
 * Devnet is the only fully configured, active development cluster.
 * Mainnet Beta is reserved for a complete future bundle (RPC + program +
 * mint + resolver + explorer). Mixed Devnet/Mainnet values are never allowed.
 */

export type PremiflowClusterId = "devnet" | "mainnet-beta";

export type PremiflowClusterBundle = {
  id: PremiflowClusterId;
  label: string;
  /** Explorer query value (`?cluster=`). Empty string means mainnet default. */
  explorerCluster: string;
  description: string;
  /**
   * True only when every required field for safe transactions is present.
   * Server RPC for that cluster must also be configured before enabling.
   */
  configured: boolean;
  programId: string | null;
  paymentMint: string | null;
  paymentMintDecimals: number | null;
  resolver: string | null;
};

/** Locked Devnet program / mint / resolver — matches live PREMIFLOW config. */
export const DEVNET_CLUSTER: PremiflowClusterBundle = {
  id: "devnet",
  label: "Devnet",
  explorerCluster: "devnet",
  description: "Active development network",
  configured: true,
  programId: "EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd",
  paymentMint: "9JTBN7QLcoam7LkN44YDhtMQsYt4zKLW7KUE4FscgZtx",
  paymentMintDecimals: 6,
  resolver: "BiSDjVKLTHm4nLVCtpaibahpoqF4nXLsZ8iBBUr3nKaF",
};

/** Placeholder until a complete Mainnet bundle exists. Not selectable. */
export const MAINNET_CLUSTER: PremiflowClusterBundle = {
  id: "mainnet-beta",
  label: "Mainnet Beta",
  explorerCluster: "",
  description: "Not configured yet",
  configured: false,
  programId: null,
  paymentMint: null,
  paymentMintDecimals: null,
  resolver: null,
};

export const PREMIFLOW_CLUSTERS: Record<PremiflowClusterId, PremiflowClusterBundle> = {
  devnet: DEVNET_CLUSTER,
  "mainnet-beta": MAINNET_CLUSTER,
};

/** Safe default for current development. Do not silently switch. */
export const ACTIVE_CLUSTER_ID: PremiflowClusterId = "devnet";

export function getClusterBundle(id: PremiflowClusterId): PremiflowClusterBundle {
  return PREMIFLOW_CLUSTERS[id];
}

export function getActiveCluster(): PremiflowClusterBundle {
  return getClusterBundle(ACTIVE_CLUSTER_ID);
}

export function isClusterTransactionReady(id: PremiflowClusterId): boolean {
  const bundle = getClusterBundle(id);
  return (
    bundle.configured &&
    Boolean(bundle.programId) &&
    Boolean(bundle.paymentMint) &&
    bundle.paymentMintDecimals != null &&
    Boolean(bundle.resolver)
  );
}

export function canSelectCluster(id: PremiflowClusterId): boolean {
  return id === ACTIVE_CLUSTER_ID && isClusterTransactionReady(id);
}

/**
 * Rejects mixed / incomplete cluster bundles before any future Mainnet enablement.
 */
export function assertClusterBundleIntegrity(bundle: PremiflowClusterBundle): string | null {
  const hasAny =
    Boolean(bundle.programId) ||
    Boolean(bundle.paymentMint) ||
    Boolean(bundle.resolver) ||
    bundle.paymentMintDecimals != null;
  const hasAll =
    Boolean(bundle.programId) &&
    Boolean(bundle.paymentMint) &&
    bundle.paymentMintDecimals != null &&
    Boolean(bundle.resolver);

  if (bundle.configured && !hasAll) {
    return `${bundle.label} is marked configured but missing program, mint, decimals, or resolver.`;
  }
  if (!bundle.configured && hasAny && !hasAll) {
    return `${bundle.label} has a partial configuration — mixed incomplete bundles are not allowed.`;
  }
  if (bundle.configured && bundle.id !== "devnet" && bundle.id !== "mainnet-beta") {
    return `Unknown cluster id: ${bundle.id}`;
  }
  return null;
}

export function networkMenuItems(activeId: PremiflowClusterId = ACTIVE_CLUSTER_ID) {
  return (Object.values(PREMIFLOW_CLUSTERS) as PremiflowClusterBundle[]).map((bundle) => ({
    id: bundle.id,
    label: bundle.label,
    description: bundle.description,
    active: bundle.id === activeId,
    selectable: canSelectCluster(bundle.id),
    configured: bundle.configured,
  }));
}
