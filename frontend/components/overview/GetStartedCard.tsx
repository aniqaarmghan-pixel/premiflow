"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { CheckCircle2, X } from "lucide-react";

import { Card } from "@/components/ui/Card";
import type { MarketplaceWorkspaceData } from "@/lib/app/dashboard-command";
import type { RoleContext } from "@/lib/app/dashboard-insights";
import { fetchMyProfile } from "@/lib/app/marketplace-client";
import {
  GET_STARTED_DISMISS_KEY,
  defaultGetStartedRole,
  getStartedFacts,
  getStartedSteps,
  type GetStartedRole,
} from "@/lib/app/onboarding";
import { useMarketplaceQuery } from "@/lib/hooks/useMarketplace";

const DISMISS_EVENT = "premiflow:get-started";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(GET_STARTED_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DISMISS_EVENT, onChange);
  };
}

/**
 * Compact, dismissible onboarding for new accounts. Steps link to existing
 * routes and are marked done only from real profile, listing and contract data.
 */
export function GetStartedCard({
  mode,
  wallet,
  workspace,
  hiringContracts,
}: {
  mode: RoleContext["mode"];
  wallet: string | null;
  workspace: MarketplaceWorkspaceData | null;
  hiringContracts: number;
}) {
  // Hidden on the server and until localStorage is read.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const defaultRole = defaultGetStartedRole(mode);
  const [role, setRole] = useState<GetStartedRole>(defaultRole);
  const profileQuery = useMarketplaceQuery(wallet && workspace ? `dash-profile:${wallet}` : null, fetchMyProfile);
  const profile = profileQuery.status === "ready" ? profileQuery.data.profile : null;
  const facts = getStartedFacts({ profile, workspace, hiringContracts });

  if (dismissed || getStartedSteps(defaultRole, facts).every((s) => s.done)) return null;

  const steps = getStartedSteps(role, facts);
  const doneCount = steps.filter((s) => s.done).length;

  function dismiss() {
    try {
      window.localStorage.setItem(GET_STARTED_DISMISS_KEY, "1");
    } catch {
      // Storage unavailable: hide for this view only.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  return (
    <section aria-labelledby="pf-get-started" className="mt-4 min-w-0">
      <Card className="min-w-0 p-4 sm:p-5 lg:p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Get started</p>
            <h2 id="pf-get-started" className="mt-1 font-display text-lg">
              {role === "hiring" ? "Hire with a protected contract" : "Start getting paid on PREMIFLOW"}
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              {doneCount} of {steps.length} done. Checked from your profile, listings and contracts.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div role="group" aria-label="Choose a path" className="inline-flex rounded-full border border-line p-0.5 text-xs font-semibold">
              {(["hiring", "working"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                  className={`min-h-9 rounded-full px-3 transition ${role === r ? "bg-accent-soft text-accent" : "text-ink-soft hover:text-ink"}`}
                >
                  {r === "hiring" ? "Hiring" : "Working"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss get started"
              className="inline-flex size-9 items-center justify-center rounded-full text-ink-faint transition hover:bg-paper hover:text-ink"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <ol className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.key} className="min-w-0">
              <Link
                href={s.href}
                className="flex h-full min-w-0 items-start gap-3 rounded-2xl border border-line p-3 transition hover:border-accent/40"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    s.done ? "bg-[color-mix(in_srgb,var(--ok)_14%,white)] text-ok" : "bg-accent-soft text-accent"
                  }`}
                >
                  {s.done ? <CheckCircle2 size={14} /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">
                    {s.label}
                    {s.done ? <span className="ml-1.5 text-[11px] font-medium text-ok">Done</span> : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-ink-faint">{s.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
