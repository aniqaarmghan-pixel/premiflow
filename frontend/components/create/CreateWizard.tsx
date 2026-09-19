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
  CONTRACT_TYPE_DECISION_HINTS,
  CONTRACT_TYPE_GUIDES,
  CONTRACT_TYPES,
} from "@/lib/app/contract-type-guide";
import {
  HOURLY_COPY,
  formatHourlyDuration,
  hourlyCreateReviewLines,
  hourlyFundingFromInputs,
  parseAuthorizedTime,
  parseEngagementDuration,
} from "@/lib/app/hourly-ux";
import {
  typeBlurb,
  presentType,
} from "@/lib/app/view-model";
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        <ol className="mb-6 flex min-w-0 flex-wrap gap-1">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  i === step
                    ? "bg-[linear-gradient(135deg,#0d9488,#4f8cff)] text-white"
                    : i < step
                      ? "bg-accent-soft text-accent"
                      : "bg-paper-2 text-ink-faint"
                }`}
              >
                {i + 1}. {label}
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
              <div className="space-y-4">
                <Field
                  label="Freelancer wallet"
                  error={errors.freelancer}
                  hint="The connected wallet is the employer."
                >
                  <Input
                    value={draft.freelancer}
                    onChange={(e) => patch({ freelancer: e.target.value })}
                    placeholder="Freelancer public key"
                  />
                </Field>
                <p className="text-sm text-ink-faint">
                  Employer: {publicKey?.toBase58() ?? "Connect a wallet"}
                </p>
              </div>
            ) : null}
            {step === 2 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-line bg-card px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Payment token
                  </p>
                  <p className="mt-1 font-medium text-ink">{paymentTokenLabel(draft.mint)}</p>
                  <p className="mt-1 text-xs text-ink-faint">
                    Configured automatically for this Devnet version
                    {tokenBalanceUi != null ? ` · wallet balance ${tokenBalanceUi}` : ""}.
                  </p>
                  {errors.mint ? <p className="mt-2 text-xs text-danger">{errors.mint}</p> : null}
                </div>
                {draft.paymentMode === "Hourly" ? (
                  <HourlyPaymentFields
                    draft={draft}
                    errors={errors}
                    preview={hourlyPreview}
                    onPatch={patch}
                  />
                ) : (
                  <Field label="Total funded amount" error={errors.totalAmountUi} hint="Includes any paid trial.">
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
              <div className="space-y-4">
                <Field label="Title" error={errors.title}>
                  <Input
                    value={draft.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="e.g. Brand site rebuild"
                  />
                </Field>
                <Field label="Work description" error={errors.description}>
                  <Textarea
                    value={draft.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    placeholder="What will be delivered?"
                  />
                </Field>
                {draft.paymentMode !== "Hourly" ? (
                  <Field
                    label="Deliverables"
                    hint="One item per line. Stored off-chain in this browser."
                    error={errors.deliverables}
                  >
                    <Textarea
                      value={draft.deliverables}
                      onChange={(e) => patch({ deliverables: e.target.value })}
                    />
                  </Field>
                ) : (
                  <p className="text-sm leading-6 text-ink-soft">
                    Hourly contracts do not use a Fixed-style main deliverable. The freelancer
                    records working time with Start work and Stop work after activation.
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
              <div className="space-y-4">
                <label className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
                  <input
                    type="checkbox"
                    checked={draft.trialEnabled}
                    onChange={(e) => patch({ trialEnabled: e.target.checked })}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-ink">Optional paid trial</span>
                    <p className="mt-1 text-sm text-ink-soft">
                      The trial is protected separately. Accepting the contract does not start
                      {draft.paymentMode === "Hourly"
                        ? " an Hourly work session"
                        : ` the main ${draft.paymentMode.toLowerCase()} work`}{" "}
                      until the trial is approved.
                    </p>
                  </span>
                </label>
                {draft.trialEnabled ? (
                  <Field label="Trial amount" error={errors.trialAmountUi}>
                    <Input
                      value={draft.trialAmountUi}
                      onChange={(e) => patch({ trialAmountUi: e.target.value })}
                    />
                  </Field>
                ) : null}
                <Field label="Maximum revisions" error={errors.maxRevisions} hint="0–5. Applies to reviewable work.">
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    value={draft.maxRevisions}
                    onChange={(e) => patch({ maxRevisions: Number(e.target.value) })}
                  />
                </Field>
              </div>
            ) : null}
            {step === 5 ? (
              <div className="space-y-4">
                {draft.paymentMode === "Hourly" ? (
                  <p className="text-sm leading-6 text-ink-soft">
                    Hourly contracts activate after acceptance and any trial review. The work
                    timer still does not start until the freelancer presses Start work.
                  </p>
                ) : (
                  <Field label="Start mode">
                    <Select
                      value={draft.startMode}
                      onChange={(e) =>
                        patch({ startMode: e.target.value as CreateWizardDraft["startMode"] })
                      }
                    >
                      <option value="OnActivation">When the contract activates</option>
                      <option value="Scheduled">At a scheduled start</option>
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
                <Field label="Acceptance deadline" error={errors.acceptanceDeadlineLocal}>
                  <Input
                    type="datetime-local"
                    value={draft.acceptanceDeadlineLocal}
                    onChange={(e) => patch({ acceptanceDeadlineLocal: e.target.value })}
                  />
                </Field>
                {draft.paymentMode === "Hourly" ? (
                  <div className="space-y-2">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                      <Field
                        label="Engagement window"
                        error={errors.engagementDurationValue}
                        hint="Calendar period during which work sessions may happen. Converted to seconds before create."
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
                    <p className="text-sm leading-6 text-ink-soft">
                      {HOURLY_COPY.authorizedVsEngagement}
                    </p>
                  </div>
                ) : (
                  <Field label="Duration (seconds)" error={errors.durationSeconds}>
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
                <Field label="Review window (seconds)" error={errors.reviewDuration}>
                  <Input
                    type="number"
                    value={draft.reviewDuration}
                    onChange={(e) => patch({ reviewDuration: Number(e.target.value) })}
                  />
                </Field>
                <Field
                  label="Activation review window (seconds)"
                  error={errors.activationReviewDuration}
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

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || tx.busy}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={tx.busy || Object.keys(errors).length > 0 || !client}
            >
              Create contract
            </Button>
          )}
        </div>
        {progressNote ? <p className="mt-3 text-sm text-ink-soft">{progressNote}</p> : null}
        <div className="mt-4">
          <TransactionStatus state={tx.state} />
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24 overflow-hidden rounded-[24px] border border-line bg-[linear-gradient(180deg,#07111f,#0c1b2e)] p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
            {brand.eyebrow}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={draft.paymentMode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <h3 className="mt-2 font-display text-2xl">{presentType(draft.paymentMode)}</h3>
              <p className="mt-2 text-sm leading-6 text-white/65">
                {typeBlurb(draft.paymentMode)}
              </p>
            </motion.div>
          </AnimatePresence>
          <dl className="mt-4 space-y-2 text-sm">
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
              <dd>{draft.trialEnabled ? draft.trialAmountUi || "—" : "None"}</dd>
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
            ? "The hourly contract is funded for the maximum authorized budget. The freelancer earns only for recorded work sessions. Title and notes stay in this browser."
            : "The funded contract is now waiting on the other party. Terms are on-chain; title and notes stay in this browser."
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
  const selectedGuide = CONTRACT_TYPE_GUIDES[value];
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl">{CONTRACT_TYPE_DECISION_HEADING}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {CONTRACT_TYPE_DECISION_HINTS.map((hint) => {
            const active = hint.type === value;
            return (
              <li key={hint.type}>
                <button
                  type="button"
                  onClick={() => onChange(hint.type)}
                  className={`w-full rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-line bg-paper-2/60 text-ink-soft hover:border-accent/40"
                  }`}
                >
                  <span className="font-medium text-ink">{hint.match}</span>
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    → {hint.type}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CONTRACT_TYPES.map((type) => {
          const selected = type === value;
          const guide = CONTRACT_TYPE_GUIDES[type];
          return (
            <motion.button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              whileHover={{ y: -4, scale: 1.01 }}
              animate={selected ? { y: -4, scale: 1.02 } : { y: 0, scale: 1 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className={`group rounded-[28px] border p-4 text-left transition duration-300 sm:p-5 ${
                selected
                  ? "border-accent bg-card shadow-[0_18px_40px_-24px_rgba(18,194,184,.55)] ring-2 ring-accent/30"
                  : "border-line bg-paper-2/50 hover:border-accent/40"
              }`}
            >
              <div className={`rounded-2xl bg-white ${selected ? "" : "hidden sm:block"}`}>
                <TypeMotif type={type} active={selected} />
              </div>
              <p className={`${selected ? "mt-3" : "sm:mt-3"} font-display text-2xl`}>
                {guide.title}
              </p>
              <p className="text-sm font-semibold text-accent">{guide.tagline}</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{guide.explanation}</p>
              <div className="mt-3 rounded-2xl bg-paper px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {guide.exampleHeading}
                </p>
                {(selected ? guide.exampleLines : guide.compactExampleLines).map((line) => (
                  <p key={line} className="mt-1 text-sm text-ink">
                    {line}
                  </p>
                ))}
              </div>
              {selected ? (
                <>
                  <p className="mt-3 text-sm leading-6 text-ink-soft">{guide.bestFor}</p>
                  {guide.collectNote ? (
                    <p className="mt-2 text-sm leading-6 text-ink-soft">{guide.collectNote}</p>
                  ) : null}
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Best for
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {guide.goodFor.map((item) => (
                      <li
                        key={item}
                        className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-ink-soft"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-xs leading-5 text-ink-faint">
                  Best for {guide.compactBestFor.toLowerCase()}
                </p>
              )}
            </motion.button>
          );
        })}
      </div>

      <div className="rounded-[24px] border border-line bg-card px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {selectedGuide.title} selected
        </p>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          {selectedGuide.selectedExplanation}
        </p>
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
    <div className="rounded-[24px] border border-line bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Milestones</h3>
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
      <div className="mt-3 space-y-3">
        {draft.milestones.map((m, i) => (
          <div key={i} className="rounded-2xl bg-card p-3">
            <p className="text-xs text-ink-faint">#{i}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
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
                className="mt-2 text-xs text-danger"
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
  return (
    <Card className="p-5">
      <h3 className="font-display text-2xl">Review</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Creating funds the contract from your token account. Milestone contracts then add each
        milestone and lock terms in follow-up signatures.
      </p>
      {draft.paymentMode === "Hourly" ? (
        <p className="mt-3 text-sm leading-6 text-ink-soft">{HOURLY_COPY.fundExplain}</p>
      ) : null}
      <ul className="mt-4 space-y-2 text-sm">
        <li>Worker: {draft.freelancer || "—"}</li>
        <li>Payment type: {presentType(draft.paymentMode)}</li>
        <li>Token: {paymentTokenLabel(draft.mint)}</li>
        {draft.paymentMode === "Hourly" ? (
          <HourlyReviewLines draft={draft} mainAmount={mainAmount} trialAmount={trialAmount} />
        ) : (
          <>
            <li>Amount: {draft.totalAmountUi || "—"}</li>
            <li>Main: {formatTokenAmount(mainAmount, draft.decimals)}</li>
            <li>Trial: {draft.trialEnabled ? formatTokenAmount(trialAmount, draft.decimals) : "None"}</li>
          </>
        )}
        <li>Title: {draft.title || "—"}</li>
        <li>
          Start:{" "}
          {draft.paymentMode === "Hourly"
            ? "On activation, then freelancer Start work"
            : draft.startMode}
        </li>
        {draft.paymentMode === "Hourly" ? null : (
          <li>Duration: {draft.durationSeconds}s</li>
        )}
        <li>Review window: {draft.reviewDuration}s</li>
        <li>Revisions: {draft.maxRevisions}</li>
        {draft.paymentMode === "Hourly" ? (
          <li>Deliverables: session-based — no Fixed main deliverable</li>
        ) : (
          <li>
            Deliverables:{" "}
            {draft.paymentMode === "Milestone"
              ? `${draft.milestones.length} milestone${draft.milestones.length === 1 ? "" : "s"}`
              : draft.deliverables.trim()
                ? draft.deliverables.split("\n").filter((line) => line.trim()).length
                : "—"}
          </li>
        )}
      </ul>
      <details className="mt-4 rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-ink-soft">
          Advanced contract details
        </summary>
        <div className="mt-3 space-y-2">
          <Address value={draft.mint} label="Mint" />
          <Address value={draft.resolver} label="Resolver" />
        </div>
      </details>
      {issueCount > 0 ? (
        <p className="mt-4 text-sm text-danger">
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
    <div className="space-y-4">
      <Field
        label="Hourly rate"
        error={errors.hourlyRateUi}
        hint={`Token units per hour in ${paymentTokenLabel(draft.mint)}.`}
      >
        <Input
          value={draft.hourlyRateUi}
          onChange={(e) => onPatch({ hourlyRateUi: e.target.value })}
          placeholder="e.g. 10"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <Field
          label="Authorized working time"
          error={errors.authorizedTimeValue}
          hint="Converted to whole seconds before the transaction is built."
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
      <div className="rounded-2xl border border-line bg-paper px-4 py-3 text-sm">
        <p>
          Hourly rate:{" "}
          <span className="font-medium text-ink">
            {draft.hourlyRateUi || "—"} / hour
          </span>
        </p>
        <p className="mt-1">
          Authorized time:{" "}
          <span className="font-medium text-ink">
            {preview
              ? formatHourlyDuration(preview.authorizedSeconds)
              : `${draft.authorizedTimeValue || "—"} ${draft.authorizedTimeUnit}`}
          </span>
        </p>
        <p className="mt-1">
          Maximum work budget:{" "}
          <span className="font-medium text-ink">
            {preview
              ? formatTokenAmount(preview.mainAmount, draft.decimals)
              : "—"}
          </span>
        </p>
        <p className="mt-2 text-ink-soft">{HOURLY_COPY.fundExplain}</p>
        <p className="mt-2 text-ink-soft">{HOURLY_COPY.authorizedVsEngagement}</p>
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
  const preview = previewHourlyFunding(draft);
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
      {preview ? (
        <li className="text-ink-soft">{HOURLY_COPY.authorizedVsEngagement}</li>
      ) : null}
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
