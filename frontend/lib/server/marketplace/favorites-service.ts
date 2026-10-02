import { withSellers, type GigCard } from "./catalog-service";
import { HttpError } from "../http";
import { requireMarketplaceWallet, toPublicJob, type PublicJob } from "./service";
import {
  FAVORITE_TARGETS,
  type FavoriteTarget,
  type MarketplaceGigRecord,
  type MarketplaceJobRecord,
  type MarketplaceStore,
} from "./store";

/** Per-wallet cap on saved listings (bounded storage, bounded list query). */
export const FAVORITES_LIMIT = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SavedItem = {
  targetType: FavoriteTarget;
  targetId: string;
  savedAt: string;
  /** Null when the listing is gone or no longer visible to this wallet. */
  job: PublicJob | null;
  gig: GigCard | null;
};

function invalid(message: string): HttpError {
  return new HttpError(400, "invalid_marketplace_input", message);
}

function parseTarget(value: unknown): FavoriteTarget {
  if (typeof value !== "string" || !(FAVORITE_TARGETS as readonly string[]).includes(value)) {
    throw invalid("Saved listing type must be job or gig.");
  }
  return value as FavoriteTarget;
}

function parseTargetId(value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) throw invalid("Listing id is invalid.");
  return value.trim().toLowerCase();
}

function jobVisible(job: MarketplaceJobRecord | null, wallet: string): job is MarketplaceJobRecord {
  return !!job && (job.status === "open" || job.employerWallet === wallet);
}

function gigVisible(gig: MarketplaceGigRecord | null, wallet: string): gig is MarketplaceGigRecord {
  return !!gig && (gig.status === "active" || gig.freelancerWallet === wallet);
}

async function requireVisible(
  store: MarketplaceStore,
  targetType: FavoriteTarget,
  targetId: string,
  wallet: string
): Promise<void> {
  const ok =
    targetType === "job"
      ? jobVisible(await store.getJob(targetId), wallet)
      : gigVisible(await store.getGig(targetId), wallet);
  if (!ok) throw new HttpError(404, "listing_not_found", "That listing was not found.");
}

/** Idempotent save, keyed by the signed session wallet (never the body). */
export async function saveListing(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; targetType: unknown; targetId: unknown }
): Promise<{ saved: true; created: boolean }> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const targetType = parseTarget(input.targetType);
  const targetId = parseTargetId(input.targetId);
  await requireVisible(store, targetType, targetId, wallet);
  const existing = await store.listFavorites(wallet, FAVORITES_LIMIT);
  const already = existing.some((f) => f.targetType === targetType && f.targetId === targetId);
  if (!already && (await store.countFavorites(wallet)) >= FAVORITES_LIMIT) {
    throw new HttpError(409, "favorites_limit", `You can save up to ${FAVORITES_LIMIT} listings.`);
  }
  const { created } = await store.addFavorite({ wallet, targetType, targetId, createdAt: new Date() });
  return { saved: true, created };
}

/** Idempotent unsave; only ever touches the session wallet's own rows. */
export async function unsaveListing(
  store: MarketplaceStore,
  input: { sessionWallet: string | null; targetType: unknown; targetId: unknown }
): Promise<{ saved: false; removed: boolean }> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const targetType = parseTarget(input.targetType);
  const targetId = parseTargetId(input.targetId);
  return { saved: false, removed: await store.removeFavorite(wallet, targetType, targetId) };
}

export async function listSaved(
  store: MarketplaceStore,
  input: { sessionWallet: string | null }
): Promise<SavedItem[]> {
  const wallet = requireMarketplaceWallet(input.sessionWallet);
  const rows = await store.listFavorites(wallet, FAVORITES_LIMIT);
  const items: SavedItem[] = [];
  const gigRows: MarketplaceGigRecord[] = [];
  const pending: { index: number; gigId: string }[] = [];
  for (const f of rows) {
    const item: SavedItem = {
      targetType: f.targetType,
      targetId: f.targetId,
      savedAt: f.createdAt.toISOString(),
      job: null,
      gig: null,
    };
    if (f.targetType === "job") {
      const job = await store.getJob(f.targetId);
      if (jobVisible(job, wallet)) item.job = toPublicJob(job);
    } else {
      const gig = await store.getGig(f.targetId);
      if (gigVisible(gig, wallet)) {
        gigRows.push(gig);
        pending.push({ index: items.length, gigId: gig.id });
      }
    }
    items.push(item);
  }
  if (gigRows.length > 0) {
    const cards = await withSellers(store, gigRows);
    const byId = new Map(cards.map((c) => [c.id, c]));
    for (const p of pending) items[p.index].gig = byId.get(p.gigId) ?? null;
  }
  return items;
}
