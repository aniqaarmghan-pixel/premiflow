"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { presentResolver } from "@/lib/app/dispute-ux";
import { formatTokenAmount } from "@/lib/app/money";
import {
  AI_CASE_SUMMARY_COPY,
  CASE_PREPARATION_COPY,
  CASE_WORKSPACE_COPY,
  COMING_LATER_EVIDENCE,
  DISPUTE_CATEGORIES,
  EVIDENCE_COPY,
  MESSAGE_EVIDENCE_COPY,
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
import {
  CASE_WORKSPACE_RECOVERY_FAILED,
  displayedCaseStatusLabel,
  shouldAttemptCaseRecover,
  type ResolutionCaseClientState,
  type ResolutionCaseView,
} from "@/lib/app/resolution-case";
import {
  fetchResolutionCase,
  recoverResolutionCase,
  updateResolutionCaseNotes,
  upsertResolutionCaseStatement,
  type ApiError,
} from "@/lib/app/resolution-case-client";
import {
  createChallenge,
  fetchSession,
  signatureToBase64,
  verifyChallenge,
} from "@/lib/app/messages-client";
import { supportTopicHref } from "@/lib/app/support";
import { Card } from "@/components/ui/Card";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Field";
import type {
  ContractRole,
  ContractView,
  HourlySessionView,
  HourlyStateView,
  WorkUnitView,
} from "@/lib/streampay-v2";
import { paymentModeLabel } from "@/lib/streampay-v2";

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
  hourlyState,
  hourlySession,
  recoverGeneration = 0,
  openSignature = null,
}: {
  contract: ContractView;
  units: readonly WorkUnitView[];
  now: number;
  decimals?: number;
  role: ContractRole;
  hourlyState?: HourlyStateView | null;
  hourlySession?: HourlySessionView | null;
  showOpenGuidance: boolean;
  category: DisputeCategoryId | "";
  onCategoryChange: (value: DisputeCategoryId | "") => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  recoverGeneration?: number;
  openSignature?: string | null;
}) {
  const resolver = presentResolver(contract.resolver);
  const context = resolutionContext(
    contract,
    units,
    now,
    (amount) => formatTokenAmount(amount, decimals),
    { hourlyState, hourlySession }
  );
  const lifecycle = resolutionLifecycleState(contract.status);
  const disputed = contract.status === "Disputed";
  const resolved = contract.status === "Resolved";
  const address = contract.address.toBase58();
  const { publicKey, signMessage } = useWallet();
  const connectedWallet = publicKey?.toBase58() ?? null;
  const [caseState, setCaseState] = useState<ResolutionCaseClientState>("idle");
  const [caseRecord, setCaseRecord] = useState<ResolutionCaseView | null>(null);
  const [statementDraft, setStatementDraft] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [statementBusy, setStatementBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const loadCase = useCallback(
    async (mode: "get" | "recover") => {
      if (!shouldAttemptCaseRecover(contract.status, role)) {
        setCaseState("idle");
        return;
      }
      setCaseState("loading");
      try {
        const result =
          mode === "recover"
            ? await recoverResolutionCase(address, {
                category,
                description,
                openSignature: openSignature ?? undefined,
              })
            : await fetchResolutionCase(address);
        setCaseRecord(result.case);
        setCaseState("ready");
        if (result.case.disputeCategory) {
          onCategoryChange(result.case.disputeCategory);
        }
        if (result.case.disputeDescription) {
          onDescriptionChange(result.case.disputeDescription);
        }
        const own =
          result.case.viewerRole === "employer"
            ? result.case.employerStatement
            : result.case.freelancerStatement;
        if (own) setStatementDraft(own.body);
      } catch (err) {
        const api = err as ApiError;
        if (api.status === 401) {
          setCaseState("unauthenticated");
          return;
        }
        if (api.status === 403) {
          setCaseState("forbidden");
          return;
        }
        if (api.code === "case_not_found" && mode === "get") {
          await loadCase("recover");
          return;
        }
        if (api.status === 503 || api.code === "backend_unavailable") {
          setCaseState(disputed || resolved ? "recovery_failed" : "unavailable");
          return;
        }
        setCaseState(disputed || resolved ? "recovery_failed" : "unavailable");
      }
    },
    [
      address,
      category,
      contract.status,
      description,
      disputed,
      onCategoryChange,
      onDescriptionChange,
      openSignature,
      resolved,
      role,
    ]
  );

  useEffect(() => {
    if (!shouldAttemptCaseRecover(contract.status, role)) return;
    void loadCase(recoverGeneration > 0 ? "recover" : "get");
    // recoverGeneration is the intentional refresh trigger after a confirmed dispute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, contract.status, role, recoverGeneration]);

  async function onVerifyWallet() {
    if (!connectedWallet || !signMessage) return;
    setVerifyBusy(true);
    try {
      const challenge = await createChallenge(connectedWallet);
      const signature = await signMessage(new TextEncoder().encode(challenge.message));
      await verifyChallenge(challenge.challengeId, signatureToBase64(signature));
      const me = await fetchSession();
      if (me.wallet !== connectedWallet) {
        setCaseState("unauthenticated");
        return;
      }
      await loadCase("recover");
    } catch {
      setCaseState("unauthenticated");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function onSaveNotes() {
    setNotesBusy(true);
    try {
      const result = await updateResolutionCaseNotes(address, { category, description });
      setCaseRecord(result.case);
    } catch (err) {
      const api = err as ApiError;
      if (api.status === 401) setCaseState("unauthenticated");
      if (api.status === 503) setCaseState("recovery_failed");
    } finally {
      setNotesBusy(false);
    }
  }

  async function onSaveStatement() {
    setStatementBusy(true);
    try {
      const result = await upsertResolutionCaseStatement(address, statementDraft);
      setCaseRecord(result.case);
    } catch (err) {
      const api = err as ApiError;
      if (api.status === 401) setCaseState("unauthenticated");
    } finally {
      setStatementBusy(false);
    }
  }

  if (!showOpenGuidance && !disputed && !resolved) return null;

  const ownStatement =
    caseRecord && role === "employer"
      ? caseRecord.employerStatement
      : caseRecord && role === "freelancer"
        ? caseRecord.freelancerStatement
        : null;
  const canEditStatement = role === "employer" || role === "freelancer";

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
          <CategoryFields
            category={category}
            description={description}
            onCategoryChange={onCategoryChange}
            onDescriptionChange={onDescriptionChange}
          />
        </Card>
      ) : null}

      {disputed || resolved ? (
        <Card className="p-5">
          <h3 className="font-display text-2xl">{CASE_WORKSPACE_COPY.heading}</h3>
          {caseState === "loading" || (caseState === "idle" && shouldAttemptCaseRecover(contract.status, role)) ? (
            <p className="mt-2 text-sm leading-6 text-ink-soft">{CASE_WORKSPACE_COPY.loading}</p>
          ) : null}
          {role === "resolver" ? (
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              Employer and freelancer use this case workspace. Resolver review is a later Resolution
              phase. Settlement still uses the on-chain resolve_dispute control.
            </p>
          ) : null}
          {caseState === "unauthenticated" ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm leading-6 text-ink-soft">{CASE_WORKSPACE_COPY.signIn}</p>
              <Button disabled={verifyBusy || !connectedWallet} onClick={() => void onVerifyWallet()}>
                Verify wallet
              </Button>
            </div>
          ) : null}
          {caseState === "recovery_failed" ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm leading-6 text-ink-soft">{CASE_WORKSPACE_RECOVERY_FAILED}</p>
              <Button onClick={() => void loadCase("recover")}>{CASE_WORKSPACE_COPY.retry}</Button>
            </div>
          ) : null}
          {caseState === "ready" && caseRecord ? (
            <div className="mt-4 space-y-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Row
                  label={CASE_WORKSPACE_COPY.chainStatus}
                  value={`${CASE_WORKSPACE_COPY.onChain}: ${caseRecord.chainStatus}`}
                />
                <Row
                  label={CASE_WORKSPACE_COPY.workflowStatus}
                  value={displayedCaseStatusLabel({
                    chainStatus: caseRecord.chainStatus,
                    workflowStatus: caseRecord.workflowStatus,
                    payoutState: caseRecord.payoutState,
                  })}
                />
                <div className="rounded-2xl bg-paper px-3 py-3">
                  <dt className="text-xs uppercase tracking-wide text-ink-faint">
                    {CASE_WORKSPACE_COPY.contractAddress}
                  </dt>
                  <dd className="mt-1">
                    <Address value={caseRecord.contractAddress} />
                  </dd>
                </div>
                <Row
                  label={CASE_WORKSPACE_COPY.contractType}
                  value={`${CASE_WORKSPACE_COPY.onChain}: ${paymentModeLabel(caseRecord.paymentMode)}`}
                />
                <Row
                  label={CASE_WORKSPACE_COPY.initiator}
                  value={`${CASE_WORKSPACE_COPY.onChain}: ${caseRecord.disputeOpener}`}
                />
                <Row
                  label={CASE_WORKSPACE_COPY.category}
                  value={
                    DISPUTE_CATEGORIES.find((item) => item.id === caseRecord.disputeCategory)
                      ?.label ?? CASE_WORKSPACE_COPY.noCategory
                  }
                />
                <Row
                  label={CASE_WORKSPACE_COPY.contested}
                  value={`${CASE_WORKSPACE_COPY.onChain}: ${formatTokenAmount(
                    BigInt(caseRecord.contestedAmount),
                    decimals
                  )}`}
                />
                <div className="rounded-2xl bg-paper px-3 py-3">
                  <dt className="text-xs uppercase tracking-wide text-ink-faint">
                    {CASE_WORKSPACE_COPY.resolver}
                  </dt>
                  <dd className="mt-1">
                    <Address value={caseRecord.resolverWallet} />
                  </dd>
                </div>
              </dl>
              <p className="text-sm leading-6 text-ink-soft">{CASE_WORKSPACE_COPY.contestedHint}</p>
              <p className="text-sm leading-6 text-ink-soft">{CASE_WORKSPACE_COPY.snapshotHint}</p>
              <p className="text-sm leading-6 text-ink-soft">
                {CASE_WORKSPACE_COPY.description}:{" "}
                {caseRecord.disputeDescription || CASE_WORKSPACE_COPY.noDescription}
              </p>
              {canEditStatement ? (
                <>
                  <CategoryFields
                    category={category}
                    description={description}
                    onCategoryChange={onCategoryChange}
                    onDescriptionChange={onDescriptionChange}
                  />
                  <Button disabled={notesBusy} onClick={() => void onSaveNotes()}>
                    {CASE_WORKSPACE_COPY.saveNotes}
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
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
        <p className="mt-2 text-sm leading-6 text-ink-soft">{EVIDENCE_COPY.nextPhase}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">
          {COMING_LATER_EVIDENCE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          {MESSAGE_EVIDENCE_COPY.actionLabel}: {MESSAGE_EVIDENCE_COPY.body}
        </p>
      </Card>

      {disputed || resolved ? (
        <Card className="p-5">
          <h3 className="font-display text-2xl">{PARTY_STATEMENTS_COPY.heading}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{PARTY_STATEMENTS_COPY.ready}</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{PARTY_STATEMENTS_COPY.ownOnly}</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{PARTY_STATEMENTS_COPY.resolverCannot}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <StatementRead
              title="Employer statement"
              statement={caseRecord?.employerStatement?.body ?? null}
            />
            <StatementRead
              title="Freelancer statement"
              statement={caseRecord?.freelancerStatement?.body ?? null}
            />
          </div>
          {canEditStatement && caseState === "ready" ? (
            <div className="mt-4 space-y-3">
              <Field label="Your statement" hint={PARTY_STATEMENTS_COPY.placeholder}>
                <Textarea
                  value={statementDraft}
                  onChange={(e) => setStatementDraft(e.target.value)}
                  maxLength={4000}
                />
              </Field>
              <Button disabled={statementBusy || !statementDraft.trim()} onClick={() => void onSaveStatement()}>
                {PARTY_STATEMENTS_COPY.save}
              </Button>
              {ownStatement ? (
                <p className="text-xs text-ink-faint">Last submitted {ownStatement.submittedAt}</p>
              ) : null}
            </div>
          ) : null}
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

function CategoryFields({
  category,
  description,
  onCategoryChange,
  onDescriptionChange,
}: {
  category: DisputeCategoryId | "";
  description: string;
  onCategoryChange: (value: DisputeCategoryId | "") => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <Field label={CASE_PREPARATION_COPY.categoryLabel} hint={CASE_PREPARATION_COPY.categoryHint}>
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
          maxLength={4000}
          placeholder="Optional case context"
        />
      </Field>
    </div>
  );
}

function StatementRead({ title, statement }: { title: string; statement: string | null }) {
  return (
    <div className="rounded-2xl bg-paper px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-ink-faint">{title}</p>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        {statement || CASE_WORKSPACE_COPY.missingStatement}
      </p>
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
