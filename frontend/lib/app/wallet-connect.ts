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

/**
 * Null-safe wallet list. The adapter context, a wallet-standard registry
 * event or a half-initialised extension can briefly expose an undefined or
 * sparse list; every caller iterates through this instead of `wallets.some`.
 */
export function safeWalletList<T>(list: readonly (T | null | undefined)[] | null | undefined): T[] {
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is T => item != null);
}

type WalletLike = { readyState?: unknown; adapter?: { name?: unknown } | null } | null | undefined;

/** Names of wallets detected as installed; tolerates missing adapters / names. */
export function installedWalletNames(wallets: readonly WalletLike[] | null | undefined): string[] {
  return safeWalletList(wallets)
    .filter((w) => String(w?.readyState) === "Installed")
    .map((w) => (typeof w?.adapter?.name === "string" ? w.adapter.name : ""))
    .filter((name) => name.length > 0);
}

/**
 * How the provider-level onError reports an adapter error. Nothing here is
 * fatal: a rejection is silent (the user chose it), a missing wallet is
 * informational, and anything else (e.g. an extension-internal TypeError
 * wrapped in WalletConnectionError) is a warning, never a thrown/console.error
 * crash overlay.
 */
export type WalletErrorReport = "silent" | "info" | "warn";

export function walletErrorReport(err: unknown): WalletErrorReport {
  const failure = walletConnectFailure(err);
  if (failure.kind === "rejected") return "silent";
  if (failure.kind === "not_installed") return "info";
  return "warn";
}

/**
 * One browser session = one active wallet. Switching wallets always
 * disconnects the current adapter first, then opens the picker; the newly
 * picked wallet replaces it (never two connected wallets / roles at once).
 */
export type WalletSwitchStep = "disconnect_then_pick" | "pick";

export function walletSwitchStep(input: { connected: boolean; selected: boolean }): WalletSwitchStep {
  return input.connected || input.selected ? "disconnect_then_pick" : "pick";
}
