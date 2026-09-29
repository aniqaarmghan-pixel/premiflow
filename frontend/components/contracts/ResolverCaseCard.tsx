"use client";

import Link from "next/link";
import { Scale } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { resolverCaseCard } from "@/lib/app/resolver-cases";
import { shortenAddress } from "@/lib/network";
import type { ContractView } from "@/lib/streampay-v2";

export function ResolverCaseCard({
  contract,
  decimals,
}: {
  contract: ContractView;
  decimals?: number;
}) {
  const card = resolverCaseCard(contract, decimals);
  return (
    <Card className="relative min-w-0 overflow-hidden p-3 sm:p-3.5">
      <span
        className={`absolute inset-y-0 left-0 w-1 ${card.awaitingDecision ? "bg-danger" : "bg-gold"}`}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            <Scale size={12} />
            Resolver - {card.typeLabel}
          </p>
          <p className="truncate text-sm font-semibold leading-snug text-ink">{card.title}</p>
        </div>
        <StatusBadge status={card.status} label={card.statusLabel} compact />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="min-w-0">
          <dt className="text-ink-faint">Employer</dt>
          <dd className="truncate font-medium text-ink" title={card.employer}>
            {shortenAddress(card.employer)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-faint">Freelancer</dt>
          <dd className="truncate font-medium text-ink" title={card.freelancer}>
            {shortenAddress(card.freelancer)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-faint">Under dispute</dt>
          <dd className="truncate font-display text-base leading-tight text-ink">
            {card.contestedLabel}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-faint">Dispute opened</dt>
          <dd className="truncate font-medium text-ink">{card.disputedAtLabel ?? "Not set"}</dd>
        </div>
      </dl>
      <div className="mt-2 flex justify-end">
        <Link
          href={card.href}
          className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white"
        >
          {card.actionLabel}
        </Link>
      </div>
    </Card>
  );
}
