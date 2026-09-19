"use client";

import Link from "next/link";
import { MessagesSquare } from "lucide-react";

import {
  CONTRACT_MESSAGE_CHANNELS,
  CONTRACT_MESSAGES_SUBTITLE,
  CONTRACT_MESSAGES_TARGET_UX,
  CONTRACT_MESSAGES_TITLE,
  CONTRACT_MESSAGING_STATUS,
  MESSAGE_EVIDENCE_PLAN,
  contractMessagesCopy,
  isContractMessageParticipant,
} from "@/lib/app/contract-messages";
import type { ContractRole, PaymentModeName } from "@/lib/streampay-v2";

export function ContractMessages({
  role,
  paymentMode,
}: {
  role: ContractRole;
  paymentMode: PaymentModeName;
}) {
  const copy = contractMessagesCopy(role);
  const participant = isContractMessageParticipant(role);

  return (
    <section
      aria-labelledby="contract-messages-heading"
      className="rounded-[24px] border border-line bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {CONTRACT_MESSAGES_SUBTITLE}
          </p>
          <h2
            id="contract-messages-heading"
            className="mt-1 flex items-center gap-2 font-display text-2xl"
          >
            <MessagesSquare size={20} aria-hidden="true" />
            {CONTRACT_MESSAGES_TITLE}
          </h2>
        </div>
        <p
          className="rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold text-ink-soft"
          aria-live="polite"
        >
          {copy.status}
        </p>
      </div>

      <p className="mt-3 text-sm leading-6 text-ink-soft">{copy.body}</p>
      <p className="mt-2 text-sm text-ink-faint">{copy.audience}</p>
      <p className="mt-2 text-sm text-ink-faint">
        Same Messages surface for {paymentMode} and every other contract type.
      </p>

      {!CONTRACT_MESSAGING_STATUS.encrypted ? (
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          Messages are not encrypted yet. PREMIFLOW does not claim end-to-end encryption.
        </p>
      ) : null}

      <p className="mt-3 text-sm text-ink-faint">{CONTRACT_MESSAGES_TARGET_UX.unread}</p>

      {participant ? (
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          {MESSAGE_EVIDENCE_PLAN.explanation}
        </p>
      ) : null}

      <ul className="mt-4 space-y-1 text-sm leading-6 text-ink-soft">
        <li>
          <span className="font-medium text-ink">
            {CONTRACT_MESSAGE_CHANNELS.contractMessages.name}
          </span>
          {" — "}
          {CONTRACT_MESSAGE_CHANNELS.contractMessages.purpose}
        </li>
        <li>
          <Link
            className="font-medium text-accent underline"
            href={CONTRACT_MESSAGE_CHANNELS.helpSupport.href}
          >
            {CONTRACT_MESSAGE_CHANNELS.helpSupport.name}
          </Link>
          {" — "}
          {CONTRACT_MESSAGE_CHANNELS.helpSupport.purpose}
        </li>
        <li>
          <span className="font-medium text-ink">
            {CONTRACT_MESSAGE_CHANNELS.resolutionCenter.name}
          </span>
          {" — "}
          {CONTRACT_MESSAGE_CHANNELS.resolutionCenter.purpose}
        </li>
        <li>
          <span className="font-medium text-ink">
            {CONTRACT_MESSAGE_CHANNELS.assistant.name}
          </span>
          {" — "}
          {CONTRACT_MESSAGE_CHANNELS.assistant.purpose}
        </li>
      </ul>
    </section>
  );
}
