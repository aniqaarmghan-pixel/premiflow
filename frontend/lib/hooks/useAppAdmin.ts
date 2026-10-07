"use client";

import { useEffect, useState } from "react";

import { fetchAdminMe } from "@/lib/app/support-tickets";

let cached: Promise<boolean> | null = null;

/**
 * Server-computed PREMIFLOW admin flag, used ONLY to show Admin Center
 * navigation. Every admin API re-checks on the server; this grants nothing.
 */
export function useAppAdmin(): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    cached ??= fetchAdminMe()
      .then((result) => result.admin === true)
      .catch(() => {
        cached = null;
        return false;
      });
    void cached.then((value) => {
      if (alive) setAdmin(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return admin;
}
