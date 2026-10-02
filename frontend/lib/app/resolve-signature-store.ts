/**
 * Local record of the confirmed resolve_dispute signature, so "View transaction"
 * links only to a real signature this browser actually saw confirmed.
 * No server or database storage; nothing is invented when absent.
 */
export type SignatureStorage = Pick<Storage, "getItem" | "setItem">;

export const RESOLVE_SIGNATURE_PREFIX = "premiflow:resolve-signature:v1:";
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

export function isRealSignature(value: unknown): value is string {
  return typeof value === "string" && BASE58_SIGNATURE.test(value);
}

export function resolveSignatureKey(cluster: string, contract: string): string {
  return `${RESOLVE_SIGNATURE_PREFIX}${cluster}:${contract}`;
}

export function browserSignatureStorage(): SignatureStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Call only after the resolve transaction is confirmed. Never throws. */
export function recordResolveSignature(
  storage: SignatureStorage | null,
  cluster: string,
  contract: string,
  signature: string,
  nowMs: number = Date.now()
): boolean {
  if (!storage || !isRealSignature(signature)) return false;
  try {
    storage.setItem(
      resolveSignatureKey(cluster, contract),
      JSON.stringify({ signature, recordedAt: nowMs })
    );
    return true;
  } catch {
    return false;
  }
}

/** Returns a stored real signature or null. Corrupt data is ignored. */
export function readResolveSignature(
  storage: SignatureStorage | null,
  cluster: string,
  contract: string
): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(resolveSignatureKey(cluster, contract));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const signature = (parsed as { signature?: unknown }).signature;
    return isRealSignature(signature) ? signature : null;
  } catch {
    return null;
  }
}
