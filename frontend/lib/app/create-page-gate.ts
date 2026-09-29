/**
 * /create page gate. Once the wizard has started for a wallet it stays mounted
 * (hidden) across transient wallet disconnects, so the in-progress draft is not
 * lost; the connect prompt is shown instead and creation is unavailable while
 * disconnected. Switching to a different wallet remounts the wizard.
 */
export type CreatePageView = {
  /** Keep <CreateWizard /> in the tree (preserves its draft state). */
  mountWizard: boolean;
  /** Wizard visible and usable. */
  showWizard: boolean;
  showConnectPrompt: boolean;
};

export function createPageView(params: {
  connected: boolean;
  wizardStarted: boolean;
}): CreatePageView {
  const { connected, wizardStarted } = params;
  return {
    mountWizard: connected || wizardStarted,
    showWizard: connected,
    showConnectPrompt: !connected,
  };
}

/** Wallet that owns the mounted wizard: the connected wallet, else the previous owner. */
export function nextWizardOwner(
  previous: string | null,
  connected: boolean,
  walletKey: string | null
): string | null {
  if (connected && walletKey) return walletKey;
  return previous;
}
