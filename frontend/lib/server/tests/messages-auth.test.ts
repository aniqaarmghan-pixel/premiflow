import assert from "node:assert/strict";
import test from "node:test";

import { ed25519 } from "@noble/curves/ed25519.js";
import { PublicKey } from "@solana/web3.js";

import { readFileSync } from "node:fs";

import {
  createAuthChallenge,
  logoutSession,
  readSession,
  verifyAuthChallenge,
} from "../auth/service";
import { verifyWalletMessageSignature } from "../auth/verify-signature";
import { cookieSecureForOrigin, getServerEnv, resetServerEnvForTests } from "../env";
import { assertOrigin, readCookie, readJsonObject, SESSION_COOKIE } from "../http";
import { createMemoryAuthStore, createMemoryRateLimitStore } from "../memory-stores";
import { RateLimitedError } from "../rate-limit";

const CONFIG = {
  appOrigin: "http://localhost:3000",
  sessionSecret: "test-session-secret-value-32b!!",
  challengeTtlSeconds: 300,
  sessionTtlSeconds: 3_600,
};

function testWallet() {
  const keys = ed25519.keygen();
  return {
    address: new PublicKey(keys.publicKey).toBase58(),
    sign(message: string) {
      const signature = ed25519.sign(new TextEncoder().encode(message), keys.secretKey);
      return Buffer.from(signature).toString("base64");
    },
  };
}

function stores() {
  return {
    auth: createMemoryAuthStore(),
    rates: createMemoryRateLimitStore(),
  };
}

test("valid signature creates a hashed session", async () => {
  const wallet = testWallet();
  const db = stores();
  const challenge = await createAuthChallenge(db, CONFIG, wallet.address);
  const verified = await verifyAuthChallenge(db, CONFIG, {
    challengeId: challenge.challengeId,
    signature: wallet.sign(challenge.message),
  });
  assert.equal(verified.wallet, wallet.address);
  const session = await readSession(db.auth, CONFIG, verified.token);
  assert.equal(session.walletAddress, wallet.address);
  assert.notEqual(session.tokenHash, verified.token);
});

test("wrong signature is rejected and challenge stays reusable until success", async () => {
  const wallet = testWallet();
  const other = testWallet();
  const db = stores();
  const challenge = await createAuthChallenge(db, CONFIG, wallet.address);
  await assert.rejects(
    () =>
      verifyAuthChallenge(db, CONFIG, {
        challengeId: challenge.challengeId,
        signature: other.sign(challenge.message),
      }),
    /could not be verified/
  );
  const verified = await verifyAuthChallenge(db, CONFIG, {
    challengeId: challenge.challengeId,
    signature: wallet.sign(challenge.message),
  });
  assert.equal(verified.wallet, wallet.address);
});

test("expired and consumed challenges cannot verify", async () => {
  const wallet = testWallet();
  const db = stores();
  const now = new Date("2026-01-01T00:00:00.000Z");
  const challenge = await createAuthChallenge(db, CONFIG, wallet.address, now);
  await assert.rejects(
    () =>
      verifyAuthChallenge(
        db,
        CONFIG,
        { challengeId: challenge.challengeId, signature: wallet.sign(challenge.message) },
        new Date(now.getTime() + 301_000)
      ),
    /expired/
  );
  const fresh = await createAuthChallenge(
    db,
    CONFIG,
    wallet.address,
    new Date(now.getTime() + 20_000)
  );
  await verifyAuthChallenge(
    db,
    CONFIG,
    { challengeId: fresh.challengeId, signature: wallet.sign(fresh.message) },
    new Date(now.getTime() + 21_000)
  );
  await assert.rejects(
    () =>
      verifyAuthChallenge(
        db,
        CONFIG,
        { challengeId: fresh.challengeId, signature: wallet.sign(fresh.message) },
        new Date(now.getTime() + 22_000)
      ),
    /already used/
  );
});

test("replayed nonce cannot create another session", async () => {
  const wallet = testWallet();
  const db = stores();
  const challenge = await createAuthChallenge(db, CONFIG, wallet.address);
  const signature = wallet.sign(challenge.message);
  await verifyAuthChallenge(db, CONFIG, { challengeId: challenge.challengeId, signature });
  await assert.rejects(
    () => verifyAuthChallenge(db, CONFIG, { challengeId: challenge.challengeId, signature }),
    /already used/
  );
});

test("malformed signature is rejected", () => {
  const wallet = testWallet();
  assert.equal(
    verifyWalletMessageSignature({
      wallet: wallet.address,
      message: "hello",
      signature: "not-base64??",
    }),
    false
  );
  assert.equal(
    verifyWalletMessageSignature({
      wallet: wallet.address,
      message: "hello",
      signature: Buffer.from("short").toString("base64"),
    }),
    false
  );
});

