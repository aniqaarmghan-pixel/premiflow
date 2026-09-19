"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { presentResolver } from "@/lib/app/dispute-ux";
import { formatTokenAmount } from "@/lib/app/money";
import {
  AI_CASE_SUMMARY_COPY,
  CASE_PREPARATION_COPY,
  COMING_LATER_EVIDENCE,
  DISPUTE_CATEGORIES,
  EVIDENCE_COPY,
  PARTY_STATEMENTS_COPY,
  PREMIFLOW_ASSISTANT,
  RESOLUTION_CENTER_COPY,
  RESOLUTION_CENTER_TITLE,
  RESOLVER_EXPLANATION,
  SUPPORT_VS_DISPUTE_COPY,
  type DisputeCategoryId,
  resolutionContext,
  resolutionLifecycleState,
} from "@/lib/app/resolution-center";
import { supportTopicHref } from "@/lib/app/support";
import { Card } from "@/components/ui/Card";
import { Field, Select, Textarea } from "@/components/ui/Field";
import type { ContractRole, ContractView, WorkUnitView } from "@/lib/streampay-v2";

export function ResolutionCenter({
  contract,
  units,
  now,
  decimals,
  role,
  showOpenGuidance,
  category,
  onCategoryChange,
  description,
  onDescriptionChange,
}: {
  contract: ContractView;
  units: readonly WorkUnitView[];
  now: number;
  decimals?: number;
  role: ContractRole;
  showOpenGuidance: boolean;
  category: DisputeCategoryId | "";
  onCategoryChange: (value: DisputeCategoryId | "") => void;
  description: string;
  onDescriptionChange: (value: string) => void;
}) {
  const resolver = presentResolver(contract.resolver);
  const context = resolutionContext(contract, units, now, (amount) =>
    formatTokenAmount(amount, decimals)
  );
  const lifecycle = resolutionLifecycleState(contract.status);
  const disputed = contract.status === "Disputed";
  const resolved = contract.status === "Resolved";

  if (!showOpenGuidance && !disputed && !resolved) return null;

  return (
    <div className="space-y-4">
      <Card
        className={
          disputed
            ? "border-danger/40 bg-[linear-gradient(180deg,rgba(232,93,117,0.10),transparent)] p-5"
            : "p-5"
        }
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">
          {RESOLUTION_CENTER_TITLE}
        </p>
        <h2 className="mt-1 font-display text-2xl">
          {disputed
            ? RESOLUTION_CENTER_COPY.heading
            : resolved
              ? RESOLUTION_CENTER_COPY.resolvedHeading
              : "Before you open a dispute"}
        </h2>
        {disputed ? (
          <>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{RESOLUTION_CENTER_COPY.frozen}</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              {RESOLUTION_CENTER_COPY.resolverReviews}
            </p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{RESOLUTION_CENTER_COPY.noTransfer}</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{RESOLUTION_CENTER_COPY.notStaffReview}</p>
          </>
        ) : resolved ? (
          <>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{RESOLUTION_CENTER_COPY.resolvedBody}</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{RESOLUTION_CENTER_COPY.noTransfer}</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              {SUPPORT_VS_DISPUTE_COPY.whenToDispute}
            </p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              {SUPPORT_VS_DISPUTE_COPY.supportFirst}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">
              {SUPPORT_VS_DISPUTE_COPY.examples.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link className="font-medium text-accent underline" href={supportTopicHref("disputes")}>
                {SUPPORT_VS_DISPUTE_COPY.helpLabel}
              </Link>
            </p>
          </>
        )}

        <ol className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {lifecycle.map((step) => (
            <li key={step.id} className="rounded-2xl bg-paper px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">{step.state}</p>
              <p className="text-sm font-medium text-ink">{step.label}</p>
            </li>
          ))}
        </ol>
      </Card>

      {showOpenGuidance ? (
        <Card className="p-5">
          <h3 className="font-display text-2xl">{CASE_PREPARATION_COPY.heading}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{CASE_PREPARATION_COPY.notStored}</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{CASE_PREPARATION_COPY.pageOnly}</p>
          <div className="mt-4 space-y-3">
            <Field
              label={CASE_PREPARATION_COPY.categoryLabel}
              hint={CASE_PREPARATION_COPY.categoryHint}
            >
              <Select
                value={category}
                onChange={(e) => onCategoryChange(e.target.value as DisputeCategoryId | "")}
              >
                <option value="">Choose a category (optional)</option>
                {DISPUTE_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={CASE_PREPARATION_COPY.descriptionLabel}
              hint={CASE_PREPARATION_COPY.descriptionHint}
            >
              <Textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Optional notes for this page only"
              />
            </Field>
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <h3 className="font-display text-2xl">{EVIDENCE_COPY.heading}</h3>
        <p className="mt-1 text-sm text-ink-faint">{EVIDENCE_COPY.noInventedHistory}</p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {EVIDENCE_COPY.availableNow}
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {context.facts.map((fact) => (
            <Row key={`${fact.label}:${fact.value}`} label={fact.label} value={fact.value} />
          ))}
        </dl>
        {context.notes.map((note) => (
          <p key={note} className="mt-3 text-sm leading-6 text-ink-soft">
            {note}
          </p>
        ))}
        {context.trial ? (
          <>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
              Paid trial
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {context.trial.map((fact) => (
                <Row key={`${fact.label}:${fact.value}`} label={fact.label} value={fact.value} />
              ))}
            </dl>
          </>
        ) : null}
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {EVIDENCE_COPY.comingLater}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">
          {COMING_LATER_EVIDENCE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      {disputed || resolved ? (
        <Card className="p-5">
          <h3 className="font-display text-2xl">{PARTY_STATEMENTS_COPY.heading}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{PARTY_STATEMENTS_COPY.unavailable}</p>
        </Card>
      ) : null}

      {disputed || resolved ? (
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {AI_CASE_SUMMARY_COPY.comingLater}
          </p>
          <h3 className="mt-1 font-display text-2xl">{AI_CASE_SUMMARY_COPY.heading}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{AI_CASE_SUMMARY_COPY.body}</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            {PREMIFLOW_ASSISTANT.name} will not decide who wins, allocate escrow, replace the
            designated resolver, or sign resolve_dispute.
          </p>
        </Card>
      ) : null}

      {disputed && role === "resolver" ? (
        <Card className="border-gold/40 bg-[linear-gradient(180deg,rgba(214,176,90,0.10),transparent)] p-5">
          <h3 className="font-display text-2xl">Decision</h3>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            You remain the decision-maker. Category and notes do not set a financial split.
          </p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{RESOLVER_EXPLANATION.definition}</p>
        </Card>
      ) : null}

      <Card className="p-5">
        <h3 className="font-display text-2xl">{RESOLVER_EXPLANATION.title}</h3>
        <p className="mt-2 text-sm leading-6 text-ink-soft">{RESOLVER_EXPLANATION.definition}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">
          {RESOLVER_EXPLANATION.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-6 text-ink-soft">{RESOLVER_EXPLANATION.configured}</p>
        <p className="mt-2 text-sm text-ink-faint">
          {resolver.roleTitle}: {resolver.displayName}
        </p>
        <p className="mt-3 text-sm">
          <Link className="font-medium text-accent underline" href={supportTopicHref("resolver")}>
            Read this in Help & Support
          </Link>
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-2xl bg-paper px-3 py-3">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{value}</dd>
    </div>
  );
}
