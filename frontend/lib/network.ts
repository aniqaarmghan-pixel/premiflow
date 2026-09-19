import type { ConnectionConfig } from "@solana/web3.js";

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
 * Confirmation for the first Fixed create uses HTTP getSignatureStatuses.
 */
export const RPC_CONNECTION_CONFIG: ConnectionConfig = {
  commitment: "confirmed",
  wsEndpoint: "wss://127.0.0.1:1",
};

export const NETWORK = {
  cluster: "devnet" as const,
  label: "Devnet",
  endpoint: RPC_PROXY_PATH,
  explorerCluster: "devnet",
};

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${NETWORK.explorerCluster}`;
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${NETWORK.explorerCluster}`;
}

export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}
