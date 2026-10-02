import { requireSession } from "../api-guard";
import { AuthError } from "../auth/service";
import {
  productionMarketplaceStore,
  productionMarketplaceTrustStore,
  productionStores,
  type MessagingStores,
} from "../compose";
import { getServerEnv, type ServerEnv } from "../env";
import { RATE_LIMITS, consumeRateLimit } from "../rate-limit";
import { snapshotFactsReader, type ContractFactsReader } from "./contract-reader";
import type { MarketplaceStore } from "./store";
import type { TrustDeps } from "./trust-service";
import type { MarketplaceTrustStore } from "./trust-store";

export type MarketplaceRouteContext = {
  env: ServerEnv;
  stores: MessagingStores;
  market: MarketplaceStore;
};

export type MarketplaceTrustContext = MarketplaceRouteContext & {
  trust: MarketplaceTrustStore;
  readContract: ContractFactsReader;
};

export function marketplaceContext(): MarketplaceRouteContext {
  return {
    env: getServerEnv(),
    stores: productionStores(),
    market: productionMarketplaceStore(),
  };
}

/** Phase 5 context: adds the trust store and a read-only on-chain contract reader. */
export function marketplaceTrustContext(): MarketplaceTrustContext {
  const base = marketplaceContext();
  return {
    ...base,
    trust: productionMarketplaceTrustStore(),
    readContract: snapshotFactsReader(base.env.solanaRpcUrl),
  };
}

export function trustDeps(ctx: MarketplaceTrustContext): TrustDeps {
  return {
    market: ctx.market,
    trust: ctx.trust,
    notifications: ctx.stores.notifications,
    readContract: ctx.readContract,
  };
}

/** Wallet from the signed premiflow_session cookie only; never from the request body. */
export async function marketplaceSessionWallet(
  request: Request,
  ctx: MarketplaceRouteContext
): Promise<string> {
  const session = await requireSession(request, ctx.stores, ctx.env);
  return session.walletAddress;
}

/** Same as above, but anonymous visitors get null (public browse/detail). */
export async function optionalMarketplaceSessionWallet(
  request: Request,
  ctx: MarketplaceRouteContext
): Promise<string | null> {
  try {
    return await marketplaceSessionWallet(request, ctx);
  } catch (err) {
    if (err instanceof AuthError) return null;
    throw err;
  }
}

export async function limitMarketplaceWrites(
  ctx: MarketplaceRouteContext,
  wallet: string
): Promise<void> {
  await consumeRateLimit(
    ctx.stores.rates,
    `marketplace:${wallet}`,
    RATE_LIMITS.sendMax,
    RATE_LIMITS.sendWindowMs,
    new Date()
  );
}
