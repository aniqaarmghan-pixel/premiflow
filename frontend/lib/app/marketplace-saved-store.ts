import type { FavoriteTarget } from "@/lib/server/marketplace/store";

export type SavedIdsPayload = { jobs: string[]; gigs: string[] };

export type SavedIdsSnapshot = {
  wallet: string | null;
  status: "idle" | "loading" | "ready" | "error";
  jobs: ReadonlySet<string>;
  gigs: ReadonlySet<string>;
};

const EMPTY: ReadonlySet<string> = new Set();

function idle(wallet: string | null): SavedIdsSnapshot {
  return { wallet, status: "idle", jobs: EMPTY, gigs: EMPTY };
}

export function isSavedIn(snapshot: SavedIdsSnapshot, type: FavoriteTarget, id: string): boolean {
  return (type === "job" ? snapshot.jobs : snapshot.gigs).has(id);
}

/**
 * One shared saved-status cache per page: every Save button reads from it,
 * and the ids are fetched once per wallet (concurrent callers share the same
 * in-flight request) instead of each card loading the full saved list.
 */
export function createSavedIdsStore(fetcher: () => Promise<SavedIdsPayload>) {
  let snapshot: SavedIdsSnapshot = idle(null);
  let inflight: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  function ensure(wallet: string | null): Promise<void> {
    if (wallet !== snapshot.wallet) {
      snapshot = idle(wallet);
      inflight = null;
      emit();
    }
    if (!wallet || snapshot.status === "ready") return Promise.resolve();
    if (inflight) return inflight;
    snapshot = { ...snapshot, status: "loading" };
    const run = fetcher().then(
      (data) => {
        if (snapshot.wallet !== wallet) return;
        snapshot = { wallet, status: "ready", jobs: new Set(data.jobs), gigs: new Set(data.gigs) };
      },
      () => {
        if (snapshot.wallet !== wallet) return;
        snapshot = { ...snapshot, status: "error" };
      }
    );
    inflight = run.finally(() => {
      if (snapshot.wallet === wallet) inflight = null;
      emit();
    });
    emit();
    return inflight;
  }

  function setSaved(type: FavoriteTarget, id: string, saved: boolean) {
    const next = new Set(type === "job" ? snapshot.jobs : snapshot.gigs);
    if (saved) next.add(id);
    else next.delete(id);
    snapshot = type === "job" ? { ...snapshot, jobs: next } : { ...snapshot, gigs: next };
    emit();
  }

  return {
    ensure,
    setSaved,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type SavedIdsStore = ReturnType<typeof createSavedIdsStore>;
