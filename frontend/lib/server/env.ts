export type ServerEnv = {
  solanaRpcUrl: string;
  databaseUrl: string;
  sessionSecret: string;
  appOrigin: string;
  challengeTtlSeconds: number;
  sessionTtlSeconds: number;
};

export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigError";
  }
}

const DEFAULT_CHALLENGE_TTL = 300;
const DEFAULT_SESSION_TTL = 604_800;

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ServerConfigError("A messaging TTL value is invalid.");
  }
  return value;
}

function normalizeOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ServerConfigError("APP_ORIGIN must be an http or https origin.");
  }
  return url.origin;
}

function readEnv(): ServerEnv {
  const solanaRpcUrl = process.env.SOLANA_RPC_URL?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  const appOriginRaw = process.env.APP_ORIGIN?.trim();
  if (!solanaRpcUrl || !databaseUrl || !sessionSecret || !appOriginRaw) {
    throw new ServerConfigError("Messaging server configuration is incomplete.");
  }
  if (sessionSecret.length < 32) {
    throw new ServerConfigError("SESSION_SECRET is too short.");
  }
  return {
    solanaRpcUrl,
    databaseUrl,
    sessionSecret,
    appOrigin: normalizeOrigin(appOriginRaw),
    challengeTtlSeconds: readPositiveInt(
      process.env.AUTH_CHALLENGE_TTL_SECONDS,
      DEFAULT_CHALLENGE_TTL
    ),
    sessionTtlSeconds: readPositiveInt(
      process.env.SESSION_TTL_SECONDS,
      DEFAULT_SESSION_TTL
    ),
  };
}

let cached: ServerEnv | null = null;

/** Lazy. Safe to import during `next build` without DATABASE_URL. */
export function getServerEnv(): ServerEnv {
  if (!cached) cached = readEnv();
  return cached;
}

export function resetServerEnvForTests(): void {
  cached = null;
}

/**
 * Origin for mutating Copilot POSTs. Independent of messaging DATABASE_URL
 * so Create Assistant can run deterministic fallback during tests/build.
 */
export function readAppOrigin(): string {
  const raw = process.env.APP_ORIGIN?.trim();
  if (!raw) {
    throw new ServerConfigError("APP_ORIGIN is not configured.");
  }
  return normalizeOrigin(raw);
}

export function cookieSecureForOrigin(appOrigin: string): boolean {
  return appOrigin.startsWith("https://");
}
