import { getDb } from "./db/client";
import {
  createDrizzleAuthStore,
  createDrizzleCaseStore,
  createDrizzleMessageStore,
  createDrizzleRateLimitStore,
  createDrizzleSubmissionStore,
} from "./db/stores";
import { getServerEnv, type ServerEnv } from "./env";
import type {
  AuthStore,
  CaseStore,
  MessageStore,
  RateLimitStore,
  SubmissionStore,
} from "./stores";

export type MessagingStores = {
  auth: AuthStore;
  messages: MessageStore;
  rates: RateLimitStore;
  cases: CaseStore;
  submissions: SubmissionStore;
};

export function productionStores(): MessagingStores {
  const db = getDb();
  return {
    auth: createDrizzleAuthStore(db),
    messages: createDrizzleMessageStore(db),
    rates: createDrizzleRateLimitStore(db),
    cases: createDrizzleCaseStore(db),
    submissions: createDrizzleSubmissionStore(db),
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
