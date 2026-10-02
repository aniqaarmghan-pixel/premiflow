"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

import { Card } from "@/components/ui/Card";
import { resolverCaseCard } from "@/lib/app/resolver-cases";
import {
  READINESS_LABEL,
  RESOLVER_WORKSPACE_COPY,
  disputesRequiringAttention,
  groupAssignedDisputes,
  readinessFor,
  resolvedCaseRow,
  resolverActivity,
  resolverWorkspaceMetrics,
  type CaseReadiness,
  type ResolverWorkspaceView,
} from "@/lib/app/resolver-workspace";
import { useResolverCases } from "@/lib/hooks/useResolverCases";
import { useResolverReadiness } from "@/lib/hooks/useResolverReadiness";
import { useResolverTxHistory } from "@/lib/hooks/useResolverTxHistory";
import { browserSignatureStorage, readResolveSignature } from "@/lib/app/resolve-signature-store";
import { ACTIVE_CLUSTER_ID } from "@/lib/cluster";
import { explorerTxUrl } from "@/lib/network";
import type { ContractView } from "@/lib/streampay-v2";

const TITLES: Record<ResolverWorkspaceView, string> = {
  dashboard: "Resolver Dashboard",
  assigned: "Assigned Disputes",
  resolved: "Resolved Cases",
  activity: "Resolver Activity",
};

function short(value: string): string {
  return value.length > 10 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="px-3 py-2.5">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="font-display text-xl">{value}</p>
    </Card>
  );
}

function DisputeRow({
  contract,
  decimals,
  readiness,
}: {
  contract: ContractView;
  decimals: number | undefined;
  readiness: CaseReadiness;
}) {
  const card = resolverCaseCard(contract, decimals);
  return (
    <Card className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {card.title} <span className="text-ink-faint">- {card.typeLabel}</span>
        </p>
        <p className="break-words text-xs text-ink-soft">
          Employer {short(card.employer)} - Freelancer {short(card.freelancer)}
        </p>
        <p className="text-xs text-ink-soft">
          {card.statusLabel} - Disputed {card.contestedLabel}
          {card.disputedAtLabel ? ` - Opened ${card.disputedAtLabel}` : ""} - {READINESS_LABEL[readiness]}
        </p>
      </div>
      <Link href={card.href} className="shrink-0 text-sm font-medium underline-offset-2 hover:underline">
        {card.actionLabel}
      </Link>
    </Card>
  );
}

