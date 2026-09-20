import { PublicKey } from "@solana/web3.js";

import { hashNonce, hashSessionToken, randomId, randomToken } from "../crypto";
import { RateLimitedError, RATE_LIMITS, challengeBucket, consumeRateLimit, verifyBucket } from "../rate-limit";
import type { AuthStore, RateLimitStore, SessionRecord } from "../stores";
import { buildAuthChallengeMessage, challengeMatchesApp } from "./challenge-message";
import { verifyWalletMessageSignature } from "./verify-signature";

export class AuthError extends Error {
  constructor(
    readonly code:
      | "invalid_wallet"
      | "invalid_challenge"
      | "expired_challenge"
      | "consumed_challenge"
      | "invalid_signature"
      | "unauthenticated"
      | "expired_session"
      | "revoked_session",
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthServiceConfig = {
  appOrigin: string;
  sessionSecret: string;
  challengeTtlSeconds: number;
  sessionTtlSeconds: number;
};

function parseWallet(raw: string): string {
  try {
    return new PublicKey(raw.trim()).toBase58();
  } catch {
    throw new AuthError("invalid_wallet", "Wallet address is invalid.");
  }
}

export async function createAuthChallenge(
  stores: { auth: AuthStore; rates: RateLimitStore },
  config: AuthServiceConfig,
  walletRaw: string,
  now = new Date()
): Promise<{ challengeId: string; message: string; expiresAt: string }> {
  const wallet = parseWallet(walletRaw);
  const latest = await stores.auth.latestChallengeForWallet(wallet);
  if (
    latest &&
    now.getTime() - latest.createdAt.getTime() < RATE_LIMITS.challengeIntervalMs
  ) {
    throw new RateLimitedError();
  }
  await consumeRateLimit(
    stores.rates,
    challengeBucket(wallet),
    1,
    RATE_LIMITS.challengeIntervalMs,
    now
  );
  const nonce = randomToken(24);
  const expiresAt = new Date(now.getTime() + config.challengeTtlSeconds * 1000);
  const message = buildAuthChallengeMessage({
    appOrigin: config.appOrigin,
    wallet,
    nonce,
    issuedAt: now,
    expiresAt,
  });
  const id = randomId();
  await stores.auth.insertChallenge({
    id,
    walletAddress: wallet,
    nonceHash: hashNonce(nonce),
    message,
    createdAt: now,
    expiresAt,
    consumedAt: null,
  });
  return { challengeId: id, message, expiresAt: expiresAt.toISOString() };
}

export async function verifyAuthChallenge(
  stores: { auth: AuthStore; rates: RateLimitStore },
  config: AuthServiceConfig,
  input: { challengeId: string; signature: string },
  now = new Date()
): Promise<{ token: string; wallet: string; expiresAt: Date }> {
  const challenge = await stores.auth.getChallenge(input.challengeId);
  if (!challenge) {
    await consumeRateLimit(
      stores.rates,
      "verify:unknown",
      RATE_LIMITS.verifyMax,
      RATE_LIMITS.verifyWindowMs,
      now
    );
    throw new AuthError("invalid_challenge", "That verification request is not valid.");
  }
  await consumeRateLimit(
    stores.rates,
    verifyBucket(challenge.walletAddress),
    RATE_LIMITS.verifyMax,
    RATE_LIMITS.verifyWindowMs,
    now
  );
  if (!challengeMatchesApp(challenge.message, config.appOrigin)) {
    throw new AuthError("invalid_challenge", "That verification request is not valid.");
  }
  if (challenge.consumedAt) {
    throw new AuthError("consumed_challenge", "That verification request was already used.");
  }
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    throw new AuthError("expired_challenge", "That verification request has expired.");
  }
  const ok = verifyWalletMessageSignature({
    wallet: challenge.walletAddress,
    message: challenge.message,
    signature: input.signature,
  });
  if (!ok) {
    throw new AuthError("invalid_signature", "Wallet signature could not be verified.");
  }
  const consumed = await stores.auth.consumeChallenge(challenge.id, now);
  if (!consumed) {
    throw new AuthError("consumed_challenge", "That verification request was already used.");
  }
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + config.sessionTtlSeconds * 1000);
  await stores.auth.insertSession({
    id: randomId(),
    tokenHash: hashSessionToken(config.sessionSecret, token),
    walletAddress: challenge.walletAddress,
    createdAt: now,
    expiresAt,
    revokedAt: null,
  });
  return { token, wallet: challenge.walletAddress, expiresAt };
}

export function sessionStatus(
  session: SessionRecord | null,
  now = new Date()
): SessionRecord {
  if (!session) {
    throw new AuthError("unauthenticated", "Verify your wallet to continue.");
  }
  if (session.revokedAt) {
    throw new AuthError("revoked_session", "Verification expired. Verify your wallet again.");
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    throw new AuthError("expired_session", "Verification expired. Verify your wallet again.");
  }
  return session;
}

export async function readSession(
  store: AuthStore,
  config: Pick<AuthServiceConfig, "sessionSecret">,
  token: string | null,
  now = new Date()
): Promise<SessionRecord> {
  if (!token) {
    throw new AuthError("unauthenticated", "Verify your wallet to continue.");
  }
  const session = await store.getSessionByTokenHash(
    hashSessionToken(config.sessionSecret, token)
  );
  return sessionStatus(session, now);
}

export async function logoutSession(
  store: AuthStore,
  config: Pick<AuthServiceConfig, "sessionSecret">,
  token: string | null,
  now = new Date()
): Promise<void> {
  if (!token) return;
  const session = await store.getSessionByTokenHash(
    hashSessionToken(config.sessionSecret, token)
  );
  if (session) await store.revokeSession(session.id, now);
}
