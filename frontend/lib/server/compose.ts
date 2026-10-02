import { getDb } from "./db/client";
import { createDrizzleMarketplaceStore } from "./db/marketplace-store";
import type { MarketplaceStore } from "./marketplace/store";
import { createDrizzleMarketplaceTrustStore } from "./db/marketplace-trust-store";
import type { MarketplaceTrustStore } from "./marketplace/trust-store";
import { createDrizzleAttachmentStore } from "./db/attachment-store";
import {
  createDrizzleAuthStore,
  createDrizzleCaseStore,
  createDrizzleMessageStore,
  createDrizzleNotificationStore,
  createDrizzleRateLimitStore,
  createDrizzleSubmissionStore,
} from "./db/stores";
import { createVercelBlobStorage, type BlobStorage } from "./blob/adapter";
import { getServerEnv, type ServerEnv } from "./env";
import type {
  AttachmentStore,
  AuthStore,
  CaseStore,
  MessageStore,
  NotificationStore,
  RateLimitStore,
  SubmissionStore,
} from "./stores";

export type MessagingStores = {
  auth: AuthStore;
  messages: MessageStore;
  rates: RateLimitStore;
  cases: CaseStore;
  submissions: SubmissionStore;
  attachments: AttachmentStore;
  notifications: NotificationStore;
};

export function productionStores(): MessagingStores {
  const db = getDb();
  return {
    auth: createDrizzleAuthStore(db),
    messages: createDrizzleMessageStore(db),
    rates: createDrizzleRateLimitStore(db),
    cases: createDrizzleCaseStore(db),
    submissions: createDrizzleSubmissionStore(db),
    attachments: createDrizzleAttachmentStore(db),
    notifications: createDrizzleNotificationStore(db),
  };
}

/** Off-chain marketplace store (separate from MessagingStores; additive). */
export function productionMarketplaceStore(): MarketplaceStore {
  return createDrizzleMarketplaceStore(getDb());
}

/** Phase 5 trust/hiring store (reviews, invitations, shortlist, contract links). */
export function productionMarketplaceTrustStore(): MarketplaceTrustStore {
  return createDrizzleMarketplaceTrustStore(getDb());
}

export function productionBlobStorage(): BlobStorage {
  return createVercelBlobStorage();
}

export function authConfigFromEnv(env: ServerEnv = getServerEnv()) {
  return {
    appOrigin: env.appOrigin,
    sessionSecret: env.sessionSecret,
    challengeTtlSeconds: env.challengeTtlSeconds,
    sessionTtlSeconds: env.sessionTtlSeconds,
  };
}
