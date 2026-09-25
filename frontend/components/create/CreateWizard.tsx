"use client";

import { getAccount } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { TypeMotif } from "@/components/contracts/TypeMotif";
import { SuccessMoment } from "@/components/contracts/SuccessMoment";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { TransactionStatus } from "@/components/ui/TransactionStatus";
import { localMetadataStore } from "@/lib/app/local-metadata";
import { formatTokenAmount } from "@/lib/app/money";
import {
  lockedCreatePayment,
  paymentTokenLabel,
} from "@/lib/app/premiflow";
import {
  CONTRACT_TYPE_DECISION_HEADING,
  CONTRACT_TYPE_GUIDES,
  CONTRACT_TYPES,
  TYPE_SELECTION_CONTINUE_LABEL,
} from "@/lib/app/contract-type-guide";
import {
  HOURLY_COPY,
  hourlyCreateReviewLines,
  hourlyFundingFromInputs,
  parseAuthorizedTime,
  parseEngagementDuration,
} from "@/lib/app/hourly-ux";
import { presentType } from "@/lib/app/view-model";
import {
  applyCreateDraftPatch,
  defaultCreateDraft,
  parsePubkey,
  validateCreateDraft,
  validateMilestoneAllocation,
  type CreateWizardDraft,
  type MilestoneDraft,
} from "@/lib/app/validation";
import { Address } from "@/components/ui/Address";
import { deriveEmployerSourceAta } from "@/lib/streampay-v2";
import { useNow } from "@/lib/hooks/useNow";
import { useStreamPayClient } from "@/lib/hooks/useStreamPayClient";
import { useTx } from "@/lib/hooks/useTx";
import { brand } from "@/lib/brand";
import {
  emptyMetadata,
  localDateTimeInputToUnixSeconds,
  uiAmountToBaseUnits,
  type AuthorizedTimeUnit,
  type PaymentModeName,
} from "@/lib/streampay-v2";

const STEPS = [
  "Type",
  "Parties",
  "Payment",
  "Work",
  "Trial",
  "Schedule",
  "Review",
] as const;

