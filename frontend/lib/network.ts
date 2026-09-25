import type { ConnectionConfig } from "@solana/web3.js";

import {
  ACTIVE_CLUSTER_ID,
  getActiveCluster,
  type PremiflowClusterId,
} from "@/lib/cluster";

/** Same-origin App Router proxy. The private RPC URL never leaves the server. */
export const RPC_PROXY_PATH = "/api/rpc";

/**
 * web3.js Connection requires an absolute URL (`new URL(endpoint)`).
 * A relative "/api/rpc" throws. SSR has no window, so use a local absolute
 * placeholder that is replaced on the client with the real origin.
 */
export function browserRpcEndpoint(): string {
  if (typeof window === "undefined") {
    return `http://127.0.0.1${RPC_PROXY_PATH}`;
  }
  return `${window.location.origin}${RPC_PROXY_PATH}`;
}

/**
 * HTTP-only proxy. If wsEndpoint is omitted, web3.js rewrites the HTTP URL
 * to wss://<origin>/api/rpc, which this route does not serve.
 * V2 confirmation polls getSignatureStatuses over HTTP and does not use this
 * dummy socket. It remains only so Connection does not rewrite the HTTP URL.
 */
export const RPC_CONNECTION_CONFIG: ConnectionConfig = {
  commitment: "confirmed",
  wsEndpoint: "wss://127.0.0.1:1",
};

const active = getActiveCluster();

/**
 * Active PREMIFLOW network surface. Always derived from the cluster bundle —
 * never a free-floating badge string.
 */
export const NETWORK = {
  cluster: active.id as PremiflowClusterId,
  label: active.label,
  endpoint: RPC_PROXY_PATH,
  explorerCluster: active.explorerCluster || "mainnet",
  activeClusterId: ACTIVE_CLUSTER_ID,
} as const;

export function explorerTxUrl(signature: string): string {
  const cluster = NETWORK.explorerCluster;
  const query = cluster && cluster !== "mainnet" ? `?cluster=${cluster}` : "";
  return `https://explorer.solana.com/tx/${signature}${query}`;
}

export function explorerAddressUrl(address: string): string {
  const cluster = NETWORK.explorerCluster;
  const query = cluster && cluster !== "mainnet" ? `?cluster=${cluster}` : "";
  return `https://explorer.solana.com/address/${address}${query}`;
}

export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/**
 * Header wallet label — only a shortened address when adapter reports
 * connected + publicKey. Never show a remembered address while disconnected.
 */
export function walletControlLabel(input: {
  connected: boolean;
  publicKeyBase58: string | null | undefined;
}): string {
  if (input.connected && input.publicKeyBase58) {
    return shortenAddress(input.publicKeyBase58);
  }
  return "Connect wallet";
}

export function isWalletUiConnected(input: {
  connected: boolean;
  publicKeyBase58: string | null | undefined;
}): boolean {
  return Boolean(input.connected && input.publicKeyBase58);
}