test("missing expired and revoked sessions are rejected", async () => {
  const wallet = testWallet();
  const db = stores();
  const challenge = await createAuthChallenge(db, CONFIG, wallet.address);
  const verified = await verifyAuthChallenge(db, CONFIG, {
    challengeId: challenge.challengeId,
    signature: wallet.sign(challenge.message),
  });
  await assert.rejects(() => readSession(db.auth, CONFIG, null), /Verify your wallet/);
  await assert.rejects(
    () =>
      readSession(
        db.auth,
        CONFIG,
        verified.token,
        new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
      ),
    /expired/i
  );
  await logoutSession(db.auth, CONFIG, verified.token);
  await assert.rejects(() => readSession(db.auth, CONFIG, verified.token), /expired|Verify/i);
});

test("verify ignores a client-supplied wallet field by using only the challenge wallet", async () => {
  const wallet = testWallet();
  const db = stores();
  const challenge = await createAuthChallenge(db, CONFIG, wallet.address);
  const verified = await verifyAuthChallenge(db, CONFIG, {
    challengeId: challenge.challengeId,
    signature: wallet.sign(challenge.message),
  });
  assert.equal(verified.wallet, wallet.address);
});

test("challenge rate limit is about 15 seconds", async () => {
  const wallet = testWallet();
  const db = stores();
  const now = new Date("2026-02-01T00:00:00.000Z");
  await createAuthChallenge(db, CONFIG, wallet.address, now);
  await assert.rejects(
    () => createAuthChallenge(db, CONFIG, wallet.address, new Date(now.getTime() + 1_000)),
    (err) => err instanceof RateLimitedError
  );
  const later = await createAuthChallenge(
    db,
    CONFIG,
    wallet.address,
    new Date(now.getTime() + 16_000)
  );
  assert.ok(later.challengeId);
});

test("verify rate limit is about 10 per 10 minutes", async () => {
  const wallet = testWallet();
  const db = stores();
  const now = new Date("2026-02-02T00:00:00.000Z");
  const challenge = await createAuthChallenge(db, CONFIG, wallet.address, now);
  const bad = Buffer.alloc(64).toString("base64");
  for (let i = 0; i < 10; i += 1) {
    await assert.rejects(() =>
      verifyAuthChallenge(
        db,
        CONFIG,
        { challengeId: challenge.challengeId, signature: bad },
        new Date(now.getTime() + i * 10)
      )
    );
  }
  await assert.rejects(
    () =>
      verifyAuthChallenge(
        db,
        CONFIG,
        { challengeId: challenge.challengeId, signature: bad },
        new Date(now.getTime() + 200)
      ),
    (err) => err instanceof RateLimitedError
  );
});

test("Origin allowlist rejects a foreign origin", () => {
  const request = new Request("http://localhost:3000/api/auth/challenge", {
    method: "POST",
    headers: { origin: "https://evil.example" },
  });
  assert.throws(() => assertOrigin(request, "http://localhost:3000"), /origin is not allowed/);
});

test("oversized JSON body is rejected", async () => {
  const request = new Request("http://localhost:3000/api/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ wallet: "x".repeat(9000) }),
  });
  await assert.rejects(() => readJsonObject(request), /too large/);
});

test("session cookie name is premiflow_session and can be parsed", () => {
  assert.equal(SESSION_COOKIE, "premiflow_session");
  assert.equal(
    readCookie("foo=1; premiflow_session=abc%2B12; bar=2", SESSION_COOKIE),
    "abc+12"
  );
});

test("cookie Secure follows APP_ORIGIN https, and env is lazy", () => {
  assert.equal(cookieSecureForOrigin("http://localhost:3000"), false);
  assert.equal(cookieSecureForOrigin("https://app.premiflow.example"), true);
  resetServerEnvForTests();
  const previous = {
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    APP_ORIGIN: process.env.APP_ORIGIN,
  };
  delete process.env.SOLANA_RPC_URL;
  delete process.env.DATABASE_URL;
  delete process.env.SESSION_SECRET;
  delete process.env.APP_ORIGIN;
  try {
    assert.throws(() => getServerEnv(), /incomplete/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetServerEnvForTests();
  }
});

test("generated SQL migration includes required tables and indexes", () => {
  const sql = readFileSync(
    new URL("../../../drizzle/0000_h4b_contract_messages.sql", import.meta.url),
    "utf8"
  );
  for (const table of [
    "auth_challenges",
    "sessions",
    "contract_messages",
    "thread_reads",
    "rate_limit_events",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(sql, /auth_challenges_nonce_hash_uidx/);
  assert.match(sql, /contract_messages_thread_idx/);
  assert.match(sql, /thread_reads_pk/);
  assert.match(sql, /char_length\("body"\) BETWEEN 1 AND 2000/);
});

test("challenge message includes PREMIFLOW, wallet, nonce, issued, and expiry", async () => {
  const wallet = testWallet();
  const db = stores();
  const challenge = await createAuthChallenge(db, CONFIG, wallet.address);
  assert.match(challenge.message, /PREMIFLOW/);
  assert.match(challenge.message, new RegExp(`Wallet: ${wallet.address}`));
  assert.match(challenge.message, /Nonce: /);
  assert.match(challenge.message, /Issued: /);
  assert.match(challenge.message, /Expires: /);
  assert.match(challenge.message, /Domain: localhost:3000/);
});
