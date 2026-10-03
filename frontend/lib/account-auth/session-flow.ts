import {
  accountAuthErrorMessage,
  accountAuthFallbackMessage,
  classifyAccountAuthError,
  classifyThrownAccountAuthError,
  isRetryableAccountAuthError,
  type AccountAuthContext,
  type AccountAuthErrorKind,
  type AccountAuthErrorLike,
} from "./errors";

export type AccountAuthCallResult = { error?: AccountAuthErrorLike | null } | null | undefined;

export type AccountAuthFlowResult =
  | { ok: true }
  | { ok: false; kind: AccountAuthErrorKind; message: string };

/** Capped exponential backoff: base, 2x base, 4x base ... never above cap. */
export function accountAuthRetryDelayMs(attempt: number, baseMs = 800, capMs = 4000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
}
async function safeRefresh(refresh: () => unknown): Promise<void> {
  try {
    await refresh();
  } catch {
    // A failed session refetch must never block sign-in or sign-out.
  }
}

/**
 * Runs one Better Auth email call (sign-in / sign-up). Transient network or
 * server failures retry `retries` times; credentials are never stored here or
 * in browser storage. The cached client session is always refreshed
 * afterwards so a stale or expired session cannot linger in this tab.
 */
export async function runAccountAuthCall(input: {
  call: () => Promise<AccountAuthCallResult>;
  refreshSession: () => unknown;
  context?: AccountAuthContext;
  retries?: number;
  retryDelayMs?: number;
  /** Upper bound for the exponential backoff between attempts. */
  maxRetryDelayMs?: number;
  wait?: (ms: number) => Promise<void>;
}): Promise<AccountAuthFlowResult> {
  const context = input.context ?? "sign_in";
  const retries = Math.max(0, input.retries ?? 0);
  const wait = input.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: AccountAuthFlowResult = {
    ok: false,
    kind: "unknown",
    message: accountAuthFallbackMessage("unknown", context),
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await input.call();
      const error = result?.error ?? null;
      if (!error) {
        await safeRefresh(input.refreshSession);
        return { ok: true };
      }
      last = {
        ok: false,
        kind: classifyAccountAuthError(error),
        message: accountAuthErrorMessage(error, context),
      };
    } catch (err) {
      const kind = classifyThrownAccountAuthError(err);
      last = { ok: false, kind, message: accountAuthFallbackMessage(kind, context) };
    }
    if (!isRetryableAccountAuthError(last.kind) || attempt === retries) break;
    await wait(accountAuthRetryDelayMs(attempt, input.retryDelayMs ?? 800, input.maxRetryDelayMs ?? 4000));
  }

  await safeRefresh(input.refreshSession);
  return last;
}

/**
 * Full logout: revoke the server account session (Better Auth deletes the
 * cookie), clear the wallet-auth cookie, then refresh the cached client
 * session (Better Auth broadcasts the sign-out to other tabs).
 */
export async function runAccountSignOut(input: {
  signOut: () => Promise<AccountAuthCallResult>;
  clearWalletSession: () => Promise<unknown>;
  refreshSession: () => unknown;
}): Promise<{ serverCleared: boolean }> {
  let serverCleared = true;
  try {
    const result = await input.signOut();
    if (result?.error) serverCleared = false;
  } catch {
    serverCleared = false;
  }
  try {
    await input.clearWalletSession();
  } catch {
    // No wallet session is fine.
  }
  await safeRefresh(input.refreshSession);
  return { serverCleared };
}
