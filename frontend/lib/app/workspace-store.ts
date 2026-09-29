import { parseWorkspaceMode, type WorkspaceMode } from "@/lib/app/resolver-workspace";

/** Local-only workspace preference and resolver capability (per wallet). */
export const WORKSPACE_EVENT = "premiflow:workspace";
const modeKey = (wallet: string) => `premiflow.workspace.mode.${wallet}`;
const capabilityKey = (wallet: string) => `premiflow.workspace.resolver.${wallet}`;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(WORKSPACE_EVENT));
}

export function readWorkspaceMode(wallet: string): WorkspaceMode | null {
  try {
    return parseWorkspaceMode(storage()?.getItem(modeKey(wallet)) ?? null);
  } catch {
    return null;
  }
}

export function writeWorkspaceMode(wallet: string, mode: WorkspaceMode) {
  try {
    storage()?.setItem(modeKey(wallet), mode);
  } catch {
    // Storage unavailable: the choice lasts for this render only.
  }
  notify();
}

export type ResolverCapability = { resolverCaseCount: number; partyContractCount: number | null };

export function readResolverCapability(wallet: string): ResolverCapability {
  const empty = { resolverCaseCount: 0, partyContractCount: null };
  try {
    const raw = storage()?.getItem(capabilityKey(wallet));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as { r?: unknown; p?: unknown };
    return {
      resolverCaseCount: typeof parsed.r === "number" && parsed.r > 0 ? parsed.r : 0,
      partyContractCount: typeof parsed.p === "number" && parsed.p >= 0 ? parsed.p : null,
    };
  } catch {
    return empty;
  }
}

export function writeResolverCapability(wallet: string, capability: ResolverCapability) {
  const raw = JSON.stringify({ r: capability.resolverCaseCount, p: capability.partyContractCount });
  try {
    const s = storage();
    if (!s || s.getItem(capabilityKey(wallet)) === raw) return;
    s.setItem(capabilityKey(wallet), raw);
  } catch {
    return;
  }
  notify();
}

export function workspaceSnapshot(wallet: string): string {
  const mode = readWorkspaceMode(wallet) ?? "";
  const cap = readResolverCapability(wallet);
  return `${mode}|${cap.resolverCaseCount}|${cap.partyContractCount ?? ""}`;
}

export function subscribeWorkspace(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(WORKSPACE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(WORKSPACE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
