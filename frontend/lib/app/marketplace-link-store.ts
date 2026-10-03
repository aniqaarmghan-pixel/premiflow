/**
 * Marketplace source metadata carried through the Create flow, and the
 * pending "link this contract to its listing" marker.
 *
 * Lifecycle (all records scoped to cluster + program + employer wallet):
 * 1. The user explicitly imports a marketplace handoff -> a source record is
 *    saved (job + proposal, or gig + tier). Direct Create never has one.
 * 2. The create intent is saved -> the source is bound to that intent's
 *    contract address as an "awaiting" marker (only if the freelancer still
 *    matches the imported terms) and the source record is consumed.
 * 3. Only the wizard's verified on-chain success path marks the marker
 *    "confirmed". Discarded/failed/expired setups drop awaiting markers.
 * 4. Confirmed markers are sent to the contract-links endpoint (best effort,
 *    retry-safe). The server re-reads the chain and checks every party; the
 *    marker is cleared on success or on a definitive rejection.
 *
 * Nothing here signs, sends a transaction, or touches drafts or intents.
 */
import { NO_WALLET_DRAFT_OWNER } from "@/lib/app/create-draft-store";
import type { IntentScope, IntentStorage } from "@/lib/app/milestone-create-plan";
import type { CreateHandoff } from "@/lib/server/marketplace/service";

export const MARKETPLACE_SOURCE_PREFIX = "premiflow:marketplace-source:v1:";
export const MARKETPLACE_PENDING_LINK_PREFIX = "premiflow:marketplace-pending-link:v1:";
const VERSION = 1 as const;
/** Confirmed markers that keep failing for transient reasons are given up after this. */
export const PENDING_LINK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING = 10;
const TIERS: readonly string[] = ["basic", "standard", "premium"];

export type MarketplaceLinkSource =
  | { source: "job"; jobId: string; proposalId: string }
  | { source: "gig"; gigId: string; packageTier?: "basic" | "standard" | "premium" };

export type PendingLinkState = "awaiting" | "confirmed";

export type PendingLink = {
  contractAddress: string;
  link: MarketplaceLinkSource;
  state: PendingLinkState;
  savedAt: number;
  attempts: number;
};

export type LinkRequest = { contractAddress: string } & (
  | { source: "job"; jobId: string; proposalId: string }
  | { source: "gig"; gigId: string; packageTier?: "basic" | "standard" | "premium" }
);

export type LinkOutcome = "linked" | "retry" | "rejected";

type SourceRecord = { link: MarketplaceLinkSource; freelancerWallet: string; savedAt: number };

function validOwner(owner: unknown): owner is string {
  return typeof owner === "string" && owner.trim() !== "" && owner !== NO_WALLET_DRAFT_OWNER;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= 100;
}

function parseLink(value: unknown): MarketplaceLinkSource | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.source === "job" && nonEmpty(v.jobId) && nonEmpty(v.proposalId)) {
    return { source: "job", jobId: v.jobId, proposalId: v.proposalId };
  }
  if (v.source === "gig" && nonEmpty(v.gigId)) {
    if (v.packageTier !== undefined && !(typeof v.packageTier === "string" && TIERS.includes(v.packageTier))) {
      return null;
    }
    return {
      source: "gig",
      gigId: v.gigId,
      ...(v.packageTier ? { packageTier: v.packageTier as "basic" | "standard" | "premium" } : {}),
    };
  }
  return null;
}

/** Only ids and the tier travel; titles, amounts and parties are never trusted from here. */
export function sourceFromHandoff(handoff: CreateHandoff): MarketplaceLinkSource | null {
  return handoff.source === "gig"
    ? parseLink({ source: "gig", gigId: handoff.gigId, packageTier: handoff.packageTier })
    : parseLink({ source: "job", jobId: handoff.jobId, proposalId: handoff.proposalId });
}

export function marketplaceSourceKey(scope: IntentScope, employer: string): string {
  return `${MARKETPLACE_SOURCE_PREFIX}${scope.cluster}:${scope.programId}:${employer}`;
}

