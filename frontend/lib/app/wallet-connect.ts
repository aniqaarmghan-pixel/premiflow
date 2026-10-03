/**
 * Pure decision + error helpers for the contextual "Connect wallet" prompt.
 *
 * The app's WalletProvider runs without autoConnect, so selecting a wallet in
 * the modal only calls select(); nothing connects unless the caller follows
 * up with connect(). These helpers keep that flow explicit and testable.
 */
export const PHANTOM_INSTALL_URL = "https://phantom.app/download";

export type WalletConnectStep =
  | "connected"
  | "busy"
  | "connect"
  | "open_modal"
  | "select_installed"
  | "not_installed";

export function walletConnectStep(input: {
  connected: boolean;
  connecting: boolean;
  /** A wallet adapter is currently selected (may still be disconnected). */
  selected: boolean;
  /** The selected wallet is installed / loadable in this browser. */
  selectedReady: boolean;
  /** Names of wallets detected as installed in this browser. */
  installed: readonly string[];
  /** A WalletModalProvider is mounted above the prompt. */
  hasModal: boolean;
}): WalletConnectStep {
  if (input.connected) return "connected";
  if (input.connecting) return "busy";
  if (input.selected && input.selectedReady) return "connect";
  if (input.hasModal && input.installed.length > 0) return "open_modal";
  if (input.installed.length > 0) return "select_installed";
  if (input.hasModal && !input.selected) return "open_modal";
  return "not_installed";
}

export type WalletConnectFailure = { kind: "rejected" | "not_installed" | "failed"; message: string };

export const WALLET_CONNECT_COPY = {
  rejected: "The connection request was cancelled in your wallet. Try again when you are ready.",
  notInstalled: "No supported Solana wallet was found in this browser. Install Phantom, then reload this page.",
  failed: "Could not connect your wallet. Unlock Phantom and try again.",
} as const;

export function walletConnectFailure(err: unknown): WalletConnectFailure {
  const e = (err ?? {}) as { name?: string; message?: string; error?: { code?: number; message?: string } };
  const name = e.name ?? "";
  const text = `${e.message ?? ""} ${e.error?.message ?? ""}`;
  if (name === "WalletNotReadyError") {
    return { kind: "not_installed", message: WALLET_CONNECT_COPY.notInstalled };
  }
  if (e.error?.code === 4001 || /reject|cancel|denied|declined/i.test(text)) {
    return { kind: "rejected", message: WALLET_CONNECT_COPY.rejected };
  }
  return { kind: "failed", message: WALLET_CONNECT_COPY.failed };
}
