"use client";

import { browserSignatureStorage, readResolveSignature } from "@/lib/app/resolve-signature-store";
import { ACTIVE_CLUSTER_ID } from "@/lib/cluster";
import { explorerTxUrl } from "@/lib/network";

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
  type EvidenceFact,
  resolutionContext,
  resolutionLifecycleState,
} from "@/lib/app/resolution-center";
import {
  CASE_WORKSPACE_RECOVERY_FAILED,
  displayedCaseStatusLabel,
  caseLoadModeForRole,
  shouldAttemptCaseRecover,
  shouldLoadCaseAsResolver,
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
import { ensureMessagingSession } from "@/lib/app/messaging-session";
import { supportTopicHref } from "@/lib/app/support";
import { Card } from "@/components/ui/Card";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type {
  ContractRole,
  ContractView,
  HourlySessionView,
  HourlyStateView,
  WorkUnitView,
} from "@/lib/streampay-v2";
import { paymentModeLabel } from "@/lib/streampay-v2";
import {
  RESOLVER_UX_COPY,
  allocationUi,
  canEditPartyStatementForRole,
  freelancerAwardFromEmployerInput,
  parseFreelancerAllocation,
  postResolutionSummary,
  resolverSettlementSummary,
  validateResolverSettlement,
} from "@/lib/app/resolver-cases";

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
  canSettle = false,
  awardUi = "",
  onAwardChange,
  onReviewSettlement,
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
  /** True only for the on-chain resolver of a Disputed contract. */
  canSettle?: boolean;
  awardUi?: string;
  onAwardChange?: (value: string) => void;
  onReviewSettlement?: () => void;
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
  // Real confirmed resolve signature recorded by this browser, if any.
  const resolveSignature = resolved
    ? readResolveSignature(browserSignatureStorage(), ACTIVE_CLUSTER_ID, contract.address.toBase58())
    : null;
  const address = contract.address.toBase58();
  const { publicKey, signMessage } = useWallet();
  const connectedWallet = publicKey?.toBase58() ?? null;
  const [caseState, setCaseState] = useState<ResolutionCaseClientState>("idle");
  const [caseRecord, setCaseRecord] = useState<ResolutionCaseView | null>(null);
  const [statementDraft, setStatementDraft] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [statementBusy, setStatementBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [employerDraft, setEmployerDraft] = useState<string | null>(null);

  const loadCase = useCallback(
    async (requestedMode: "get" | "recover") => {
      if (
        !shouldAttemptCaseRecover(contract.status, role) &&
        !shouldLoadCaseAsResolver(contract.status, role)
      ) {
        setCaseState("idle");
        return;
      }
      // The resolver may only read the case; creation and recovery stay party-only.
      const mode = caseLoadModeForRole(role, requestedMode);
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
          if (role === "resolver") {
            setCaseState("not_created");
            return;
          }
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
    if (
      !shouldAttemptCaseRecover(contract.status, role) &&
      !shouldLoadCaseAsResolver(contract.status, role)
    ) {
      return;
    }
    void loadCase(recoverGeneration > 0 ? "recover" : "get");
    // recoverGeneration is the intentional refresh trigger after a confirmed dispute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, contract.status, role, recoverGeneration]);

  async function onVerifyWallet() {
    if (!connectedWallet) return;
    setVerifyBusy(true);
    try {
      const { session } = await ensureMessagingSession({
        wallet: connectedWallet,
        signMessage,
      });
      if (session.wallet !== connectedWallet) {
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
  const canEditStatement = canEditPartyStatementForRole(role);
  const resolverView = role === "resolver";
  const shouldLoadCase =
    shouldAttemptCaseRecover(contract.status, role) ||
    shouldLoadCaseAsResolver(contract.status, role);
  const allocation = parseFreelancerAllocation(awardUi, decimals, contract);
  const settlementCheck =
    allocation.award != null ? validateResolverSettlement(contract, allocation.award) : null;
  const employerError =
    employerDraft != null
      ? freelancerAwardFromEmployerInput(employerDraft, decimals, contract.contestedAmount).error
      : undefined;
  const employerValue =
    employerDraft != null
      ? employerDraft
      : allocation.award != null && decimals != null
        ? allocationUi(contract.contestedAmount - allocation.award, decimals)
        : "";
  const postResolution = postResolutionSummary(contract);

  function onFreelancerAllocationChange(value: string) {
    setEmployerDraft(null);
    onAwardChange?.(value);
  }

  function onEmployerAllocationChange(value: string) {
    setEmployerDraft(value);
    const next = freelancerAwardFromEmployerInput(value, decimals, contract.contestedAmount);
    if (next.award != null && decimals != null) onAwardChange?.(allocationUi(next.award, decimals));
  }

  function setAllocation(award: bigint) {
    if (decimals == null) return;
    setEmployerDraft(null);
    onAwardChange?.(allocationUi(award, decimals));
  }

  return (
    <div className="space-y-4">
      <Card
        className={
          disputed
            ? "border-danger/40 bg-[linear-gradient(180deg,rgba(232,93,117,0.10),transparent)] p-4 sm:p-5 lg:p-4"
            : "p-4 sm:p-5 lg:p-4"
        }
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger">
          {RESOLUTION_CENTER_TITLE}
        </p>
        <h2 className="mt-1 font-display text-xl">
          {disputed && resolverView
            ? RESOLVER_UX_COPY.assignedHeading
            : disputed
            ? RESOLUTION_CENTER_COPY.heading
            : resolved
              ? RESOLUTION_CENTER_COPY.resolvedHeading
              : "Before you open a dispute"}
        </h2>
        {disputed ? (
          <>
            {resolverView ? (
              <p className="mt-2 text-sm font-medium leading-6 text-ink">
                {RESOLVER_UX_COPY.assignedBody}
              </p>
            ) : null}
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

        <ol className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-3 2xl:grid-cols-6">
          {lifecycle.map((step) => (
            <li key={step.id} className="rounded-2xl bg-paper px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">{step.state}</p>
              <p className="text-sm font-medium text-ink">{step.label}</p>
            </li>
          ))}
        </ol>
      </Card>

      {resolverView && (disputed || resolved) ? (
        <Card className="p-4 sm:p-5 lg:p-4">
          <h3 className="font-display text-lg lg:text-base">{RESOLVER_UX_COPY.accountingHeading}</h3>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0 rounded-2xl bg-paper px-3 py-2">
              <dt className="text-xs uppercase tracking-wide text-ink-faint">Employer</dt>
              <dd className="mt-1">
                <Address value={contract.employer.toBase58()} />
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-paper px-3 py-2">
              <dt className="text-xs uppercase tracking-wide text-ink-faint">Freelancer</dt>
              <dd className="mt-1">
                <Address value={contract.freelancer.toBase58()} />
              </dd>
            </div>
            <Row label="Contract type" value={paymentModeLabel(contract.paymentMode)} />
            <Row label="Dispute initiator" value={contract.disputeInitiator} />
            <Row label="Total" value={formatTokenAmount(contract.totalAmount, decimals)} />
            <Row label="Released" value={formatTokenAmount(contract.releasedAmount, decimals)} />
            <Row label="Withdrawn" value={formatTokenAmount(contract.withdrawnAmount, decimals)} />
            <Row label="Refunded" value={formatTokenAmount(contract.refundedAmount, decimals)} />
            <Row
              label="Under dispute"
              value={formatTokenAmount(contract.contestedAmount, decimals)}
            />
          </dl>
          <p className="mt-2 text-xs text-ink-faint">{RESOLVER_UX_COPY.visibilityNote}</p>
        </Card>
      ) : null}

      {canSettle && resolverView && disputed ? (
        <Card className="border-gold/40 p-4 sm:p-5 lg:p-4">
          <h3 className="font-display text-lg lg:text-base">{RESOLVER_UX_COPY.settlementHeading}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{RESOLVER_UX_COPY.settlementBody}</p>
          {decimals == null ? (
            <p className="mt-2 text-sm text-ink-soft">{RESOLVER_UX_COPY.decimalsLoading}</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Freelancer allocation"
                  hint={RESOLVER_UX_COPY.freelancerHint}
                  error={awardUi.trim() && employerDraft == null ? allocation.error : undefined}
                >
                  <Input
                    inputMode="decimal"
                    value={awardUi}
                    onChange={(e) => onFreelancerAllocationChange(e.target.value)}
                  />
                </Field>
                <Field
                  label="Employer allocation"
                  hint={RESOLVER_UX_COPY.employerHint}
                  error={employerError}
                >
                  <Input
                    inputMode="decimal"
                    value={employerValue}
                    onChange={(e) => onEmployerAllocationChange(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setAllocation(contract.contestedAmount)}>
                  All to freelancer
                </Button>
                <Button variant="secondary" onClick={() => setAllocation(0n)}>
                  All to employer
                </Button>
              </div>
              {settlementCheck?.ok ? (
                <dl className="grid gap-2 sm:grid-cols-2">
                  {resolverSettlementSummary(settlementCheck, decimals).map((row) => (
                    <Row key={row.label} label={row.label} value={row.value} />
                  ))}
                </dl>
              ) : null}
              <Button
                disabled={!settlementCheck?.ok || Boolean(employerError) || !onReviewSettlement}
                onClick={() => onReviewSettlement?.()}
              >
                {RESOLVER_UX_COPY.reviewSettlement}
              </Button>
              <p className="text-xs text-ink-faint">{RESOLVER_UX_COPY.settlementNoTransfer}</p>
            </div>
          )}
        </Card>
      ) : null}

      {resolverView && resolved ? (
        <Card className="p-4 sm:p-5 lg:p-4">
          <h3 className="font-display text-lg lg:text-base">{RESOLVER_UX_COPY.settlementRecorded}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            {RESOLVER_UX_COPY.settlementRecordedBody}
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <Row
              label="Freelancer settlement"
              value={formatTokenAmount(postResolution.freelancerSettlement, decimals)}
            />
            <Row
              label="Employer refundable (total)"
              value={formatTokenAmount(postResolution.employerRefundableTotal, decimals)}
            />
            <Row
              label="Freelancer can still claim"
              value={formatTokenAmount(postResolution.freelancerClaimable, decimals)}
            />
            <Row
              label="Employer can still refund"
              value={formatTokenAmount(postResolution.employerRefundable, decimals)}
            />
          </dl>
          <p className="mt-2 text-xs leading-5 text-ink-faint">
            {RESOLVER_UX_COPY.partyClaimGuidance}
          </p>
          {resolveSignature ? (
            <a
              href={explorerTxUrl(resolveSignature)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs font-medium underline-offset-2 hover:underline"
            >
              View transaction
            </a>
          ) : null}
        </Card>
      ) : null}

      {showOpenGuidance ? (
        <Card className="p-4 sm:p-5 lg:p-4">
          <h3 className="font-display text-xl">{CASE_PREPARATION_COPY.heading}</h3>
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
        <Card className="p-4 sm:p-5 lg:p-4">
          <h3 className="font-display text-xl">{CASE_WORKSPACE_COPY.heading}</h3>
          {caseState === "loading" || (caseState === "idle" && shouldLoadCase) ? (
            <p className="mt-2 text-sm leading-6 text-ink-soft">{CASE_WORKSPACE_COPY.loading}</p>
          ) : null}
          {role === "resolver" && caseState === "not_created" ? (
            <p className="mt-2 text-sm leading-6 text-ink-soft">{RESOLVER_UX_COPY.noCase}</p>
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

      <Card className="p-4 sm:p-5 lg:p-4">
        <h3 className="font-display text-xl">{EVIDENCE_COPY.heading}</h3>
        <p className="mt-1 text-sm text-ink-faint">{EVIDENCE_COPY.noInventedHistory}</p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {EVIDENCE_COPY.availableNow}
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {context.facts.map((fact) => (
            <Row key={`${fact.label}:${fact.value}`} label={fact.label} value={<FactValue fact={fact} />} />
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
                <Row key={`${fact.label}:${fact.value}`} label={fact.label} value={<FactValue fact={fact} />} />
              ))}
            </dl>
          </>
        ) : null}
        {caseRecord && (disputed || resolved) ? (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
              Submitted message snapshots
            </p>

            {caseRecord.evidence.length > 0 ? (
              <div className="mt-3 space-y-3">
                {caseRecord.evidence.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-line bg-paper px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-ink">
                        Message snapshot
                      </p>

                      <time
                        className="text-[11px] text-ink-faint"
                        dateTime={item.submittedAt}
                      >
                        Submitted {new Date(item.submittedAt).toLocaleString()}
                      </time>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-soft [overflow-wrap:anywhere]">
                      {item.bodySnapshot}
                    </p>

                    <dl className="mt-3 grid gap-2 text-xs text-ink-faint sm:grid-cols-2">
                      <div>
                        <dt className="font-semibold">Original sender</dt>
                        <dd className="mt-1 break-all">
                          {item.senderWalletSnapshot}
                        </dd>
                      </div>

                      <div>
                        <dt className="font-semibold">Submitted by</dt>
                        <dd className="mt-1 break-all">
                          {item.submittedByRole}: {item.submittedBy}
                        </dd>
                      </div>

                      <div>
                        <dt className="font-semibold">Original message time</dt>
                        <dd className="mt-1">
                          {new Date(item.createdAtSnapshot).toLocaleString()}
                        </dd>
                      </div>

                      <div>
                        <dt className="font-semibold">Snapshot rule</dt>
                        <dd className="mt-1">
                          Immutable case copy — not live chat access
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                No contract-message snapshots have been submitted to this case.
              </p>
            )}

            <p className="mt-3 text-sm leading-6 text-ink-soft">
              The resolver can read these submitted snapshots but does not receive
              access to the private employer/freelancer message thread.
            </p>
          </div>
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
        <Card className="p-4 sm:p-5 lg:p-4">
          <h3 className="font-display text-xl">{PARTY_STATEMENTS_COPY.heading}</h3>
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
        <Card className="p-4 sm:p-5 lg:p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {AI_CASE_SUMMARY_COPY.comingLater}
          </p>
          <h3 className="mt-1 font-display text-xl">{AI_CASE_SUMMARY_COPY.heading}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{AI_CASE_SUMMARY_COPY.body}</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            {PREMIFLOW_ASSISTANT.name} will not decide who wins, allocate escrow, replace the
            designated resolver, or sign resolve_dispute.
          </p>
        </Card>
      ) : null}

      {disputed && role === "resolver" ? (
        <Card className="border-gold/40 bg-[linear-gradient(180deg,rgba(214,176,90,0.10),transparent)] p-4 sm:p-5 lg:p-4">
          <h3 className="font-display text-xl">Decision</h3>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            You remain the decision-maker. Category and notes do not set a financial split.
          </p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{RESOLVER_EXPLANATION.definition}</p>
        </Card>
      ) : null}

      <Card className="p-4 sm:p-5 lg:p-4">
        <h3 className="font-display text-xl">{RESOLVER_EXPLANATION.title}</h3>
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

function FactValue({ fact }: { fact: EvidenceFact }) {
  return fact.href ? (
    <a
      href={fact.href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all font-medium text-cyan underline-offset-2 hover:underline [overflow-wrap:anywhere]"
    >
      {fact.value} ↗
    </a>
  ) : (
    <>{fact.value}</>
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
