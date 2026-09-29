"use client";

import { useEffect, useState } from "react";

import { fetchResolutionCase } from "@/lib/app/resolution-case-client";
import {
  caseReadiness,
  statementPresence,
  type CaseReadiness,
} from "@/lib/app/resolver-workspace";
import type { ContractView } from "@/lib/streampay-v2";

/**
 * Readiness of each open dispute from the case the resolver may read
 * (read-only GET). No session or an unreadable case stays "unknown".
 */
export function useResolverReadiness(cases: readonly ContractView[]) {
  const [readiness, setReadiness] = useState<Record<string, CaseReadiness>>({});
  const key = cases
    .filter((c) => c.status === "Disputed")
    .map((c) => c.address.toBase58())
    .join(",");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const next: Record<string, CaseReadiness> = {};
        for (const address of key ? key.split(",") : []) {
          try {
            const res = await fetchResolutionCase(address);
            next[address] = caseReadiness(
              { status: "Disputed" },
              { state: "loaded", statements: statementPresence(res.case) }
            );
          } catch (err) {
            const code = (err as { code?: string } | null)?.code;
            next[address] = caseReadiness(
              { status: "Disputed" },
              code === "case_not_found" ? { state: "not_created" } : { state: "unavailable" }
            );
          }
        }
        if (!cancelled) setReadiness(next);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  return readiness;
}
