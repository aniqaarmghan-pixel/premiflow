import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { getAccountAuthDb } from "./db";
import { getAccountAuthEnv } from "./env";
import * as schema from "./schema";

export type AccountAuth = ReturnType<typeof createAccountAuth>;

function createAccountAuth() {
  const env = getAccountAuthEnv();
  const db = getAccountAuthDb();

  const socialProviders =
    env.googleClientId && env.googleClientSecret
      ? {
          google: {
            clientId: env.googleClientId,
            clientSecret: env.googleClientSecret,
            prompt: "select_account" as const,
          },
        }
      : undefined;

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

    // Never silently merge an existing PREMIFLOW account merely because
    // a social provider returns the same email address. Existing users can
    // explicitly link Google from their authenticated account later.
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
      },
    },

    ...(socialProviders ? { socialProviders } : {}),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,

      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,

      sendResetPassword: async ({ user, token }) => {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            "Password reset email delivery is not configured for production."
          );
        }

        const resetUrl =
          `${env.appOrigin}/reset-password?token=${encodeURIComponent(token)}`;

        console.info("");
        console.info("====================================================");
        console.info("PREMIFLOW DEV PASSWORD RESET");
        console.info(`Email: ${user.email}`);
        console.info("Open this link in your browser:");
        console.info(resetUrl);
        console.info("====================================================");
        console.info("");
      },

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