export function pendingLinkKey(scope: IntentScope, employer: string): string {
  return `${MARKETPLACE_PENDING_LINK_PREFIX}${scope.cluster}:${scope.programId}:${employer}`;
}

function read(storage: IntentStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(storage: IntentStorage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(storage: IntentStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/* ---------------- source record (explicit import only) ---------------- */

export function saveMarketplaceSource(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null,
  handoff: CreateHandoff,
  nowMs: number
): boolean {
  if (!storage || !validOwner(employer)) return false;
  const link = sourceFromHandoff(handoff);
  if (!link || !nonEmpty(handoff.freelancerWallet)) return false;
  return write(storage, marketplaceSourceKey(scope, employer), {
    version: VERSION,
    savedAt: nowMs,
    freelancerWallet: handoff.freelancerWallet,
    link,
  });
}

export function loadMarketplaceSource(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null
): SourceRecord | null {
  if (!storage || !validOwner(employer)) return null;
  const key = marketplaceSourceKey(scope, employer);
  const parsed = read(storage, key) as Record<string, unknown> | null;
  if (!parsed) return null;
  const link = parseLink(parsed.link);
  if (parsed.version === VERSION && link && nonEmpty(parsed.freelancerWallet)) {
    return { link, freelancerWallet: parsed.freelancerWallet, savedAt: Number(parsed.savedAt) || 0 };
  }
  remove(storage, key);
  return null;
}

export function clearMarketplaceSource(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null
): void {
  if (storage && validOwner(employer)) remove(storage, marketplaceSourceKey(scope, employer));
}

/* ---------------- pending link markers ---------------- */

export function loadPendingLinks(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null
): PendingLink[] {
  if (!storage || !validOwner(employer)) return [];
  const parsed = read(storage, pendingLinkKey(scope, employer)) as { version?: unknown; items?: unknown } | null;
  if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.items)) return [];
  const out: PendingLink[] = [];
  for (const item of parsed.items.slice(0, MAX_PENDING)) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const link = parseLink(v.link);
    if (!link || !nonEmpty(v.contractAddress) || (v.state !== "awaiting" && v.state !== "confirmed")) continue;
    out.push({
      contractAddress: v.contractAddress,
      link,
      state: v.state,
      savedAt: Number(v.savedAt) || 0,
      attempts: Number(v.attempts) || 0,
    });
  }
  return out;
}

function savePendingLinks(storage: IntentStorage, scope: IntentScope, employer: string, items: PendingLink[]): void {
  const key = pendingLinkKey(scope, employer);
  if (items.length === 0) remove(storage, key);
  else write(storage, key, { version: VERSION, items: items.slice(-MAX_PENDING) });
}

/**
 * Called right after the create intent is saved. Binds an imported source to
 * that intent's contract address (consuming the source). Awaiting markers for
 * other, abandoned intents are dropped; confirmed markers are kept.
 */
export function bindMarketplaceSource(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null,
  intent: { contractAddress: string; freelancer: string },
  nowMs: number
): PendingLink | null {
  if (!storage || !validOwner(employer)) return null;
  const existing = loadPendingLinks(storage, scope, employer);
  const kept = existing.filter((p) => p.state === "confirmed" || p.contractAddress === intent.contractAddress);
  const source = loadMarketplaceSource(storage, scope, employer);
  if (!source) {
    if (kept.length !== existing.length) savePendingLinks(storage, scope, employer, kept);
    return kept.find((p) => p.contractAddress === intent.contractAddress) ?? null;
  }
  clearMarketplaceSource(storage, scope, employer);
  if (source.freelancerWallet !== intent.freelancer) {
    // Terms were edited to another freelancer: this is no longer the marketplace hire.
    savePendingLinks(storage, scope, employer, kept);
    return null;
  }
  const already = kept.find((p) => p.contractAddress === intent.contractAddress);
  if (already) return already;
  const marker: PendingLink = {
    contractAddress: intent.contractAddress,
    link: source.link,
    state: "awaiting",
    savedAt: nowMs,
    attempts: 0,
  };
  savePendingLinks(storage, scope, employer, [...kept, marker]);
  return marker;
}

