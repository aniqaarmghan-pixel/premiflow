import { getDb } from "./db/client";
import {
  createDrizzleAuthStore,
  createDrizzleCaseStore,
  createDrizzleMessageStore,
  createDrizzleRateLimitStore,
} from "./db/stores";
import { getServerEnv, type ServerEnv } from "./env";
import type { AuthStore, CaseStore, MessageStore, RateLimitStore } from "./stores";

export type MessagingStores = {
  auth: AuthStore;
  messages: MessageStore;
  rates: RateLimitStore;
  cases: CaseStore;
};

export function productionStores(): MessagingStores {
  const db = getDb();
  return {
    auth: createDrizzleAuthStore(db),
    messages: createDrizzleMessageStore(db),
    rates: createDrizzleRateLimitStore(db),
    cases: createDrizzleCaseStore(db),
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
