/**
 * User-facing copy for PREMIFLOW account (email/password) auth failures.
 *
 * Only Better Auth's INVALID_EMAIL_OR_PASSWORD code may produce credential
 * wording. Expired sessions (401), blocked origin/CSRF checks (403), rate
 * limits (429), server/database failures (5xx, often an empty body) and
 * network errors each get their own message, so a transient failure is never
 * reported as "wrong email or password".
 */

export type AccountAuthErrorKind =
  | "invalid_credentials"
  | "email_not_verified"
  | "rate_limited"
  | "request_blocked"
  | "session_expired"
  | "server_unavailable"
  | "network"
  | "unknown";

export type AccountAuthErrorLike = {
  status?: number | null;
  statusText?: string | null;
  code?: string | null;
  message?: string | null;
};

export type AccountAuthContext = "sign_in" | "sign_up";

export const ACCOUNT_AUTH_ERROR_COPY: Record<AccountAuthErrorKind, string> = {
  invalid_credentials: "Incorrect email or password.",
  email_not_verified: "Verify your email address before signing in.",
  rate_limited: "Too many attempts. Wait a few seconds and try again.",
  request_blocked:
    "This request was blocked by a security check. Reload the page and try again.",
  session_expired: "Your session expired. Please sign in again.",
  server_unavailable:
    "PREMIFLOW sign-in is temporarily unavailable. Please try again in a moment.",
  network: "We could not reach PREMIFLOW. Check your connection and try again.",
  unknown: "We could not sign you in. Please try again.",
};

const SIGN_UP_FALLBACK = "We could not create your PREMIFLOW account. Please try again.";

const CREDENTIAL_WORDING = /email or password|wrong password|incorrect password/i;

export function classifyAccountAuthError(
  error: AccountAuthErrorLike | null | undefined
): AccountAuthErrorKind {
  if (!error) return "unknown";
  const code = (error.code ?? "").toUpperCase();
  const status = typeof error.status === "number" ? error.status : 0;
  const text = `${error.message ?? ""} ${error.statusText ?? ""}`.toLowerCase();

  if (code === "INVALID_EMAIL_OR_PASSWORD") return "invalid_credentials";
  if (code === "EMAIL_NOT_VERIFIED") return "email_not_verified";
  if (status === 429 || code.includes("RATE_LIMIT") || code.includes("TOO_MANY")) {
    return "rate_limited";
  }
  if (
    status === 403 ||
    code.includes("ORIGIN") ||
    code.includes("CSRF") ||
    text.includes("invalid origin") ||
    text.includes("csrf")
  ) {
    return "request_blocked";
  }
  if (status === 401) return "session_expired";
  if (status >= 500) return "server_unavailable";
  if (status === 0) return "network";
  return "unknown";
}

/** fetch() rejections (offline, DNS, aborted) are network failures. */
export function classifyThrownAccountAuthError(err: unknown): AccountAuthErrorKind {
  if (err instanceof TypeError) return "network";
  if (err && typeof err === "object" && (err as { name?: unknown }).name === "AbortError") {
    return "network";
  }
  return "unknown";
}

export function accountAuthErrorMessage(
  error: AccountAuthErrorLike | null | undefined,
  context: AccountAuthContext = "sign_in"
): string {
  const kind = classifyAccountAuthError(error);
  if (kind !== "unknown") return ACCOUNT_AUTH_ERROR_COPY[kind];
  // Validation messages (e.g. "User already exists") are safe to surface,
  // but never credential wording without the explicit credential code.
  const message = error?.message?.trim();
  if (message && !CREDENTIAL_WORDING.test(message)) return message;
  return context === "sign_up" ? SIGN_UP_FALLBACK : ACCOUNT_AUTH_ERROR_COPY.unknown;
}

export function accountAuthFallbackMessage(
  kind: AccountAuthErrorKind,
  context: AccountAuthContext = "sign_in"
): string {
  if (kind === "unknown" && context === "sign_up") return SIGN_UP_FALLBACK;
  return ACCOUNT_AUTH_ERROR_COPY[kind];
}

export function isRetryableAccountAuthError(kind: AccountAuthErrorKind): boolean {
  return kind === "network" || kind === "server_unavailable";
}
