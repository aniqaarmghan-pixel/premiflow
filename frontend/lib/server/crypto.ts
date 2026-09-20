import { createHash, createHmac, randomBytes } from "node:crypto";

export function randomId(): string {
  return crypto.randomUUID();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256Hex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function hashSessionToken(secret: string, token: string): string {
  return hmacSha256Hex(secret, token);
}

export function hashNonce(nonce: string): string {
  return sha256Hex(nonce);
}
