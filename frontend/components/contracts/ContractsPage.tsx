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
import { Input, Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import {
  buildContractsListHref,
  contractsListEmptyCopy,
  filterContractsByListQuery,
  parseContractsListQuery,
  type ContractsListStatusFilter,
} from "@/lib/app/contracts-list-query";
import { presentStatus, type RoleFilter } from "@/lib/app/view-model";
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
  const [lookup, setLookup] = useState("");

  const query = useMemo(() => parseContractsListQuery(params), [params]);

  const list = useMemo(
    () => filterContractsByListQuery(grouped, query),
    [grouped, query]
  );

  function replaceQuery(
    patch: Partial<{
      role: RoleFilter;
      status: ContractsListStatusFilter;
      type: typeof query.type;
      claim: typeof query.claim;
    }>
  ) {
    router.replace(buildContractsListHref({ ...query, ...patch }), {
      scroll: false,
    });
  }

  if (!connected) return <ConnectPrompt />;

  if (status === "loading" || status === "idle") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
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

  const emptyCopy = contractsListEmptyCopy(query);
  const statusSelectValue: string =
    query.status === "all" ? "all" : query.status;

  return (
    <PageFade>
      <div className="flex flex-wrap items-end justify-between gap-2.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan">
            Contracts
          </p>
          <h1 className="mt-0.5 font-display text-[1.65rem] tracking-tight sm:text-3xl">
            Your work and hires
          </h1>
        </div>
        <Button
          onClick={() => router.push("/create")}
          className="w-full px-3.5 py-2.5 text-[13px] sm:w-auto sm:py-1.5"
        >
          Create contract
        </Button>
      </div>

      <div className="mt-3 flex min-w-0 flex-col gap-2 sm:mt-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Tabs
            value={query.role}
            onChange={(id) => replaceQuery({ role: id as RoleFilter })}
            tabs={[
              { id: "all", label: "All", count: grouped.all.length },
              { id: "hiring", label: "Hiring", count: grouped.hiring.length },
              { id: "working", label: "Working", count: grouped.working.length },
            ]}
          />
        </div>
        <div className="w-full min-w-0 lg:w-52 lg:shrink-0">
          <Select
            value={statusSelectValue}
            onChange={(e) => {
              const next = e.target.value as ContractsListStatusFilter;
              replaceQuery({
                status: next,
                // Changing status via the control clears type/claim deep-links
                // unless they remain compatible — keep type/claim so combined
                // URLs stay editable from the select alone for status.
              });
            }}
            aria-label="Filter by status"
            className="max-w-full py-2 text-[13px] sm:py-1.5"
          >
            <option value="all">All statuses</option>
            <option value="review">Pending reviews</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {presentStatus(s)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {(query.type !== "all" || query.claim !== "none") && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          {query.type !== "all" ? (
            <span className="rounded-full bg-paper px-2.5 py-1">
              Type: {query.type}
            </span>
          ) : null}
          {query.claim !== "none" ? (
            <span className="rounded-full bg-paper px-2.5 py-1">
              Claim: {query.claim}
            </span>
          ) : null}
          <button
            type="button"
            className="font-medium text-accent underline-offset-2 hover:underline"
            onClick={() =>
              replaceQuery({ type: "all", claim: "none", status: query.status })
            }
          >
            Clear type / claim filters
          </button>
        </div>
      )}

      <form
        className="mt-2.5 flex min-w-0 flex-col gap-2 sm:mt-3 sm:flex-row sm:items-end"
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
        <label className="block w-full min-w-0 max-w-full space-y-1 sm:max-w-[26rem]">
          <span className="text-[13px] font-medium text-ink">Open by contract address</span>
          <Input
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="Contract PDA"
            className="min-w-0 py-2.5 text-[13px] sm:py-1.5"
          />
          <span className="block text-[11px] text-ink-faint">
            Useful for the designated resolver.
          </span>
        </label>
        <div className="sm:pb-5">
          <Button
            type="submit"
            variant="secondary"
            className="w-full px-3.5 py-2.5 text-[13px] sm:w-auto sm:py-1.5"
          >
            Open
          </Button>
        </div>
      </form>

      <div className="mt-3.5 grid gap-3 md:grid-cols-2">
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
