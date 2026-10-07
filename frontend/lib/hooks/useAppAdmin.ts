"use client";

import { useEffect, useState } from "react";

import type { AppAdminStatus } from "@/lib/app/resolver-workspace";
import { fetchAdminMe } from "@/lib/app/support-tickets";

export type { AppAdminStatus };

// Cached per signed-in account so switching accounts never reuses a stale flag.
const cache = new Map<string, Promise<boolean>>();

function adminFlag(userId: string): Promise<boolean> {
  let pending = cache.get(userId);
  if (!pending) {
    pending = fetchAdminMe()
      .then((result) => result.admin === true)
      .catch(() => {
        cache.delete(userId);
        return false;
      });
    cache.set(userId, pending);
  }
  return pending;
}

/**
 * Server-computed PREMIFLOW admin status for the signed-in account, used ONLY
 * to choose navigation (the dedicated Admin workspace). Every admin API
 * re-checks on the server, and it never grants escrow/settlement authority.
 * Fails closed: an error reads as "user".
 */
export function useAppAdminStatus(userId: string | null | undefined): AppAdminStatus {
  const [resolved, setResolved] = useState<{ userId: string; admin: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void adminFlag(userId).then((admin) => {
      if (alive) setResolved({ userId, admin });
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  if (!userId) return "user";
  if (!resolved || resolved.userId !== userId) return "loading";
  return resolved.admin ? "admin" : "user";
}

export function useAppAdmin(userId: string | null | undefined): boolean {
  return useAppAdminStatus(userId) === "admin";
}
