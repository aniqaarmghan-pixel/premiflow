/**
 * Pure rules for interpreting a Better Auth session check in the browser.
 *
 * A transient failure (Neon cold start, 5xx, fetch failed, timeout, offline)
 * must never look like "signed out". Only a genuine 401 (expired / revoked
 * session) or a successful response with no session clears the account.
 */
export type SessionCheckStatus = "pending" | "authenticated" | "unauthenticated" | "unavailable";

export type SessionErrorLike = {
  status?: number | null;
  name?: string | null;
  message?: string | null;
} | null | undefined;

/** "expired" only for a real 401; everything else is a transient failure. */
export function classifySessionError(error: SessionErrorLike): "expired" | "transient" | null {
  if (!error) return null;
  const status = typeof error.status === "number" ? error.status : 0;
  if (status === 401) return "expired";
  return "transient";
}

export function classifySessionCheck(input: {
  hasUser: boolean;
  isPending: boolean;
  error: SessionErrorLike;
}): SessionCheckStatus {
  if (input.hasUser) return "authenticated";
  if (input.isPending) return "pending";
  const kind = classifySessionError(input.error);
  if (kind === "transient") return "unavailable";
  return "unauthenticated";
}

/** Bounded retry policy for transient session-check failures. */
export const SESSION_RETRY_LIMIT = 3;
export const SESSION_RETRY_BASE_MS = 1000;
export const SESSION_RETRY_CAP_MS = 8000;

export function sessionRetryDelayMs(
  attempt: number,
  baseMs: number = SESSION_RETRY_BASE_MS,
  capMs: number = SESSION_RETRY_CAP_MS
): number {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(capMs, baseMs * 2 ** n);
}

export function shouldRetrySessionCheck(status: SessionCheckStatus, attempts: number): boolean {
  return status === "unavailable" && attempts < SESSION_RETRY_LIMIT;
}

/**
 * Tab-wide memory of the last confirmed account user, shared by every
 * consumer so a transient failure in one place cannot sign the tab out.
 */
export type SessionMemorySnapshot<U> = { user: U | null; attempts: number };

export function createSessionMemory<U>() {
  let snapshot: SessionMemorySnapshot<U> = { user: null, attempts: 0 };
  const listeners = new Set<() => void>();
  const emit = (next: SessionMemorySnapshot<U>) => {
    if (next.user === snapshot.user && next.attempts === snapshot.attempts) return;
    snapshot = next;
    listeners.forEach((l) => l());
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    /** Session confirmed by the server. */
    confirm(user: U) {
      emit({ user, attempts: 0 });
    },
    /** Server said "no session" (or a genuine 401): forget the user. */
    clear() {
      emit({ user: null, attempts: 0 });
    },
    recordAttempt() {
      emit({ user: snapshot.user, attempts: snapshot.attempts + 1 });
    },
    resetAttempts() {
      emit({ user: snapshot.user, attempts: 0 });
    },
  };
}