/** Only the verified on-chain success path may call this. */
export function confirmPendingLink(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null,
  contractAddress: string,
  nowMs: number
): PendingLink | null {
  if (!storage || !validOwner(employer)) return null;
  const items = loadPendingLinks(storage, scope, employer);
  const target = items.find((p) => p.contractAddress === contractAddress);
  if (!target) return null;
  if (target.state === "awaiting") {
    target.state = "confirmed";
    target.savedAt = nowMs;
    savePendingLinks(storage, scope, employer, items);
  }
  return target;
}

/** A discarded / failed / expired setup never links: drop every awaiting marker. */
export function dropAwaitingLinks(storage: IntentStorage | null, scope: IntentScope, employer: string | null): void {
  if (!storage || !validOwner(employer)) return;
  const items = loadPendingLinks(storage, scope, employer);
  const kept = items.filter((p) => p.state === "confirmed");
  if (kept.length !== items.length) savePendingLinks(storage, scope, employer, kept);
}

export function linkRequestFor(p: PendingLink): LinkRequest {
  return p.link.source === "job"
    ? { contractAddress: p.contractAddress, source: "job", jobId: p.link.jobId, proposalId: p.link.proposalId }
    : {
        contractAddress: p.contractAddress,
        source: "gig",
        gigId: p.link.gigId,
        ...(p.link.packageTier ? { packageTier: p.link.packageTier } : {}),
      };
}

/**
 * Transient failures (no session yet, rate limit, RPC lag, network) keep the
 * marker for a later retry; definitive server rejections clear it.
 */
export function classifyLinkError(err: unknown): LinkOutcome {
  const status = err && typeof err === "object" ? (err as { status?: unknown }).status : undefined;
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  if (typeof status !== "number") return "retry";
  if (status === 401 || status === 408 || status === 429 || status >= 500) return "retry";
  if (status === 404 && code === "contract_not_found") return "retry";
  return "rejected";
}

const inFlight = new Set<string>();

export type RunPendingResult = { linked: string[]; rejected: string[]; retry: string[] };

/** Sends every confirmed marker once (deduped across concurrent callers). Never throws. */
export async function runPendingLinks(
  storage: IntentStorage | null,
  scope: IntentScope,
  employer: string | null,
  link: (request: LinkRequest) => Promise<unknown>,
  nowMs: number
): Promise<RunPendingResult> {
  const result: RunPendingResult = { linked: [], rejected: [], retry: [] };
  if (!storage || !validOwner(employer)) return result;
  const confirmed = loadPendingLinks(storage, scope, employer).filter((p) => p.state === "confirmed");
  for (const p of confirmed) {
    const flightKey = `${employer}:${p.contractAddress}`;
    if (inFlight.has(flightKey)) continue;
    inFlight.add(flightKey);
    let outcome: LinkOutcome;
    try {
      await link(linkRequestFor(p));
      outcome = "linked";
    } catch (err) {
      outcome = classifyLinkError(err);
    } finally {
      inFlight.delete(flightKey);
    }
    const items = loadPendingLinks(storage, scope, employer);
    const current = items.find((i) => i.contractAddress === p.contractAddress);
    if (!current) continue;
    if (outcome === "retry" && nowMs - current.savedAt < PENDING_LINK_MAX_AGE_MS) {
      current.attempts += 1;
      savePendingLinks(storage, scope, employer, items);
      result.retry.push(p.contractAddress);
      continue;
    }
    savePendingLinks(
      storage,
      scope,
      employer,
      items.filter((i) => i.contractAddress !== p.contractAddress)
    );
    (outcome === "linked" ? result.linked : result.rejected).push(p.contractAddress);
  }
  return result;
}
