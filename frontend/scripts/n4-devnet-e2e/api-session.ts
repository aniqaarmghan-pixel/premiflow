/**
 * Production HTTP helpers for N4 E2E (auth / submissions / notifications).
 * Cookie jar — no auth bypass.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import type { Keypair } from "@solana/web3.js";

import { SESSION_COOKIE } from "@/lib/server/http";
import { signatureToBase64 } from "@/lib/app/messages-client";

export type ApiCallResult<T> = {
  status: number;
  json: T;
  setCookie: string | null;
};

function extractSessionCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  // Node fetch may join multiple Set-Cookie with ", " — find premiflow_session=
  const match = setCookie.match(
    new RegExp(`${SESSION_COOKIE}=([^;,]*)`)
  );
  if (!match) return null;
  return decodeURIComponent(match[1]!);
}

export async function apiJson<T>(
  baseUrl: string,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    origin: string;
    cookie?: string | null;
  }
): Promise<ApiCallResult<T>> {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("origin", init.origin);
  if (init.cookie) {
    headers.set("cookie", `${SESSION_COOKIE}=${encodeURIComponent(init.cookie)}`);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const setCookie =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie().join(", ")
      : response.headers.get("set-cookie");
  const json = (await response.json().catch(() => null)) as T;
  return { status: response.status, json, setCookie };
}

export async function authenticateWallet(input: {
  baseUrl: string;
  origin: string;
  keypair: Keypair;
}): Promise<{ cookie: string; wallet: string }> {
  const wallet = input.keypair.publicKey.toBase58();
  const challenge = await apiJson<{
    challengeId?: string;
    message?: string;
    error?: { code?: string; message?: string };
  }>(input.baseUrl, "/api/auth/challenge", {
    method: "POST",
    origin: input.origin,
    body: { wallet },
  });
  if (challenge.status !== 200 || !challenge.json.challengeId || !challenge.json.message) {
    throw new Error(
      `auth challenge failed (${challenge.status}): ${JSON.stringify(challenge.json)}`
    );
  }

  const messageBytes = new TextEncoder().encode(challenge.json.message);
  const sig = ed25519.sign(messageBytes, input.keypair.secretKey.slice(0, 32));
  const signature = signatureToBase64(sig);

  const verified = await apiJson<{
    wallet?: string;
    expiresAt?: string;
    error?: { code?: string; message?: string };
  }>(input.baseUrl, "/api/auth/verify", {
    method: "POST",
    origin: input.origin,
    body: { challengeId: challenge.json.challengeId, signature },
  });
  const cookie = extractSessionCookie(verified.setCookie);
  if (verified.status !== 200 || !cookie || verified.json.wallet !== wallet) {
    throw new Error(
      `auth verify failed (${verified.status}): ${JSON.stringify(verified.json)}`
    );
  }
  return { cookie, wallet };
}
