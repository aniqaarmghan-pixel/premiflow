import type { RateLimitStore } from "./stores";

export const RATE_LIMITS = {
  challengeIntervalMs: 15_000,
  verifyMax: 10,
  verifyWindowMs: 10 * 60 * 1000,
  sendMax: 20,
  sendWindowMs: 60_000,
  copilotMax: 10,
  copilotWindowMs: 60_000,
} as const;

export class RateLimitedError extends Error {
  constructor(message = "Too many requests.") {
    super(message);
    this.name = "RateLimitedError";
  }
}

export async function consumeRateLimit(
  store: RateLimitStore,
  bucket: string,
  max: number,
  windowMs: number,
  now = new Date()
): Promise<void> {
  const since = new Date(now.getTime() - windowMs);
  await store.addEvent(bucket, now);
  const count = await store.countSince(bucket, since);
  if (count > max) {
    throw new RateLimitedError();
  }
}

export function challengeBucket(wallet: string): string {
  return `challenge:${wallet}`;
}

export function verifyBucket(wallet: string): string {
  return `verify:${wallet}`;
}

export function sendBucket(wallet: string, contract: string): string {
  return `send:${wallet}:${contract}`;
}

export function copilotBucket(wallet: string): string {
  return `copilot:${wallet}`;
}
