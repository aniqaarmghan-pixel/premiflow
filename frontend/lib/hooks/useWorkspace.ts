"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useSyncExternalStore } from "react";

import {
  canSwitchWorkspace,
  parseWorkspaceSnapshot,
  resolveWorkspaceMode,
  type WorkspaceMode,
} from "@/lib/app/resolver-workspace";
import {
  subscribeWorkspace,
  workspaceSnapshot,
  writeWorkspaceMode,
} from "@/lib/app/workspace-store";

/**
 * Party vs resolver workspace for the connected wallet (local preference).
 * Admins never need this switch: the shell gives them the Admin workspace.
 */
export function useWorkspace() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const snapshot = useSyncExternalStore(
    subscribeWorkspace,
    () => (wallet ? workspaceSnapshot(wallet) : "||"),
    () => "||"
  );
  const parsed = parseWorkspaceSnapshot(snapshot);
  const mode = resolveWorkspaceMode(parsed);
  const toggle = (): WorkspaceMode => {
    const next: WorkspaceMode = mode === "resolver" ? "party" : "resolver";
    if (wallet) writeWorkspaceMode(wallet, next);
    return next;
  };
  return {
    mode,
    canSwitch: wallet != null && canSwitchWorkspace(parsed.resolverCaseCount),
    resolverCaseCount: parsed.resolverCaseCount,
    toggle,
  };
}
