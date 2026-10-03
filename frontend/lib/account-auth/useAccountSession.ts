"use client";

import { useEffect, useSyncExternalStore } from "react";

import { useSession } from "./client";
import {
  SESSION_RETRY_LIMIT,
  classifySessionCheck,
  createSessionMemory,
  sessionRetryDelayMs,
  shouldRetrySessionCheck,
  type SessionCheckStatus,
} from "./session-state";

type RawSession = ReturnType<typeof useSession>;
export type AccountUser = NonNullable<RawSession["data"]>["user"];

const memory = createSessionMemory<AccountUser>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Better Auth useSession with transient-failure resilience:
 * - 5xx / network / timeout keeps the last confirmed user and retries with
 *   capped exponential backoff (SESSION_RETRY_LIMIT tries);
 * - only a genuine 401 or an empty session response signs the tab out.
 * Same Better Auth client, cookies and endpoints; no auth architecture change.
 */
export function useAccountSession() {
  const raw = useSession();
  const snapshot = useSyncExternalStore(memory.subscribe, memory.getSnapshot, memory.getSnapshot);
  const liveUser = raw.data?.user ?? null;
  const status: SessionCheckStatus = classifySessionCheck({
    hasUser: Boolean(liveUser),
    isPending: raw.isPending,
    error: raw.error,
  });
  const refetch = raw.refetch;

  useEffect(() => {
    if (status === "authenticated" && liveUser) {
      memory.confirm(liveUser);
    } else if (status === "unauthenticated") {
      memory.clear();
    }
  }, [status, liveUser]);

  useEffect(() => {
    if (!shouldRetrySessionCheck(status, snapshot.attempts) || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      memory.recordAttempt();
      void refetch();
    }, sessionRetryDelayMs(snapshot.attempts));
  }, [status, snapshot.attempts, refetch]);

  const user = liveUser ?? (status === "unavailable" ? snapshot.user : null);
  const exhausted = status === "unavailable" && snapshot.attempts >= SESSION_RETRY_LIMIT;
  return {
    data: user ? { user } : null,
    user,
    status,
    /** Still deciding: initial check, or retrying a transient failure with no known user. */
    isPending: status === "pending" || (status === "unavailable" && !user && !exhausted),
    /** A transient failure is being retried (the user stays signed in). */
    reconnecting: status === "unavailable",
    exhausted,
    retry: () => {
      memory.resetAttempts();
      void refetch();
    },
  };
}
