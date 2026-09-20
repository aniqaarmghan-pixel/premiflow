import { getDb } from "./db/client";
import { createDrizzleAuthStore, createDrizzleMessageStore, createDrizzleRateLimitStore } from "./db/stores";
import { getServerEnv, type ServerEnv } from "./env";
import type { AuthStore, MessageStore, RateLimitStore } from "./stores";

export type MessagingStores = {
  auth: AuthStore;
  messages: MessageStore;
  rates: RateLimitStore;
};

export function productionStores(): MessagingStores {
  const db = getDb();
  return {
    auth: createDrizzleAuthStore(db),
    messages: createDrizzleMessageStore(db),
    rates: createDrizzleRateLimitStore(db),
  };
}

export function authConfigFromEnv(env: ServerEnv = getServerEnv()) {
  return {
    appOrigin: env.appOrigin,
    sessionSecret: env.sessionSecret,
    challengeTtlSeconds: env.challengeTtlSeconds,
    sessionTtlSeconds: env.sessionTtlSeconds,
  };
}
