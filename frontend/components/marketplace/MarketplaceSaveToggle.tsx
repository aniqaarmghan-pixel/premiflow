"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { marketplaceErrorMessage } from "@/lib/app/marketplace";
import { fetchSaved, saveListing, unsaveListing } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";
import type { FavoriteTarget } from "@/lib/server/marketplace/store";

/** Save/unsave a job or gig for the signed-in wallet (server enforces ownership). */
export function MarketplaceSaveToggle({ type, id }: { type: FavoriteTarget; id: string }) {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(session.wallet ? `saved:${session.wallet}` : null, fetchSaved);
  const [override, setOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const listed =
    query.status === "ready" && query.data.items.some((item) => item.targetType === type && item.targetId === id);
  const saved = override ?? listed;

  if (!session.wallet) return null;

  async function toggle() {
    setBusy(true);
    setNotice(null);
    try {
      await session.ensure();
      if (saved) await unsaveListing(type, id);
      else await saveListing(type, id);
      setOverride(!saved);
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="secondary" disabled={busy} aria-pressed={saved} onClick={() => void toggle()}>
        {saved ? "Saved" : "Save"}
      </Button>
      {notice ? (
        <span className="text-xs text-danger" aria-live="polite">
          {notice}
        </span>
      ) : null}
    </span>
  );
}
