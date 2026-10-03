"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bookmark } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { marketplaceErrorMessage } from "@/lib/app/marketplace";
import { fetchSavedIds, saveListing, unsaveListing } from "@/lib/app/marketplace-client";
import { createSavedIdsStore, isSavedIn } from "@/lib/app/marketplace-saved-store";
import { useMarketplaceSession } from "@/lib/hooks/useMarketplace";
import type { FavoriteTarget } from "@/lib/server/marketplace/store";

/** Shared by every Save button: one ids-only request per wallet, not one full list per card. */
const savedIds = createSavedIdsStore(fetchSavedIds);

/** Save/unsave a job or gig for the signed-in wallet (server enforces ownership). */
export function MarketplaceSaveToggle({ type, id }: { type: FavoriteTarget; id: string }) {
  const session = useMarketplaceSession();
  const snapshot = useSyncExternalStore(savedIds.subscribe, savedIds.getSnapshot, savedIds.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void savedIds.ensure(session.wallet);
  }, [session.wallet]);

  const saved = snapshot.wallet === session.wallet && isSavedIn(snapshot, type, id);
  if (!session.wallet) return null;

  async function toggle() {
    setBusy(true);
    setNotice(null);
    try {
      await session.ensure();
      if (saved) await unsaveListing(type, id);
      else await saveListing(type, id);
      savedIds.setSaved(type, id, !saved);
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="secondary" disabled={busy} aria-pressed={saved} onClick={() => void toggle()}>
        <span key={saved ? "saved" : "save"} className={saved ? "pf-pop items-center gap-1.5" : "inline-flex items-center gap-1.5"}>
          <Bookmark size={14} aria-hidden="true" className={saved ? "fill-current text-accent" : ""} />
          {saved ? "Saved" : "Save"}
        </span>
      </Button>
      {notice ? (
        <span className="text-xs text-danger" aria-live="polite">
          {notice}
        </span>
      ) : null}
    </span>
  );
}
