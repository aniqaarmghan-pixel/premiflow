"use client";

import Link from "next/link";
import { Flag, Layers, Timer, Waves } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Identicon } from "@/components/ui/Identicon";
import { Progress } from "@/components/ui/Progress";
import { StatusBadge } from "./StatusBadge";
import { unreadMessageAriaLabel, unreadMessageBadgeLabel } from "@/lib/app/contract-unread";
import { formatTokenAmount } from "@/lib/app/money";
import {
  BOTH_PARTIES_CARD_LABEL,
  roleAwareStatusLabelForWallets,
} from "@/lib/app/dashboard-offers";
import { contractCardNextHint } from "@/lib/app/dispute-ux";
import {
  financialProgress,
  presentType,
  roleLabel,
} from "@/lib/app/view-model";
import type { ContractView } from "@/lib/streampay-v2";
import { accountRoleForContract } from "@/lib/app/account-wallet-identity";
import { useContracts } from "@/lib/hooks/ContractsProvider";
import { useNow } from "@/lib/hooks/useNow";

export function ContractCard({
  contract,
  decimals,
  unreadMessages = 0,
}: {
  contract: ContractView;
  decimals?: number;
  unreadMessages?: number;
}) {
  const { accountWallets } = useContracts();
  const { now } = useNow(30_000);
  const partyRole = accountRoleForContract(accountWallets, contract);

  if (partyRole === "none") return null;

  const role =
    partyRole === "both"
      ? "employer"
      : partyRole;

  const other =
    partyRole === "freelancer" || partyRole === "resolver"
      ? { label: "Employer", address: contract.employer }
      : { label: "Freelancer", address: contract.freelancer };

  const progress = financialProgress(contract);

  return (
    <Link href={`/contracts/${contract.address.toBase58()}`} className="block min-w-0">
      <Card hover className="relative overflow-hidden p-3 sm:p-3.5">
        <span
          className={`absolute inset-y-0 left-0 w-1 ${
            contract.paymentMode === "Streaming"
              ? "bg-cyan"
              : contract.paymentMode === "Milestone"
                ? "bg-violet"
                : contract.paymentMode === "Hourly"
                  ? "bg-gold"
                  : "bg-accent-2"
          }`}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Identicon seed={other.address.toBase58()} size={30} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-snug text-ink">
                {other.label} {other.address.toBase58().slice(0, 6)}…
              </p>
              <p className="text-[11px] leading-4 text-ink-faint">
                {partyRole === "both"
                  ? BOTH_PARTIES_CARD_LABEL
                  : `${roleLabel(role)} on this contract`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {unreadMessages > 0 ? (
              <span
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white"
                aria-label={unreadMessageAriaLabel(unreadMessages)}
                title={unreadMessageAriaLabel(unreadMessages)}
              >
                {unreadMessageBadgeLabel(unreadMessages)}
              </span>
            ) : null}
            <StatusBadge
              status={contract.status}
              label={roleAwareStatusLabelForWallets(accountWallets, contract, now)}
              compact
            />
          </div>
        </div>
        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              {contract.paymentMode === "Streaming" ? (
                <Waves size={12} />
              ) : contract.paymentMode === "Milestone" ? (
                <Layers size={12} />
              ) : contract.paymentMode === "Hourly" ? (
                <Timer size={12} />
              ) : (
                <Flag size={12} />
              )}
              {presentType(contract.paymentMode)}
            </p>
            <p className="mt-0.5 font-display text-[1.5rem] leading-none tracking-tight text-ink sm:text-[1.55rem]">
              {formatTokenAmount(contract.totalAmount, decimals)}
            </p>
          </div>
          {contract.trialAmount > 0n ? (
            <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-semibold text-gold">
              Paid trial
            </span>
          ) : null}
        </div>
        <div className="mt-2">
          <Progress dense value={progress.releasedPct} label="Released of funded total" />
        </div>
        <p className="mt-1.5 text-xs font-medium leading-4 text-accent">
          {contractCardNextHint(
            partyRole === "both" && contract.status === "PendingAcceptance"
              ? "freelancer"
              : role,
            contract,
            now
          )}
        </p>
      </Card>
    </Link>
  );
}
