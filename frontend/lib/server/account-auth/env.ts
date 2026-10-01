export type AccountAuthEnv = {
  databaseUrl: string;
  appOrigin: string;
  authSecret: string;
  googleClientId: string | null;
  googleClientSecret: string | null;
};

export class AccountAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountAuthConfigError";
  }
}

function normalizeOrigin(raw: string): string {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new AccountAuthConfigError("APP_ORIGIN is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AccountAuthConfigError(
      "APP_ORIGIN must be an http or https origin."
    );
  }

  return url.origin;
}

function readEnv(): AccountAuthEnv {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const appOriginRaw = process.env.APP_ORIGIN?.trim();
  const authSecret = process.env.ACCOUNT_AUTH_SECRET?.trim();
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || null;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || null;

  if (!databaseUrl || !appOriginRaw || !authSecret) {
    throw new AccountAuthConfigError(
      "PREMIFLOW account authentication configuration is incomplete."
    );
  }

  if (authSecret.length < 32) {
    throw new AccountAuthConfigError(
      "ACCOUNT_AUTH_SECRET must be at least 32 characters."
    );
  }

  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    throw new AccountAuthConfigError(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together."
    );
  }

  return {
    databaseUrl,
    appOrigin: normalizeOrigin(appOriginRaw),
    authSecret,
    googleClientId,
    googleClientSecret,
  };
}

let cached: AccountAuthEnv | null = null;

/**
 * Lazy account-auth configuration.
 *
 * Kept separate from the existing wallet-auth/Solana environment so an
 * account session does not depend on Solana RPC availability.
 */
export function getAccountAuthEnv(): AccountAuthEnv {
  if (!cached) cached = readEnv();
  return cached;
}

export function resetAccountAuthEnvForTests(): void {
  cached = null;
}
