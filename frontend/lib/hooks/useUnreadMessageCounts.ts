"use client";

import { useEffect, useState } from "react";

import {
  UNREAD_MESSAGES_REFRESH_MS,
  unreadMessageCountsByContract,
} from "@/lib/app/contract-unread";
import { fetchNotifications } from "@/lib/app/notifications-client";

const EMPTY: Record<string, number> = {};

type State = { wallet: string | null; counts: Record<string, number> };

/**
 * Unread message counts per contract for the /contracts list, from the same
 * notifications the bell uses (one request, not one per contract). Errors
 * (signed out, offline) simply show no dots.
 */
export function useUnreadMessageCounts(walletKey: string | null): Record<string, number> {
  const [state, setState] = useState<State>({ wallet: null, counts: EMPTY });

  useEffect(() => {
    if (!walletKey) return;
    let cancelled = false;
    const load = () => {
      fetchNotifications({ limit: 50 })
        .then((page) => {
          if (cancelled) return;
          setState({ wallet: walletKey, counts: unreadMessageCountsByContract(page.notifications) });
        })
        .catch(() => {
          // No dots rather than an error on the list.
        });
    };
    load();
    const timer = window.setInterval(load, UNREAD_MESSAGES_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [walletKey]);

  return walletKey && state.wallet === walletKey ? state.counts : EMPTY;
}
