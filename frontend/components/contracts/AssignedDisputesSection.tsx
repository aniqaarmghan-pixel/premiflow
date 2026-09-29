"use client";

import Link from "next/link";
import { Scale } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { buildContractsListHref } from "@/lib/app/contracts-list-query";
import {
  RESOLVER_UX_COPY,
  assignedDisputeCount,
  resolverCaseCard,
} from "@/lib/app/resolver-cases";
import type { ContractView } from "@/lib/streampay-v2";

/** Compact Overview section; rendered only when the wallet has resolver cases. */
export function AssignedDisputesSection({
  cases,
  decimalsByMint,
}: {
  cases: readonly ContractView[];
  decimalsByMint: Record<string, number>;
}) {
  const awaiting = cases.filter((contract) => contract.status === "Disputed");
  return (
    <section className="mt-5" aria-label={RESOLVER_UX_COPY.overviewTitle}>
      <Card className="p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg">
            <Scale size={16} className="text-accent" />
            {RESOLVER_UX_COPY.overviewTitle}
            <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink">
              {assignedDisputeCount(cases)}
            </span>
          </h2>
          <Link
            href={buildContractsListHref({ role: "resolving" })}
            className="text-sm font-medium text-accent"
          >
            {RESOLVER_UX_COPY.openResolving}
          </Link>
        </div>
        {awaiting.length === 0 ? (
          <p className="mt-1.5 text-sm text-ink-soft">{RESOLVER_UX_COPY.noneAwaiting}</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-line">
            {awaiting.slice(0, 3).map((contract) => {
              const card = resolverCaseCard(
                contract,
                decimalsByMint[contract.tokenMint.toBase58()]
              );
              return (
                <li
                  key={card.address}
                  className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate text-ink">
                    {card.title} - {card.typeLabel}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-ink-soft">{card.contestedLabel}</span>
                    <Link href={card.href} className="font-medium text-accent">
                      {card.actionLabel}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
