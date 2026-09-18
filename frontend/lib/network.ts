import { clusterApiUrl } from "@solana/web3.js";

export const NETWORK = {
  cluster: "devnet" as const,
  label: "Devnet",
  endpoint: clusterApiUrl("devnet"),
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