export function CreateWizard() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const client = useStreamPayClient();
  const { now } = useNow(30_000);
  const tx = useTx();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CreateWizardDraft>(defaultCreateDraft);
  const [tokenBalanceUi, setTokenBalanceUi] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [createdAddress, setCreatedAddress] = useState<string | null>(null);
  const [progressNote, setProgressNote] = useState<string | null>(null);

  const errors = useMemo(
    () => (publicKey ? validateCreateDraft(publicKey, draft, now) : {}),
    [draft, now, publicKey]
  );

  const hourlyPreview = draft.paymentMode === "Hourly"
    ? previewHourlyFunding(draft)
    : null;
  const totalParsed =
    draft.paymentMode === "Hourly"
      ? hourlyPreview?.totalAmount ?? null
      : tryAmount(draft.totalAmountUi, draft.decimals);
  const trialParsed = draft.trialEnabled
    ? tryAmount(draft.trialAmountUi, draft.decimals)
    : 0n;
  const mainAmount =
    draft.paymentMode === "Hourly"
      ? hourlyPreview?.mainAmount ?? 0n
      : totalParsed != null && trialParsed != null
        ? totalParsed - trialParsed
        : 0n;
  const allocation =
    draft.paymentMode === "Milestone"
      ? validateMilestoneAllocation(
          draft.milestones,
          mainAmount,
          draft.decimals,
          draft.durationSeconds
        )
      : null;

  function patch(partial: Partial<CreateWizardDraft>) {
    setDraft((prev) => applyCreateDraftPatch(prev, partial));
  }

  useEffect(() => {
    setDraft((prev) => applyCreateDraftPatch(prev, {}));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadBalance() {
      if (!publicKey) {
        setTokenBalanceUi(null);
        return;
      }
      const token = lockedCreatePayment().token;
      try {
        const ata = deriveEmployerSourceAta(publicKey, token.mint);
        const account = await getAccount(connection, ata);
        if (!cancelled) {
          setTokenBalanceUi(formatTokenAmount(account.amount, token.decimals));
        }
      } catch {
        if (!cancelled) setTokenBalanceUi("0");
      }
    }
    void loadBalance();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  async function submit() {
    if (!publicKey || !client) return;
    if (Object.keys(errors).length > 0) return;
    const freelancer = parsePubkey(draft.freelancer, "Freelancer");
    let payment;
    try {
      payment = lockedCreatePayment();
    } catch (err) {
      setProgressNote(
        err instanceof Error ? err.message : "PREMIFLOW payment configuration is missing."
      );
      return;
    }
    const trialAmount = draft.trialEnabled
      ? uiAmountToBaseUnits(draft.trialAmountUi, payment.decimals)
      : 0n;
    const metadata = {
      ...emptyMetadata(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      deliverables: draft.deliverables
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };
    const stored = await localMetadataStore.put(metadata);
    const acceptanceDeadline = localDateTimeInputToUnixSeconds(
      draft.acceptanceDeadlineLocal
    );
    const scheduledStartTime =
      draft.startMode === "Scheduled"
        ? localDateTimeInputToUnixSeconds(draft.scheduledStartLocal)
        : 0;
    const checkpointInterval =
      draft.paymentMode === "Streaming" ? draft.checkpointInterval : 0;
    const contractId = BigInt(Date.now());

    const ok = await tx.run(
      "Create contract",
      async () => {
      setProgressNote("Creating contract…");
      const created =
        draft.paymentMode === "Hourly"
          ? await client.createHourlyContract({
              freelancer,
              tokenMint: payment.mint,
              request: {
                contractId,
                hourlyRate: uiAmountToBaseUnits(draft.hourlyRateUi, payment.decimals),
                authorizedSeconds: BigInt(
                  parseAuthorizedTime(
                    draft.authorizedTimeValue,
                    draft.authorizedTimeUnit
                  ).seconds ?? 0
                ),
                acceptanceDeadline,
                durationSeconds:
                  parseEngagementDuration(
                    draft.engagementDurationValue,
                    draft.engagementDurationUnit
                  ).seconds ?? 0,
                reviewDuration: draft.reviewDuration,
                activationReviewDuration: draft.activationReviewDuration,
                maxRevisions: draft.maxRevisions,
                trialAmount,
                resolver: payment.resolver.address,
                metadataUri: stored.uri,
                metadataHash: stored.hash,
              },
            })
          : await client.createContract({
              freelancer,
              tokenMint: payment.mint,
              request: {
                contractId,
                paymentMode: draft.paymentMode,
                startMode: draft.startMode,
                totalAmount: uiAmountToBaseUnits(draft.totalAmountUi, payment.decimals),
                acceptanceDeadline,
                scheduledStartTime,
                durationSeconds: draft.durationSeconds,
                checkpointInterval,
                reviewDuration: draft.reviewDuration,
                activationReviewDuration: draft.activationReviewDuration,
                maxRevisions: draft.maxRevisions,
                trialAmount,
                resolver: payment.resolver.address,
                metadataUri: stored.uri,
                metadataHash: stored.hash,
              },
            });
      if (draft.paymentMode === "Milestone" && created.contract) {
        for (const [i, milestone] of draft.milestones.entries()) {
          setProgressNote(`Adding milestone ${i + 1} of ${draft.milestones.length}…`);
          await client.addMilestone({
            contract: created.contract,
            amount: uiAmountToBaseUnits(milestone.amountUi, payment.decimals),
            dueOffsetSeconds: milestone.dueOffsetSeconds,
          });
        }
        setProgressNote("Locking terms…");
        await client.finalizeTerms(created.contract);
      }
      setCreatedAddress(created.contract?.toBase58() ?? null);
      return created;
    },
      { suppressNotice: true }
    );
    setProgressNote(null);
    if (ok) setSuccessOpen(true);
  }

  const canAdvance = stepReady(step, draft, errors, allocation?.allocated === mainAmount);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0">
        <ol className="mb-3 flex min-w-0 flex-wrap gap-1.5 sm:mb-4 sm:gap-1">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={`min-h-11 rounded-full px-3 py-1.5 text-[11px] font-semibold sm:min-h-0 sm:px-2.5 sm:py-1 ${
                  i === step
                    ? "bg-[linear-gradient(135deg,#0d9488,#4f8cff)] text-white"
                    : i < step
                      ? "bg-accent-soft text-accent"
                      : "bg-paper-2 text-ink-faint"
                }`}
              >
                {label}
              </button>
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.22 }}
          >
            {step === 0 ? (
              <TypeStep
                value={draft.paymentMode}
                onChange={(paymentMode) =>
                  patch({
                    paymentMode,
                    startMode:
                      paymentMode === "Hourly" ? "OnActivation" : draft.startMode,
                  })
                }
              />
            ) : null}
            {step === 1 ? (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  People
                </h2>
                <Field
                  label="Freelancer"
                  error={errors.freelancer}
                  hint="Who will receive payment?"
                >
                  <Input
                    value={draft.freelancer}
                    onChange={(e) => patch({ freelancer: e.target.value })}
                    placeholder="Freelancer wallet address"
                  />
                </Field>
                <p className="text-xs text-ink-faint">
                  Employer: your connected wallet
                </p>
              </div>
            ) : null}
            {step === 2 ? (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Payment
                </h2>
                <div className="rounded-xl border border-line bg-card px-3 py-2.5">
                  <p className="text-xs text-ink-faint">Token</p>
                  <p className="text-sm font-medium text-ink">
                    {paymentTokenLabel(draft.mint)}
                    {tokenBalanceUi != null ? (
                      <span className="ml-2 font-normal text-ink-faint">
                        · balance {tokenBalanceUi}
                      </span>
                    ) : null}
                  </p>
                  {errors.mint ? (
                    <p className="mt-1 text-xs text-danger">{errors.mint}</p>
                  ) : null}
                </div>
                {draft.paymentMode === "Hourly" ? (
                  <HourlyPaymentFields
                    draft={draft}
                    errors={errors}
                    preview={hourlyPreview}
                    onPatch={patch}
                  />
                ) : (
                  <Field
                    label="Amount"
                    error={errors.totalAmountUi}
                    hint="Total contract value."
                  >
                    <Input
                      value={draft.totalAmountUi}
                      onChange={(e) => patch({ totalAmountUi: e.target.value })}
                      placeholder="e.g. 1500"
                    />
                  </Field>
                )}
              </div>
            ) : null}
            {step === 3 ? (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Work
                </h2>
                <Field
                  label="Contract title"
                  error={errors.title}
                  hint="What are you hiring for?"
                >
                  <Input
                    value={draft.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="e.g. Brand site rebuild"
                  />
                </Field>
                <Field label="Description" error={errors.description}>
                  <Textarea
                    value={draft.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    placeholder="Brief scope of work"
                    rows={3}
                  />
                </Field>
                {draft.paymentMode !== "Hourly" ? (
                  <Field
                    label="Deliverables"
                    hint="One item per line."
                    error={errors.deliverables}
                  >
                    <Textarea
                      value={draft.deliverables}
                      onChange={(e) => patch({ deliverables: e.target.value })}
                      rows={3}
                    />
                  </Field>
                ) : (
                  <p className="text-xs text-ink-soft">
                    Hourly pay uses Start work / Stop work sessions — no separate deliverable list.
                  </p>
                )}
                {draft.paymentMode === "Milestone" ? (
                  <MilestoneBuilder
                    draft={draft}
                    mainAmount={mainAmount}
                    allocation={allocation}
                    onChange={(milestones) => patch({ milestones })}
                  />
                ) : null}
              </div>
            ) : null}
            {step === 4 ? (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Protection
                </h2>
                <label className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={draft.trialEnabled}
                    onChange={(e) => patch({ trialEnabled: e.target.checked })}
                    className="size-4"
                  />
                  <span>
                    <span className="text-sm font-medium text-ink">Paid trial</span>
                    <p className="text-xs text-ink-soft">
                      Test the collaboration before the main contract.
                    </p>
                  </span>
                </label>
                {draft.trialEnabled ? (
                  <Field
                    label="Trial amount"
                    error={errors.trialAmountUi}
                    hint="Separate protected amount."
                  >
                    <Input
                      value={draft.trialAmountUi}
                      onChange={(e) => patch({ trialAmountUi: e.target.value })}
                    />
                  </Field>
                ) : null}
                <details className="rounded-xl border border-line bg-paper px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium text-ink-soft">
                    Advanced protection settings
                  </summary>
                  <div className="mt-3 space-y-3">
                    <Field
                      label="Maximum revisions"
                      error={errors.maxRevisions}
                      hint="0–5 for reviewable work."
                    >
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        value={draft.maxRevisions}
                        onChange={(e) => patch({ maxRevisions: Number(e.target.value) })}
                      />
                    </Field>
                  </div>
                </details>
              </div>
            ) : null}
            {step === 5 ? (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Schedule
                </h2>
                {draft.paymentMode === "Hourly" ? (
                  <p className="text-xs text-ink-soft">
                    Activates after acceptance. Work sessions start only when the freelancer presses
                    Start work.
                  </p>
                ) : (
                  <Field label="Start mode" hint="When protected work begins.">
                    <Select
                      value={draft.startMode}
                      onChange={(e) =>
                        patch({ startMode: e.target.value as CreateWizardDraft["startMode"] })
                      }
                    >
                      <option value="OnActivation">On activation — employer starts it manually</option>
                      <option value="Scheduled">Scheduled — starts at a set time</option>
                    </Select>
                  </Field>
                )}
                {draft.paymentMode !== "Hourly" && draft.startMode === "Scheduled" ? (
                  <Field label="Scheduled start" error={errors.scheduledStartLocal}>
                    <Input
                      type="datetime-local"
                      value={draft.scheduledStartLocal}
                      onChange={(e) => patch({ scheduledStartLocal: e.target.value })}
                    />
                  </Field>
                ) : null}
                <Field
                  label="Acceptance deadline"
                  error={errors.acceptanceDeadlineLocal}
                  hint="Freelancer must accept by this time."
                >
                  <Input
                    type="datetime-local"
                    value={draft.acceptanceDeadlineLocal}
                    onChange={(e) => patch({ acceptanceDeadlineLocal: e.target.value })}
                  />
                </Field>
                {draft.paymentMode === "Hourly" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                      <Field
                        label="Engagement window"
                        error={errors.engagementDurationValue}
                        hint="Calendar period for work sessions."
                      >
                        <Input
                          value={draft.engagementDurationValue}
                          onChange={(e) =>
                            patch({ engagementDurationValue: e.target.value })
                          }
                          placeholder="e.g. 14"
                        />
                      </Field>
                      <Field label="Unit">
                        <Select
                          value={draft.engagementDurationUnit}
                          onChange={(e) =>
                            patch({
                              engagementDurationUnit: e.target
                                .value as AuthorizedTimeUnit,
                            })
                          }
                        >
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </Select>
                      </Field>
                    </div>
                    <p className="text-xs leading-5 text-ink-soft">
                      {HOURLY_COPY.authorizedVsEngagement}
                    </p>
                  </>
                ) : (
                  <Field
                    label="Duration (seconds)"
                    error={errors.durationSeconds}
                    hint="How long the main work period lasts."
                  >
                    <Input
                      type="number"
                      min={60}
                      value={draft.durationSeconds}
                      onChange={(e) => patch({ durationSeconds: Number(e.target.value) })}
                    />
                  </Field>
                )}
                {draft.paymentMode === "Streaming" ? (
                  <Field
                    label="Checkpoint interval (seconds)"
                    error={errors.checkpointInterval}
                    hint="Must divide the duration evenly."
                  >
                    <Input
                      type="number"
                      min={1}
                      value={draft.checkpointInterval}
                      onChange={(e) =>
                        patch({ checkpointInterval: Number(e.target.value) })
                      }
                    />
                  </Field>
                ) : null}
                <details className="rounded-xl border border-line bg-paper px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium text-ink-soft">
                    Advanced protection settings
                  </summary>
                  <div className="mt-3 space-y-3">
                    <Field
                      label="Review window (seconds)"
                      error={errors.reviewDuration}
                      hint="Time to review submitted work."
                    >
                      <Input
                        type="number"
                        value={draft.reviewDuration}
                        onChange={(e) => patch({ reviewDuration: Number(e.target.value) })}
                      />
                    </Field>
                    <Field
                      label="Activation review window (seconds)"
                      error={errors.activationReviewDuration}
                      hint="Time to approve activation."
                    >
                      <Input
                        type="number"
                        value={draft.activationReviewDuration}
                        onChange={(e) =>
                          patch({ activationReviewDuration: Number(e.target.value) })
                        }
                      />
                    </Field>
                  </div>
                </details>
              </div>
            ) : null}
            {step === 6 ? (
              <ReviewPanel
                draft={draft}
                errors={errors}
                mainAmount={mainAmount}
                trialAmount={trialParsed ?? 0n}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>

        <div
          className={`mt-4 flex flex-wrap items-center gap-3 sm:mt-4 ${
            step === 0 ? "justify-end" : "justify-between"
          }`}
        >
          {step > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={tx.busy}
              className="min-h-11 px-4 py-2.5 sm:min-h-0 sm:py-2"
            >
              Back
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              className="min-h-11 min-w-[8.5rem] px-4 py-2.5 sm:min-h-0 sm:py-2"
            >
              {step === 0 ? TYPE_SELECTION_CONTINUE_LABEL : "Continue"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={tx.busy || Object.keys(errors).length > 0 || !client}
              className="min-h-11 px-4 py-2.5 sm:min-h-0 sm:py-2"
            >
              Create contract
            </Button>
          )}
        </div>
        {progressNote ? <p className="mt-2 text-sm text-ink-soft">{progressNote}</p> : null}
        <div className="mt-3">
          <TransactionStatus state={tx.state} />
        </div>
      </div>

      <aside className="hidden lg:block lg:pt-11">
        <div className="sticky top-24 overflow-hidden rounded-2xl border border-line bg-[linear-gradient(180deg,#07111f,#0c1b2e)] p-4 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan">
            {brand.eyebrow}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={draft.paymentMode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <h3 className="mt-1.5 font-display text-xl">{presentType(draft.paymentMode)}</h3>
              <p className="mt-1 text-xs leading-5 text-white/65">
                {CONTRACT_TYPE_GUIDES[draft.paymentMode].cardSummary}
              </p>
            </motion.div>
          </AnimatePresence>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-white/45">Amount</dt>
              <dd>
                {draft.paymentMode === "Hourly"
                  ? hourlyPreview
                    ? formatTokenAmount(hourlyPreview.mainAmount, draft.decimals)
                    : "—"
                  : draft.totalAmountUi || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-white/45">Trial</dt>
              <dd>{draft.trialEnabled ? draft.trialAmountUi || "—" : "Off"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-white/45">
                {draft.paymentMode === "Hourly" ? "Engagement" : "Duration"}
              </dt>
              <dd>
                {draft.paymentMode === "Hourly"
                  ? `${draft.engagementDurationValue || "—"} ${draft.engagementDurationUnit}`
                  : `${draft.durationSeconds}s`}
              </dd>
            </div>
          </dl>
        </div>
      </aside>

      <SuccessMoment
        open={successOpen}
        title="Contract created"
        body={
          draft.paymentMode === "Hourly"
            ? "Funded for the authorized budget. Earnings follow recorded work sessions."
            : "Funded and waiting on the other party. Terms are on-chain."
        }
        onClose={() => {
          setSuccessOpen(false);
          if (createdAddress) router.push(`/contracts/${createdAddress}`);
        }}
      />
    </div>
  );
}

function TypeStep({
  value,
  onChange,
}: {
  value: PaymentModeName;
  onChange: (type: PaymentModeName) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-xl sm:text-2xl">{CONTRACT_TYPE_DECISION_HEADING}</h2>
        <p className="mt-1 text-sm text-ink-soft">Pick one payment style.</p>
      </div>

      <div className="grid min-w-0 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {CONTRACT_TYPES.map((type) => {
          const selected = type === value;
          const guide = CONTRACT_TYPE_GUIDES[type];
          return (
            <motion.button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              aria-pressed={selected}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={`min-w-0 rounded-2xl border p-3 text-left transition sm:p-3.5 lg:p-4 ${
                selected
                  ? "border-[#00C2AB] bg-card shadow-[0_10px_24px_-18px_rgba(0,194,171,.7)] ring-1 ring-[#3BB3D0]/40"
                  : "border-line bg-paper-2/40 hover:border-[#00C2AB]/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.95rem] font-semibold leading-snug text-ink sm:text-base">
                  {guide.title}
                </p>
                {selected ? (
                  <span className="rounded-full bg-cyan/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan">
                    Selected
                  </span>
                ) : null}
              </div>
              <div className="mt-2 h-14 overflow-hidden rounded-xl bg-white sm:mt-2.5 sm:h-16 lg:h-[4.25rem] [&_svg]:mx-auto [&_svg]:h-full [&_svg]:w-auto">
                <TypeMotif type={type} active={selected} />
              </div>
              <p className="mt-2 text-xs leading-5 text-ink-soft sm:mt-2.5 sm:text-[0.8125rem]">
                {guide.cardSummary}
              </p>
              <p className="mt-1.5 text-[11px] leading-4 text-ink-faint">
                Best for: {guide.cardBestFor}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function MilestoneBuilder({
  draft,
  mainAmount,
  allocation,
  onChange,
}: {
  draft: CreateWizardDraft;
  mainAmount: bigint;
  allocation: ReturnType<typeof validateMilestoneAllocation> | null;
  onChange: (milestones: MilestoneDraft[]) => void;
}) {
  function update(i: number, partial: Partial<MilestoneDraft>) {
    onChange(draft.milestones.map((m, idx) => (idx === i ? { ...m, ...partial } : m)));
  }
  return (
    <div className="rounded-xl border border-line bg-paper p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Milestones</h3>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([
              ...draft.milestones,
              {
                label: `Milestone ${draft.milestones.length + 1}`,
                amountUi: "",
                dueOffsetSeconds: Math.min(
                  draft.durationSeconds,
                  (draft.milestones.at(-1)?.dueOffsetSeconds ?? 0) + 3_600
                ),
              },
            ])
          }
        >
          Add
        </Button>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        Allocated {formatTokenAmount(allocation?.allocated ?? 0n, draft.decimals)} · remaining{" "}
        {formatTokenAmount(allocation?.remaining ?? mainAmount, draft.decimals)}
      </p>
      <div className="mt-2 space-y-2">
        {draft.milestones.map((m, i) => (
          <div key={i} className="rounded-xl bg-card p-2.5">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                value={m.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Label"
              />
              <Input
                value={m.amountUi}
                onChange={(e) => update(i, { amountUi: e.target.value })}
                placeholder="Amount"
              />
              <Input
                type="number"
                value={m.dueOffsetSeconds}
                onChange={(e) => update(i, { dueOffsetSeconds: Number(e.target.value) })}
                placeholder="Due offset (s)"
              />
            </div>
            {draft.milestones.length > 1 ? (
              <button
                type="button"
                className="mt-1.5 text-xs text-danger"
                onClick={() => onChange(draft.milestones.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewPanel({
  draft,
  errors,
  mainAmount,
  trialAmount,
}: {
  draft: CreateWizardDraft;
  errors: Record<string, string>;
  mainAmount: bigint;
  trialAmount: bigint;
}) {
  const issueCount = Object.keys(errors).length;
  const rows: [string, string][] = [
    ["Contract", presentType(draft.paymentMode)],
    [
      "Amount",
      draft.paymentMode === "Hourly"
        ? formatTokenAmount(mainAmount, draft.decimals)
        : draft.totalAmountUi || "—",
    ],
    ["Freelancer", draft.freelancer ? `${draft.freelancer.slice(0, 4)}…${draft.freelancer.slice(-4)}` : "—"],
    [
      "Start",
      draft.paymentMode === "Hourly"
        ? "On activation"
        : draft.startMode === "OnActivation"
          ? "On activation"
          : "Scheduled",
    ],
    ["Trial", draft.trialEnabled ? formatTokenAmount(trialAmount, draft.decimals) : "Disabled"],
    ["Review period", `${draft.reviewDuration}s`],
    ["Revisions", String(draft.maxRevisions)],
    ["Title", draft.title || "—"],
  ];
  if (draft.paymentMode === "Hourly") {
    rows.splice(2, 0, ["Token", paymentTokenLabel(draft.mint)]);
  } else {
    rows.splice(2, 0, ["Token", paymentTokenLabel(draft.mint)]);
    rows.push(["Duration", `${draft.durationSeconds}s`]);
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Review
      </h2>
      <h3 className="mt-1 font-display text-xl">Confirm and create</h3>
      <p className="mt-1 text-xs text-ink-soft">
        Creating funds the contract from your wallet
        {draft.paymentMode === "Milestone" ? ", then locks milestones in follow-up steps" : ""}.
      </p>
      {draft.paymentMode === "Hourly" ? (
        <p className="mt-2 text-xs text-ink-soft">{HOURLY_COPY.fundExplain}</p>
      ) : null}
      <dl className="mt-3 divide-y divide-line rounded-xl border border-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <dt className="text-ink-faint">{label}</dt>
            <dd className="max-w-[60%] text-right font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {draft.paymentMode === "Hourly" ? (
        <ul className="mt-2 space-y-1 text-xs text-ink-soft">
          <HourlyReviewLines draft={draft} mainAmount={mainAmount} trialAmount={trialAmount} />
        </ul>
      ) : null}
      <details className="mt-3 rounded-xl border border-line bg-paper px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-ink-soft">Advanced settings</summary>
        <div className="mt-2 space-y-2">
          <Address value={draft.mint} label="Mint" />
          <Address value={draft.resolver} label="Resolver" />
        </div>
      </details>
      {issueCount > 0 ? (
        <p className="mt-3 text-sm text-danger">
          {issueCount} field{issueCount === 1 ? "" : "s"} still need attention before create.
        </p>
      ) : null}
    </Card>
  );
}

function previewHourlyFunding(draft: CreateWizardDraft) {
  const rate = tryAmount(draft.hourlyRateUi, draft.decimals);
  const authorized = parseAuthorizedTime(
    draft.authorizedTimeValue,
    draft.authorizedTimeUnit
  );
  if (rate == null || !authorized.seconds) return null;
  const trial = draft.trialEnabled
    ? tryAmount(draft.trialAmountUi, draft.decimals)
    : 0n;
  if (trial == null) return null;
  try {
    return hourlyFundingFromInputs({
      hourlyRate: rate,
      authorizedSeconds: authorized.seconds,
      trialAmount: trial,
    });
  } catch {
    return null;
  }
}

function HourlyPaymentFields({
  draft,
  errors,
  preview,
  onPatch,
}: {
  draft: CreateWizardDraft;
  errors: Record<string, string>;
  preview: ReturnType<typeof previewHourlyFunding>;
  onPatch: (partial: Partial<CreateWizardDraft>) => void;
}) {
  return (
    <div className="space-y-3">
      <Field
        label="Hourly rate"
        error={errors.hourlyRateUi}
        hint={`Per hour in ${paymentTokenLabel(draft.mint)}.`}
      >
        <Input
          value={draft.hourlyRateUi}
          onChange={(e) => onPatch({ hourlyRateUi: e.target.value })}
          placeholder="e.g. 10"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
        <Field
          label="Authorized working time"
          error={errors.authorizedTimeValue}
          hint="Maximum payable work time."
        >
          <Input
            value={draft.authorizedTimeValue}
            onChange={(e) => onPatch({ authorizedTimeValue: e.target.value })}
            placeholder="e.g. 8"
          />
        </Field>
        <Field label="Unit">
          <Select
            value={draft.authorizedTimeUnit}
            onChange={(e) =>
              onPatch({
                authorizedTimeUnit: e.target.value as AuthorizedTimeUnit,
              })
            }
          >
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </Select>
        </Field>
      </div>
      <div className="rounded-xl border border-line bg-paper px-3 py-2.5 text-xs">
        <p>
          Max work budget:{" "}
          <span className="font-medium text-ink">
            {preview ? formatTokenAmount(preview.mainAmount, draft.decimals) : "—"}
          </span>
        </p>
        <p className="mt-1 text-ink-soft">
          Funded up front; earnings follow recorded sessions.
        </p>
      </div>
    </div>
  );
}

function HourlyReviewLines({
  draft,
  mainAmount,
  trialAmount,
}: {
  draft: CreateWizardDraft;
  mainAmount: bigint;
  trialAmount: bigint;
}) {
  const lines = hourlyCreateReviewLines({
    hourlyRateUi: draft.hourlyRateUi,
    authorizedTimeValue: draft.authorizedTimeValue,
    authorizedTimeUnit: draft.authorizedTimeUnit,
    engagementDurationValue: draft.engagementDurationValue,
    engagementDurationUnit: draft.engagementDurationUnit,
    maxWorkBudgetLabel: formatTokenAmount(mainAmount, draft.decimals),
    trialEnabled: draft.trialEnabled,
    trialAmountLabel: formatTokenAmount(trialAmount, draft.decimals),
    maxEscrowLabel: `${formatTokenAmount(mainAmount + trialAmount, draft.decimals)} (work budget${draft.trialEnabled ? " + trial" : ""})`,
  });
  return (
    <>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </>
  );
}

function tryAmount(ui: string, decimals: number): bigint | null {
  try {
    return uiAmountToBaseUnits(ui, decimals);
  } catch {
    return null;
  }
}

function stepReady(
  step: number,
  draft: CreateWizardDraft,
  errors: Record<string, string>,
  milestonesOk: boolean
): boolean {
  if (step === 0) return true;
  if (step === 1) return !errors.freelancer;
  if (step === 2) {
    if (draft.paymentMode === "Hourly") {
      return (
        !errors.mint &&
        !errors.decimals &&
        !errors.hourlyRateUi &&
        !errors.authorizedTimeValue &&
        Boolean(draft.hourlyRateUi.trim())
      );
    }
    return !errors.mint && !errors.totalAmountUi && !errors.decimals;
  }
  if (step === 3) {
    if (errors.title || errors.description) return false;
    if (draft.paymentMode === "Milestone") return milestonesOk;
    return true;
  }
  if (step === 4) return !errors.trialAmountUi && !errors.maxRevisions;
  if (step === 5) {
    return (
      !errors.durationSeconds &&
      !errors.engagementDurationValue &&
      !errors.reviewDuration &&
      !errors.acceptanceDeadlineLocal &&
      !errors.scheduledStartLocal &&
      !errors.checkpointInterval
    );
  }
  return Object.keys(errors).length === 0;
}
