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

export const {
  signIn,
  signOut,
  signUp,
  useSession,
} = accountAuthClient;
