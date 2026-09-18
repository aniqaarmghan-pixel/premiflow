"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { ContractCard } from "@/components/contracts/ContractCard";
import { ConnectPrompt } from "@/components/shell/ConnectPrompt";
import { PageFade } from "@/components/shell/PageFade";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import {
  filterContracts,
  presentStatus,
  type RoleFilter,
  type StatusFilter,
} from "@/lib/app/view-model";
import { useContracts } from "@/lib/hooks/ContractsProvider";
import type { ContractStatus } from "@/lib/streampay-v2";

const STATUSES: ContractStatus[] = [
  "Draft",
  "PendingAcceptance",
  "PendingEmployerApproval",
  "Active",
  "Completed",
  "Cancelled",
  "Disputed",
  "Resolved",
  "Declined",
  "Expired",
  "ActivationRejected",
];

export function ContractsPage() {
  const { connected } = useWallet();
  const params = useSearchParams();
  const router = useRouter();
  const { status, error, grouped, decimalsByMint, refresh } = useContracts();
  const initialRole = (params.get("role") as RoleFilter | null) ?? "all";
  const [role, setRole] = useState<RoleFilter>(
    initialRole === "hiring" || initialRole === "working" ? initialRole : "all"
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [lookup, setLookup] = useState("");

  const list = useMemo(
    () => filterContracts(grouped, role, statusFilter),
    [grouped, role, statusFilter]
  );

  if (!connected) return <ConnectPrompt />;

  if (status === "loading" || status === "idle") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <EmptyState
        title="Could not load contracts"
        body={error ?? "Retry the RPC request."}
        action={{ label: "Retry", onClick: () => void refresh() }}
      />
    );
  }

  const emptyCopy =
    role === "hiring"
      ? {
          title: "No hiring contracts",
          body: "When you fund work, those contracts appear here. The same wallet can still show Working contracts separately.",
        }
      : role === "working"
        ? {
            title: "No working contracts",
            body: "When someone hires this wallet, those contracts appear here.",
          }
        : {
            title: "No contracts yet",
            body: "Create a protected contract or wait for an employer to send one to this wallet.",
          };

  return (
    <PageFade>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">Contracts</p>
          <h1 className="mt-1 font-display text-4xl">Your work and hires</h1>
        </div>
        <Button onClick={() => router.push("/create")}>Create contract</Button>
      </div>
      <div className="mt-6 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <Tabs
            value={role}
            onChange={(id) => setRole(id as RoleFilter)}
            tabs={[
              { id: "all", label: "All", count: grouped.all.length },
              { id: "hiring", label: "Hiring", count: grouped.hiring.length },
              { id: "working", label: "Working", count: grouped.working.length },
            ]}
          />
        </div>
        <div className="w-full min-w-0 lg:w-52 lg:shrink-0">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
            className="max-w-full"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {presentStatus(s)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <form
        className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const pk = new PublicKey(lookup.trim());
            router.push(`/contracts/${pk.toBase58()}`);
          } catch {
            /* invalid key ignored; field validation below */
          }
        }}
      >
        <Field label="Open by contract address" hint="Useful for the named resolver.">
          <Input
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="Contract PDA"
            className="min-w-0"
          />
        </Field>
        <div className="sm:pt-7">
          <Button type="submit" variant="secondary">
            Open
          </Button>
        </div>
      </form>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {list.length === 0 ? (
          <div className="md:col-span-2">
            <EmptyState
              kind="contracts"
              title={emptyCopy.title}
              body={emptyCopy.body}
              action={{ label: "Create contract", onClick: () => router.push("/create") }}
            />
          </div>
        ) : (
          list.map((contract) => (
            <ContractCard
              key={contract.address.toBase58()}
              contract={contract}
              decimals={decimalsByMint[contract.tokenMint.toBase58()]}
            />
          ))
        )}
      </div>
    </PageFade>
  );
}
