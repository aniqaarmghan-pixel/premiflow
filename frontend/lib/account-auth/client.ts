"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser-side PREMIFLOW account authentication.
 *
 * This represents the user's website account identity and is intentionally
 * separate from Solana wallet connection / wallet verification.
 */
export const accountAuthClient = createAuthClient({
  basePath: "/api/account-auth",
});

/**
 * Re-fetch the cached session (all useSession consumers). The server clears
 * an expired session cookie on get-session, so this also drops stale state.
 */
export function refreshAccountSession(): void {
  accountAuthClient.$store.notify("$sessionSignal");
}

export const {
  signIn,
  signOut,
  signUp,
  useSession,
} = accountAuthClient;