export function ResolverWorkspace({ view }: { view: ResolverWorkspaceView }) {
  const { connected } = useWallet();
  const resolver = useResolverCases();
  const readiness = useResolverReadiness(resolver.cases);
  const decimalsFor = (c: ContractView) => resolver.decimalsByMint[c.tokenMint.toBase58()];
  const txHistory = useResolverTxHistory(
    view === "activity" ? resolver.cases.map((c) => c.address.toBase58()) : []
  );

  let body: React.ReactNode;
  if (!connected) {
    body = <Card className="p-4 text-sm text-ink-soft">{RESOLVER_WORKSPACE_COPY.connect}</Card>;
  } else if (resolver.status === "idle" || resolver.status === "loading") {
    body = <Card className="p-4 text-sm text-ink-soft">Loading assigned disputes...</Card>;
  } else if (resolver.status === "error") {
    body = <Card className="p-4 text-sm text-ink-soft">{RESOLVER_WORKSPACE_COPY.loadError}</Card>;
  } else if (resolver.cases.length === 0) {
    body = <Card className="p-4 text-sm text-ink-soft">{RESOLVER_WORKSPACE_COPY.none}</Card>;
  } else if (view === "dashboard") {
    const metrics = resolverWorkspaceMetrics(resolver.cases, readiness);
    const attention = disputesRequiringAttention(resolver.cases, readiness).slice(0, 5);
    body = (
      <>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric label="Open disputes" value={metrics.open} />
          <Metric label="Awaiting statements" value={metrics.awaitingStatements} />
          <Metric label="Ready for decision" value={metrics.readyForDecision} />
          <Metric label="Resolved cases" value={metrics.resolved} />
        </div>
        {metrics.readinessUnknown > 0 ? (
          <p className="text-xs text-ink-faint">
            {RESOLVER_WORKSPACE_COPY.readinessUnknown(metrics.readinessUnknown)}
          </p>
        ) : null}
        <section>
          <h2 className="font-display text-base sm:text-lg">Disputes requiring attention</h2>
          {attention.length === 0 ? (
            <p className="mt-1 text-sm text-ink-soft">{RESOLVER_WORKSPACE_COPY.noOpen}</p>
          ) : (
            <div className="mt-2 space-y-2">
              {attention.map((c) => (
                <DisputeRow
                  key={c.address.toBase58()}
                  contract={c}
                  decimals={decimalsFor(c)}
                  readiness={readinessFor(c, readiness)}
                />
              ))}
            </div>
          )}
        </section>
      </>
    );
  } else if (view === "assigned") {
    const groups = groupAssignedDisputes(resolver.cases, readiness);
    const sections: Array<[string, ContractView[]]> = [
      ["Awaiting statements", groups.awaiting],
      ["Ready for decision", groups.ready],
      ...(groups.unknown.length ? ([["Readiness unknown", groups.unknown]] as Array<[string, ContractView[]]>) : []),
      ["Resolved", groups.resolved],
    ];
    body = (
      <div className="space-y-4">
        {sections.map(([title, list]) => (
          <section key={title}>
            <h2 className="font-display text-lg">
              {title} <span className="text-sm text-ink-faint">({list.length})</span>
            </h2>
            {list.length === 0 ? (
              <p className="mt-1 text-sm text-ink-soft">None.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {list.map((c) => (
                  <DisputeRow
                    key={c.address.toBase58()}
                    contract={c}
                    decimals={decimalsFor(c)}
                    readiness={readinessFor(c, readiness)}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    );
  } else if (view === "resolved") {
    const rows = resolver.cases
      .filter((c) => c.status === "Resolved")
      .map((c) =>
        resolvedCaseRow(
          c,
          decimalsFor(c),
          readResolveSignature(browserSignatureStorage(), ACTIVE_CLUSTER_ID, c.address.toBase58())
        )
      );
    body = (
      <div className="space-y-2">
        <p className="text-sm text-ink-soft">{RESOLVER_WORKSPACE_COPY.resolvedNote}</p>
        {rows.length === 0 ? (
          <Card className="p-4 text-sm text-ink-soft">No resolved cases yet.</Card>
        ) : (
          rows.map((row) => (
            <Card key={row.address} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-medium">
                  {row.title} <span className="text-ink-faint">- {row.typeLabel}</span>
                </p>
                <span className="flex shrink-0 flex-wrap gap-3">
                  <Link href={row.href} className="text-sm font-medium underline-offset-2 hover:underline">
                    View case
                  </Link>
                  {row.txSignature ? (
                    <a
                      href={explorerTxUrl(row.txSignature)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      View transaction
                    </a>
                  ) : null}
                </span>
              </div>
              <dl className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-ink-faint">Freelancer settlement</dt>
                  <dd className="break-words tabular-nums">{row.freelancerSettlementLabel}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Employer refundable</dt>
                  <dd className="break-words tabular-nums">{row.employerRefundableLabel}</dd>
                </div>
              </dl>
            </Card>
          ))
        )}
      </div>
    );
  } else {
    const items = resolverActivity(resolver.cases);
    const txCard = (
      <Card className="px-3 py-2.5">
        <h2 className="text-sm font-semibold">{RESOLVER_WORKSPACE_COPY.txHistoryTitle}</h2>
        <p className="text-xs text-ink-faint">{RESOLVER_WORKSPACE_COPY.txHistoryNote}</p>
        {txHistory.status === "error" ? (
          <p className="mt-2 text-sm text-ink-soft">{RESOLVER_WORKSPACE_COPY.txHistoryError}</p>
        ) : txHistory.status === "ready" && txHistory.items.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{RESOLVER_WORKSPACE_COPY.txHistoryEmpty}</p>
        ) : txHistory.status === "ready" ? (
          <ul className="mt-2 divide-y divide-white/5">
            {txHistory.items.map((tx) => (
              <li
                key={tx.signature}
                className="flex min-w-0 flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 break-words text-xs text-ink-soft">
                  <Link href={tx.contractHref} className="underline-offset-2 hover:underline">
                    Contract {short(tx.contract)}
                  </Link>
                  {` - ${tx.timeLabel}${tx.failed ? " - Failed" : ""}`}
                </span>
                <a
                  href={tx.explorerHref}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
                >
                  View transaction {short(tx.signature)}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">{RESOLVER_WORKSPACE_COPY.txHistoryLoading}</p>
        )}
      </Card>
    );
    body = (
      <div className="space-y-3">
        {txCard}
        {items.length === 0 ? (
        <Card className="p-4 text-sm text-ink-soft">{RESOLVER_WORKSPACE_COPY.activityEmpty}</Card>
      ) : (
        <Card className="px-3 py-2.5">
          <p className="text-xs text-ink-faint">{RESOLVER_WORKSPACE_COPY.activityNote}</p>
          <ul className="mt-2 divide-y divide-white/5">
            {items.map((item) => (
              <li key={item.key} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                <Link href={item.href} className="min-w-0 break-words text-sm underline-offset-2 hover:underline">
                  {item.title}
                </Link>
                <span className="text-xs text-ink-faint">
                  {item.atLabel} - {item.detail}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wide text-ink-faint">Resolver workspace</p>
        <h1 className="font-display text-xl sm:text-2xl lg:text-xl">{TITLES[view]}</h1>
        <p className="mt-1 text-sm text-ink-soft">{RESOLVER_WORKSPACE_COPY.notAdmin}</p>
      </header>
      {body}
    </div>
  );
}
