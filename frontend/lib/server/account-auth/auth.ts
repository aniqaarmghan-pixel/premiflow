import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { getAccountAuthDb } from "./db";
import { getAccountAuthEnv } from "./env";
import * as schema from "./schema";

export type AccountAuth = ReturnType<typeof createAccountAuth>;

function createAccountAuth() {
  const env = getAccountAuthEnv();
  const db = getAccountAuthDb();

  return betterAuth({
    appName: "PREMIFLOW",
    baseURL: env.appOrigin,
    basePath: "/api/account-auth",
    secret: env.authSecret,

    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      schemaName: "account_auth",
      usePlural: false,
    }),

    trustedOrigins: [env.appOrigin],

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,

      // Turn this on when PREMIFLOW email delivery is configured.
      requireEmailVerification: false,
    },
  });
}

let cached: AccountAuth | null = null;

/**
 * Lazy Better Auth instance.
 *
 * Account authentication remains separate from PREMIFLOW's existing
 * Solana wallet challenge/session authentication.
 */
export function getAccountAuth(): AccountAuth {
  if (!cached) cached = createAccountAuth();
  return cached;
}

export function resetAccountAuthForTests(): void {
  cached = null;
}
