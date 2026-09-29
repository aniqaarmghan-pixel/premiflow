"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

import { ConnectPrompt } from "@/components/shell/ConnectPrompt";
import { PageFade } from "@/components/shell/PageFade";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatUnix } from "@/lib/app/datetime";
import { presentType, roleForContract, roleLabel } from "@/lib/app/view-model";
import { roleAwareStatusLabel } from "@/lib/app/dashboard-offers";
import { useContracts } from "@/lib/hooks/ContractsProvider";

type Stamp = { at: number; label: string; href: string };

export function ActivityPage() {
  const { connected, publicKey } = useWallet();
  const { status, grouped, refresh } = useContracts();

  if (!connected || !publicKey) return <ConnectPrompt />;
  if (status === "loading" || status === "idle") return <Skeleton className="h-64 w-full" />;
  if (status === "error") {
    return (
      <EmptyState
        title="Activity unavailable"
        body="Contract accounts could not be loaded."
        action={{ label: "Retry", onClick: () => void refresh() }}
      />
    );
  }

  const stamps: Stamp[] = [];
  for (const contract of grouped.all) {
    const href = `/contracts/${contract.address.toBase58()}`;
    const role = roleLabel(roleForContract(publicKey, contract));
    const prefix = `${presentType(contract.paymentMode)} · ${role}`;
    if (contract.createdAt) stamps.push({ at: contract.createdAt, label: `${prefix} created`, href });
    if (contract.acceptedAt) stamps.push({ at: contract.acceptedAt, label: `${prefix} accepted`, href });
    if (contract.startTime) stamps.push({ at: contract.startTime, label: `${prefix} started`, href });
    if (contract.completedAt) stamps.push({ at: contract.completedAt, label: `${prefix} completed`, href });
    if (contract.terminatedAt) stamps.push({ at: contract.terminatedAt, label: `${prefix} terminated`, href });
    if (contract.disputedAt) stamps.push({ at: contract.disputedAt, label: `${prefix} disputed`, href });
    stamps.push({
      at: contract.createdAt,
      label: `${prefix}: ${roleAwareStatusLabel(publicKey, contract)}`,
      href,
    });
  }
  stamps.sort((a, b) => b.at - a.at);

  return (
    <PageFade>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">Activity</p>
      <h1 className="mt-1 font-display text-[1.65rem] tracking-tight sm:text-3xl">Deterministic timeline</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">
        This is not an indexer. It only lists timestamps already stored on loaded contract
        accounts. Program events such as WorkUnitStaleRevisionVoided are not retrieved.
      </p>
      {stamps.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            kind="activity"
            title="Nothing on-chain yet"
            body="Create or accept a contract to see lifecycle stamps."
          />
        </div>
      ) : (
        <ol className="mt-5 space-y-3">
          {stamps.slice(0, 40).map((stamp, i) => (
            <li key={`${stamp.href}-${stamp.label}-${i}`}>
              <Card className="p-4">
                <p className="text-xs text-ink-faint">{formatUnix(stamp.at)}</p>
                <Link href={stamp.href} className="mt-1 block font-medium">
                  {stamp.label}
                </Link>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </PageFade>
  );
}
