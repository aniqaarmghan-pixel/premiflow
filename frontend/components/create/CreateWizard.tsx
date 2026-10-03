"use client";

import { getAccount } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { TypeMotif } from "@/components/contracts/TypeMotif";
import { SuccessMoment } from "@/components/contracts/SuccessMoment";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { TransactionStatus } from "@/components/ui/TransactionStatus";
import { localMetadataStore } from "@/lib/app/local-metadata";
import { requestOfferLifecycleNotification } from "@/lib/app/lifecycle-notifications-client";
import {
  CREATE_SEND_OFFER_LABEL,
  OPEN_CONTRACT_LABEL,
  RESUME_SETUP_LABEL,
  SETUP_INCOMPLETE_LABEL,
  bytesToHex,
  canResumeCreateSetup,
  clearCreateIntent,
  createProgressLines,
  createRunLock,
  createStepNote,
  decideDiscard,
  ensureCreateIntent,
  isCreateTxInFlight,
  isRetryableConflict,
  loadCreateIntent,
  markCreateAttempted,
  needsTxResetBeforeResume,
  planNextCreateStep,
  runCreateSetup,
  saveCreateIntent,
  toCreateContractRequest,
  toCreateHourlyContractRequest,
  touchCreateActivity,
  type CreateIntent,
  type CreateIntentRequest,
  type CreateIntentTerms,
  type CreatePlan,
  type CreateProgress,
  type CreateSetupOutcome,
  type DiscardChainState,
  type IntentScope,
  type IntentStorage,
  type LoadIntentResult,
  type ObservedCreateState,
} from "@/lib/app/milestone-create-plan";
import { releaseUnsentCreateAttempt } from "@/lib/app/create-attempt-recovery";
import {
  CREATE_DRAFT_SAVE_DEBOUNCE_MS,
  NO_WALLET_DRAFT_OWNER,
  acceptanceWindowOptions,
  clearAllCreateDrafts,
  clearCreateDraft,
  loadCreateDraft,
  resolveAcceptanceDeadline,
  saveCreateDraft,
  type SavedCreateDraft,
} from "@/lib/app/create-draft-store";
import {
  HANDOFF_COPY,
  handoffPromptKind,
  handoffUseLabel,
  loadPendingHandoff,
  resolveHandoffChoice,
  type HandoffChoice,
} from "@/lib/app/marketplace-handoff-store";
import { linkConfirmedMarketplaceContract, resumeMarketplaceLinks } from "@/lib/app/marketplace-auto-link";
import {
  bindMarketplaceSource,
  clearMarketplaceSource,
  dropAwaitingLinks,
  saveMarketplaceSource,
} from "@/lib/app/marketplace-link-store";
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
  validateCreateDraftBase,
  validateMilestoneAllocation,
  type CreateWizardDraft,
  type MilestoneDraft,
} from "@/lib/app/validation";
import { Address } from "@/components/ui/Address";
import {
  STREAMPAY_PROGRAM_ID,
  deriveContractPda,
  deriveEmployerSourceAta,
  deriveHourlyStatePda,
  fetchContractIfExists,
  fetchHourlyStateIfExists,
  fetchIndexedWorkUnits,
} from "@/lib/streampay-v2";
import { ACTIVE_CLUSTER_ID } from "@/lib/cluster";
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

function intentStorage(): IntentStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Storage blocked by the browser: saving fails loudly before any send.
    return null;
  }
}

/** Client-only flag without setState in an effect (server render is false). */
function subscribeNothing(): () => void {
  return () => {};
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Saved setups belong to one cluster + program deployment. */
const INTENT_SCOPE: IntentScope = {
  cluster: ACTIVE_CLUSTER_ID,
  programId: STREAMPAY_PROGRAM_ID.toBase58(),
};

function deriveIntentAddress(employer: string, freelancer: string, contractId: bigint): string {
  return deriveContractPda(
    new PublicKey(employer),
    new PublicKey(freelancer),
    contractId,
    STREAMPAY_PROGRAM_ID
  ).address.toBase58();
}

/** Never throws: corrupt or foreign data comes back as `{ kind: "corrupt" }`. */
function loadSavedIntent(employer: string): LoadIntentResult {
  return loadCreateIntent(intentStorage(), INTENT_SCOPE, employer, deriveIntentAddress);
}

function tryPublicKey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type SetupConflict = {
  message: string;
  /** Resume continues the saved attempt; hidden when it would only re-conflict. */
  allowResume: boolean;
};

const STEPS = [
  "Type",
  "Parties",
  "Payment",
  "Trial",
  "Work",
  "Schedule",
  "Review",
] as const;

export function CreateWizard() {
  const router = useRouter();
  const { publicKey, wallet, connecting, connect } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
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
  const [setupProgress, setSetupProgress] = useState<CreateProgress | null>(null);
  const [setupConflict, setSetupConflict] = useState<SetupConflict | null>(null);
  const [setupRunning, setSetupRunning] = useState(false);
  const [intentVersion, setIntentVersion] = useState(0);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  // One Create / Resume / Discard at a time; acquired synchronously before any await.
  const [runLock] = useState(createRunLock);
  // Latest tx handle: after tx.reset(), the resume path must call the re-rendered run().
  const txRef = useRef(tx);
  const connectForCreateRef = useRef(false);

  useEffect(() => {
    txRef.current = tx;
  });

  useEffect(() => {
    if (
      !connectForCreateRef.current ||
      publicKey ||
      !wallet ||
      connecting
    ) {
      return;
    }

    void connect().catch((err) => {
      connectForCreateRef.current = false;
      setProgressNote(
        err instanceof Error
          ? `Wallet connection failed: ${err.message}`
          : "Wallet connection failed. Try again."
      );
    });
  }, [wallet, publicKey, connecting, connect]);

  useEffect(() => {
    if (!connectForCreateRef.current || !publicKey) return;

    connectForCreateRef.current = false;
    setProgressNote(
      "Wallet connected. Review the contract, then press Create & Send Offer to approve the on-chain funding."
    );
  }, [publicKey]);

  const employerKey = publicKey?.toBase58() ?? null;
  // Saved Create & Send Offer attempt for this wallet, cluster and program (survives reload).
  const savedLoad = useMemo<LoadIntentResult>(() => {
    void intentVersion;
    return employerKey ? loadSavedIntent(employerKey) : { kind: "none" };
  }, [employerKey, intentVersion]);
  const savedIntent = savedLoad.kind === "ready" ? savedLoad.intent : null;
  const savedCorruptMessage = savedLoad.kind === "corrupt" ? savedLoad.message : null;

  // P4: unfinished Create draft. Local only, never sent, never replaces a saved setup.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const draftOwner = employerKey ?? NO_WALLET_DRAFT_OWNER;
  const [draftDecidedFor, setDraftDecidedFor] = useState<string | null>(null);
  const draftClosedRef = useRef(false);
  const draftOffer = useMemo<SavedCreateDraft | null>(() => {
    if (!hydrated || draftDecidedFor === draftOwner || savedLoad.kind !== "none") return null;
    return loadCreateDraft(intentStorage(), INTENT_SCOPE, draftOwner, STEPS.length - 1);
  }, [hydrated, draftDecidedFor, draftOwner, savedLoad.kind]);

  useEffect(() => {
    // Never save while a create intent exists, or over a draft awaiting Restore / Start fresh.
    if (!hydrated || draftOffer || savedLoad.kind !== "none") return;
    const handle = window.setTimeout(() => {
      if (draftClosedRef.current) return;
      saveCreateDraft(intentStorage(), INTENT_SCOPE, draftOwner, {
        draft,
        step,
        nowMs: Date.now(),
        intentExists: false,
      });
    }, CREATE_DRAFT_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [hydrated, draftOffer, savedLoad.kind, draftOwner, draft, step]);

  function restoreDraft(saved: SavedCreateDraft) {
    // Refills the form only. Create & Send Offer stays a manual, reviewed step.
    setDraft(saved.draft);
    setStep(saved.step);
    setDraftDecidedFor(draftOwner);
    setProgressNote("Draft restored. Review each step, then press Create & Send Offer when ready.");
  }

  function startFresh() {
    clearCreateDraft(intentStorage(), INTENT_SCOPE, draftOwner);
    // A fresh draft is a direct Create: forget any imported marketplace source.
    clearMarketplaceSource(intentStorage(), INTENT_SCOPE, employerKey);
    setDraft(defaultCreateDraft());
    setStep(0);
    setDraftDecidedFor(draftOwner);
  }

  // Marketplace handoff: separate pending record for this wallet only. Applied
  // only on an explicit choice and consumed once, so it cannot reappear.
  const [handoffDecidedFor, setHandoffDecidedFor] = useState<string | null>(null);
  const pendingHandoff = useMemo(() => {
    if (!hydrated || !employerKey || handoffDecidedFor === employerKey) return null;
    return loadPendingHandoff(intentStorage(), INTENT_SCOPE, employerKey);
  }, [hydrated, employerKey, handoffDecidedFor]);
  const handoffPrompt = handoffPromptKind({
    pending: pendingHandoff != null,
    draftExists: draftOffer != null,
    intentExists: savedLoad.kind !== "none",
  });

  // Retry any confirmed-but-unlinked marketplace contracts for this wallet (reload/revisit).
  useEffect(() => {
    if (hydrated && employerKey) void resumeMarketplaceLinks(employerKey, INTENT_SCOPE);
  }, [hydrated, employerKey]);

  function chooseHandoff(choice: HandoffChoice) {
    if (!employerKey) return;
    const result = resolveHandoffChoice(intentStorage(), INTENT_SCOPE, employerKey, choice, {
      intentExists: savedLoad.kind !== "none",
    });
    if (result.consumed) setHandoffDecidedFor(employerKey);
    if (result.draft) {
      // Remember where these terms came from (ids only) so a confirmed contract can be linked.
      if (pendingHandoff) {
        saveMarketplaceSource(intentStorage(), INTENT_SCOPE, employerKey, pendingHandoff.handoff, Date.now());
      }
      // Explicit replace: refills the form only; Create & Send Offer stays manual.
      setDraft(result.draft);
      setStep(0);
      setDraftDecidedFor(draftOwner);
      setProgressNote(HANDOFF_COPY.imported);
    }
  }

  const errors = useMemo(
    () =>
      publicKey
        ? validateCreateDraft(publicKey, draft, now)
        : validateCreateDraftBase(draft, now),
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
    setSetupConflict(null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time draft normalization on mount (lint-only annotation; no tx logic change).
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
    // A saved setup is locked once a create may have been sent.
    const loaded = loadSavedIntent(publicKey.toBase58());
    if (loaded.kind === "corrupt") {
      setSetupNotice(null);
      setSetupConflict({ message: loaded.message, allowResume: false });
      return;
    }
    // "Accept within" becomes an absolute deadline right before the first create
    // attempt. An attempted setup always keeps its stored deadline unchanged.
    const acceptanceDeadline = resolveAcceptanceDeadline({
      windowSeconds: draft.acceptanceWindowSeconds,
      nowSeconds: nowSeconds(),
      saved: loaded.kind === "ready" ? loaded.intent : null,
    });
    if (
      draft.paymentMode !== "Hourly" &&
      draft.startMode === "Scheduled" &&
      localDateTimeInputToUnixSeconds(draft.scheduledStartLocal) < acceptanceDeadline
    ) {
      setProgressNote(
        "Scheduled start must not precede the acceptance deadline. Move the start later or shorten Accept within."
      );
      return;
    }
    const scheduledStartTime =
      draft.startMode === "Scheduled"
        ? localDateTimeInputToUnixSeconds(draft.scheduledStartLocal)
        : 0;
    const checkpointInterval =
      draft.paymentMode === "Streaming" ? draft.checkpointInterval : 0;
    const request: CreateIntentRequest =
      draft.paymentMode === "Hourly"
        ? {
            kind: "hourly",
            hourlyRate: uiAmountToBaseUnits(draft.hourlyRateUi, payment.decimals).toString(),
            authorizedSeconds: String(
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
            trialAmount: trialAmount.toString(),
            resolver: payment.resolver.address.toBase58(),
            metadataUri: stored.uri,
            metadataHashHex: bytesToHex(stored.hash),
          }
        : {
            kind: "standard",
            paymentMode: draft.paymentMode,
            startMode: draft.startMode,
            totalAmount: uiAmountToBaseUnits(draft.totalAmountUi, payment.decimals).toString(),
            acceptanceDeadline,
            scheduledStartTime,
            durationSeconds: draft.durationSeconds,
            checkpointInterval,
            reviewDuration: draft.reviewDuration,
            activationReviewDuration: draft.activationReviewDuration,
            maxRevisions: draft.maxRevisions,
            trialAmount: trialAmount.toString(),
            resolver: payment.resolver.address.toBase58(),
            metadataUri: stored.uri,
            metadataHashHex: bytesToHex(stored.hash),
          };
    const terms: CreateIntentTerms = {
      employer: publicKey.toBase58(),
      freelancer: freelancer.toBase58(),
      tokenMint: payment.mint.toBase58(),
      paymentMode: draft.paymentMode,
      // Hourly total is derived on-chain from rate × authorized time.
      totalAmount: request.kind === "standard" ? request.totalAmount : null,
      trialAmount: trialAmount.toString(),
      milestones:
        draft.paymentMode === "Milestone"
          ? draft.milestones.map((milestone) => ({
              amount: uiAmountToBaseUnits(milestone.amountUi, payment.decimals).toString(),
              dueOffsetSeconds: milestone.dueOffsetSeconds,
            }))
          : [],
      request,
    };
    // `loaded` was read above, before the acceptance deadline was fixed.
    // One stable contract ID per creation attempt: a retry, failure or unknown
    // confirmation reuses the saved ID instead of generating a new one.
    const ensured = ensureCreateIntent({
      terms,
      saved: loaded.kind === "ready" ? loaded.intent : null,
      scope: INTENT_SCOPE,
      newContractId: () => BigInt(Date.now()),
      deriveAddress: deriveIntentAddress,
      now: Date.now(),
    });
    if (ensured.kind === "conflict") {
      // The saved attempt keeps its original terms; Resume setup continues it.
      setSetupNotice(null);
      setSetupConflict({ message: ensured.message, allowResume: true });
      setIntentVersion((v) => v + 1);
      return;
    }
    saveCreateIntent(intentStorage(), ensured.intent);
    // Metadata only: carry an imported marketplace source alongside this create intent.
    bindMarketplaceSource(intentStorage(), INTENT_SCOPE, terms.employer, ensured.intent, Date.now());
    // The saved setup now holds these terms; the local draft is no longer needed.
    clearAllCreateDrafts(intentStorage(), INTENT_SCOPE, terms.employer);
    setIntentVersion((v) => v + 1);
    await runSetup(ensured.intent);
  }

  /**
   * Reconcile with the chain first (reads only), then send only the missing
   * steps: create → add missing milestones → send offer (finalize terms).
   * Every outcome leaves a visible, recoverable state.
   */
  async function runSetup(initialIntent: CreateIntent) {
    if (!publicKey || !client) return;
    const retryHint = initialIntent.createAttempted
      ? "Press Resume setup to try again."
      : `Press ${CREATE_SEND_OFFER_LABEL} to try again.`;
    if (publicKey.toBase58() !== initialIntent.employer) {
      setProgressNote("Connect the wallet that started this setup to continue it.");
      return;
    }
    let intent = initialIntent;
    const program = client.program;
    const parsedAddress = tryPublicKey(intent.contractAddress);
    if (!parsedAddress) {
      setSetupConflict({
        message:
          "The saved setup has an unreadable contract address, so nothing was sent. Discard it to start over.",
        allowResume: false,
      });
      return;
    }
    const address: PublicKey = parsedAddress;

    const observe = async (): Promise<ObservedCreateState> => {
      const contract = await fetchContractIfExists(program, address);
      if (!contract) return { contract: null, workUnits: [], hourly: null };
      const workUnits =
        contract.paymentMode === "Milestone"
          ? await fetchIndexedWorkUnits(program, address, contract.workUnitCount)
          : [];
      const hourly =
        contract.paymentMode === "Hourly"
          ? await fetchHourlyStateIfExists(
              program,
              deriveHourlyStatePda(address, program.programId).address
            )
          : null;
      return { contract, workUnits, hourly };
    };
    const onPlan = (plan: CreatePlan) => {
      setSetupProgress(plan.progress);
      if (plan.progress.contractExists) {
        setCreatedAddress(plan.progress.contractAddress);
      }
    };
    // Reads only: after a failure, show the actual chain state (or none).
    const refreshProgress = async () => {
      try {
        setSetupProgress(planNextCreateStep(intent, await observe(), nowSeconds()).progress);
      } catch {
        setSetupProgress(null);
      }
    };

    setSetupConflict(null);
    setSetupNotice(null);
    setSetupRunning(true);
    setProgressNote("Checking for an existing contract…");
    try {
      let initial: CreatePlan;
      try {
        initial = planNextCreateStep(intent, await observe(), nowSeconds());
      } catch (err) {
        // A failed read is not "absent": never create on an unknown chain state.
        setSetupProgress(null);
        setProgressNote(
          `Could not read the contract from the chain, so nothing was sent. ${errorText(err)} ${retryHint}`
        );
        return;
      }
      onPlan(initial);
      if (initial.step.kind === "complete") {
        finishSetup(intent, initial.progress);
        return;
      }
      if (initial.step.kind === "conflict") {
        setSetupConflict({
          message: initial.step.message,
          allowResume: isRetryableConflict(initial.step.reason),
        });
        setProgressNote(null);
        return;
      }

      if (txRef.current.busy) {
        setProgressNote(`A transaction is still in progress, so nothing was sent. ${retryHint}`);
        return;
      }
      const result: { outcome: CreateSetupOutcome | null; started: boolean } = {
        outcome: null,
        started: false,
      };
      const ok = await txRef.current.run(
        "Create & send offer",
        async () => {
          result.started = true;
          const outcome = await runCreateSetup(intent, {
            observe,
            now: nowSeconds,
            onPlan,
            onStep: (step, progress) => setProgressNote(createStepNote(step, progress)),
            create: async () => {
              const expected = deriveContractPda(
                publicKey,
                new PublicKey(intent.freelancer),
                BigInt(intent.contractId),
                program.programId
              ).address;
              if (!expected.equals(address)) {
                throw new Error(
                  "The saved setup does not match this wallet and program, so nothing was sent."
                );
              }
              // Persist before the wallet prompt: from here on the ID and terms
              // are locked. If this cannot be saved, nothing is sent.
              const beforeAttempt = intent;
              intent = markCreateAttempted(intent, Date.now());
              saveCreateIntent(intentStorage(), intent);
              setIntentVersion((v) => v + 1);
              let sendError: unknown = null;
              try {
                return intent.paymentMode === "Hourly"
                  ? await client.createHourlyContract({
                      freelancer: new PublicKey(intent.freelancer),
                      tokenMint: new PublicKey(intent.tokenMint),
                      request: toCreateHourlyContractRequest(intent),
                    })
                  : await client.createContract({
                      freelancer: new PublicKey(intent.freelancer),
                      tokenMint: new PublicKey(intent.tokenMint),
                      request: toCreateContractRequest(intent),
                    });
              } catch (err) {
                sendError = err;
                throw err;
              } finally {
                // The Discard landing window counts from when the send settled.
                intent = touchCreateActivity(intent, Date.now());
                // Provably never broadcast (wallet refused, or the signed tx expired
                // before submit): unlock this fresh attempt so it can be edited or
                // discarded. Any possibly-sent outcome keeps the lock.
                const settled = intent;
                intent = releaseUnsentCreateAttempt(beforeAttempt, settled, sendError, Date.now());
                try {
                  saveCreateIntent(intentStorage(), intent);
                } catch {
                  // The save above already locked the ID; this only extends the window.
                }
                if (intent !== settled) setIntentVersion((v) => v + 1);
              }
            },
            addMilestone: (step) =>
              client.addMilestone({
                contract: address,
                amount: step.amount,
                dueOffsetSeconds: step.dueOffsetSeconds,
                expectedIndex: step.index,
              }),
            finalize: () => client.finalizeTerms(address),
          });
          result.outcome = outcome;
          // Only a transaction that was actually sent is recorded as a success.
          return { signature: outcome.lastSignature ?? "" };
        },
        { suppressNotice: true }
      );
      setProgressNote(null);
      if (!result.started) {
        // run() refused (another transaction still counted as busy).
        setProgressNote(`Another transaction is still in progress, so nothing was sent. ${retryHint}`);
        return;
      }
      const outcome = result.outcome;
      if (!ok || !outcome) {
        // Failed or unknown confirmation: the saved intent stays, the panel
        // shows the actual chain state and offers Resume setup.
        await refreshProgress();
        return;
      }
      if (outcome.kind === "unverified") {
        // A confirmed send the chain has not shown yet: not a failure, not done.
        if (outcome.progress) setSetupProgress(outcome.progress);
        setSetupNotice(outcome.message);
        return;
      }
      if (outcome.kind === "complete") {
        // Verified on-chain. If nothing was sent in this run, drop the empty tx success.
        if (!outcome.lastSignature) tx.reset();
        finishSetup(intent, outcome.progress);
        return;
      }
      tx.reset();
      setSetupConflict({
        message: outcome.message,
        allowResume: isRetryableConflict(outcome.reason),
      });
    } finally {
      setSetupRunning(false);
    }
  }

  function finishSetup(intent: CreateIntent, progress: CreateProgress) {
    try {
      clearCreateIntent(
        intentStorage(),
        { cluster: intent.cluster, programId: intent.programId },
        intent.employer
      );
    } catch {
      // Verified complete on-chain; a leftover saved setup would re-verify as complete.
    }
    draftClosedRef.current = true;
    clearAllCreateDrafts(
      intentStorage(),
      { cluster: intent.cluster, programId: intent.programId },
      intent.employer
    );
    setIntentVersion((v) => v + 1);
    setCreatedAddress(progress.contractAddress);
    // Verified on-chain: link it to its marketplace listing (best effort; server re-checks parties).
    void linkConfirmedMarketplaceContract(intent.employer, progress.contractAddress, {
      cluster: intent.cluster,
      programId: intent.programId,
    });
    if (progress.status === "PendingAcceptance") {
      // Offer is live: notify the freelancer (server re-reads chain state; idempotent key).
      void requestOfferLifecycleNotification(progress.contractAddress, "contract_offer_received");
    }
    setSetupProgress(null);
    setSetupConflict(null);
    setSetupNotice(null);
    setProgressNote(null);
    setSuccessOpen(true);
  }

  function reportUnexpected(err: unknown) {
    setSetupRunning(false);
    setProgressNote(
      `Something went wrong: ${errorText(err)}. Nothing further was sent, and any saved setup was kept.`
    );
  }

  async function startCreate() {
    if (!runLock.tryAcquire()) return;

    try {
      if (!publicKey) {
        connectForCreateRef.current = true;
        setProgressNote(
          "Connect a wallet to create and fund this contract. Connecting the wallet alone does not send a payment."
        );

        if (wallet) {
          try {
            await connect();
          } catch (err) {
            connectForCreateRef.current = false;
            setProgressNote(
              err instanceof Error
                ? `Wallet connection failed: ${err.message}`
                : "Wallet connection failed. Try again."
            );
          }
        } else {
          setWalletModalVisible(true);
        }

        return;
      }

      if (!client) {
        setProgressNote(
          "Your wallet is connected, but PREMIFLOW is still preparing the blockchain connection. Try again in a moment."
        );
        return;
      }

      if (isCreateTxInFlight(tx.state.phase)) return;
      if (needsTxResetBeforeResume(tx.state.phase)) tx.reset();

      await submit();
    } catch (err) {
      reportUnexpected(err);
    } finally {
      runLock.release();
    }
  }

  /** Resume the saved attempt: reset a stuck tx state, reconcile, then send. */
  async function resumeSetup() {
    if (!runLock.tryAcquire()) return;
    try {
      if (!publicKey || !client) return;
      const phase = tx.state.phase;
      if (!canResumeCreateSetup(phase)) return;
      if (needsTxResetBeforeResume(phase)) tx.reset();
      const loaded = loadSavedIntent(publicKey.toBase58());
      if (loaded.kind === "corrupt") {
        setSetupConflict({ message: loaded.message, allowResume: false });
        return;
      }
      if (loaded.kind === "none") {
        setSetupConflict(null);
        setSetupNotice(null);
        setProgressNote("There is no unfinished setup to resume.");
        return;
      }
      await runSetup(loaded.intent);
    } catch (err) {
      reportUnexpected(err);
    } finally {
      runLock.release();
    }
  }

  /** Forget the saved setup only when that cannot lead to a duplicate contract. */
  async function discardSetup() {
    if (!runLock.tryAcquire()) return;
    try {
      if (!publicKey) return;
      const employer = publicKey.toBase58();
      const forget = (note: string | null) => {
        clearCreateIntent(intentStorage(), INTENT_SCOPE, employer);
        // A discarded setup never links to a marketplace listing.
        dropAwaitingLinks(intentStorage(), INTENT_SCOPE, employer);
        setIntentVersion((v) => v + 1);
        setSetupProgress(null);
        setSetupConflict(null);
        setSetupNotice(null);
        setCreatedAddress(null);
        setProgressNote(note);
        tx.reset();
      };
      if (isCreateTxInFlight(tx.state.phase)) {
        setProgressNote(
          "A transaction is still in progress. Wait for it to finish before discarding the setup."
        );
        return;
      }
      const loaded = loadSavedIntent(employer);
      if (loaded.kind === "none") {
        forget(null);
        return;
      }
      if (loaded.kind === "corrupt") {
        // Unreadable data cannot be reconciled with the chain.
        forget(
          "The unreadable saved setup was removed. Check your contracts list for any contract from the earlier attempt."
        );
        return;
      }
      const intent = loaded.intent;
      let chain: DiscardChainState = "not_checked";
      if (intent.createAttempted) {
        if (!client) {
          setProgressNote("Connect your wallet so the chain can be checked before discarding.");
          return;
        }
        setProgressNote("Checking the chain before discarding…");
        try {
          const onChain = await fetchContractIfExists(
            client.program,
            new PublicKey(intent.contractAddress)
          );
          chain = onChain ? "exists" : "absent";
        } catch {
          chain = "unknown";
        }
      }
      const decision = decideDiscard({
        intent,
        txPhase: txRef.current.state.phase,
        chain,
        nowMs: Date.now(),
      });
      if (!decision.allowed) {
        setProgressNote(decision.message);
        return;
      }
      forget(
        decision.contractExists
          ? `Setup discarded in this browser. The contract already on-chain stays at ${intent.contractAddress}; manage it from your contracts list.`
          : null
      );
    } catch (err) {
      reportUnexpected(err);
    } finally {
      runLock.release();
    }
  }

  const setupInFlight = setupRunning || isCreateTxInFlight(tx.state.phase);
  const unfinishedAttempt = savedIntent?.createAttempted ?? false;
  // Chain state observed in this session, for the saved setup only.
  const verifiedProgress =
    setupProgress && savedIntent && setupProgress.contractAddress === savedIntent.contractAddress
      ? setupProgress
      : null;
  const attentionMessage = setupConflict?.message ?? savedCorruptMessage;
  const showRecovery =
    !setupInFlight &&
    !successOpen &&
    (attentionMessage != null || setupNotice != null || unfinishedAttempt);
  // Open contract only once a chain read established that the contract exists.
  const recoveryAddress = verifiedProgress?.contractExists ? verifiedProgress.contractAddress : null;
  const recoveryLines = savedCorruptMessage
    ? []
    : verifiedProgress
      ? createProgressLines(verifiedProgress)
      : unfinishedAttempt
        ? ["Chain state not checked yet. Resume setup checks it before sending anything."]
        : [];
  const canResume =
    unfinishedAttempt &&
    savedCorruptMessage == null &&
    (!setupConflict || setupConflict.allowResume);
  const canDiscard =
    savedCorruptMessage != null ||
    (savedIntent != null && (unfinishedAttempt || setupConflict != null));

  const canAdvance = stepReady(step, draft, errors, allocation?.allocated === mainAmount);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0">
        {pendingHandoff && handoffPrompt !== "none" ? (
          <div
            role="status"
            className="mb-3 rounded-xl border border-line bg-paper-2 px-3 py-2.5 text-sm text-ink"
          >
            <p className="font-semibold">{HANDOFF_COPY.title}</p>
            <p className="mt-0.5 break-words text-ink-soft [overflow-wrap:anywhere]">
              {pendingHandoff.handoff.title} ({pendingHandoff.handoff.paymentMode}). {HANDOFF_COPY.note}
            </p>
            {handoffPrompt === "blocked_by_intent" ? (
              <p className="mt-1 text-ink-soft">{HANDOFF_COPY.blockedByIntent}</p>
            ) : handoffPrompt === "replace_or_keep" ? (
              <p className="mt-1 text-ink-soft">{HANDOFF_COPY.replaceWarning}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {handoffPrompt !== "blocked_by_intent" ? (
                <Button type="button" onClick={() => chooseHandoff("import")}>
                  {handoffUseLabel(pendingHandoff.handoff)}
                </Button>
              ) : null}
              {handoffPrompt === "replace_or_keep" ? (
                <Button type="button" variant="ghost" onClick={() => chooseHandoff("keep")}>
                  Keep current draft
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={() => chooseHandoff("dismiss")}>
                  Dismiss
                </Button>
              )}
            </div>
          </div>
        ) : null}
        {draftOffer && !pendingHandoff ? (
          <div
            role="status"
            className="mb-3 rounded-xl border border-line bg-paper-2 px-3 py-2.5 text-sm text-ink"
          >
            <p className="font-semibold">Unfinished draft found</p>
            <p className="mt-0.5 text-ink-soft">
              Saved in this browser{draftOffer.savedAt ? ` on ${new Date(draftOffer.savedAt).toLocaleString()}` : ""}. Nothing was sent on-chain; restoring only refills the form.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" onClick={() => restoreDraft(draftOffer)}>
                Restore draft
              </Button>
              <Button type="button" variant="ghost" onClick={startFresh}>
                Start fresh
              </Button>
            </div>
          </div>
        ) : null}
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
                    label="Total funded amount"
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
                  required
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
                    required
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
                    hint="Paid trial is included in the total funded amount. Main work receives the remainder."
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
                  label="Accept within"
                  error={errors.acceptanceWindowSeconds}
                  hint="The exact acceptance deadline is set when you press Create & Send Offer and stays fixed for that setup."
                >
                  <Select
                    value={String(draft.acceptanceWindowSeconds)}
                    onChange={(e) => patch({ acceptanceWindowSeconds: Number(e.target.value) })}
                  >
                    {acceptanceWindowOptions(draft.acceptanceWindowSeconds).map((option) => (
                      <option key={option.seconds} value={option.seconds}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
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
              disabled={setupInFlight}
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
              onClick={() => void startCreate()}
              disabled={
                setupInFlight ||
                connecting ||
                Object.keys(errors).length > 0 ||
                Boolean(publicKey && !client)
              }
              className="min-h-11 px-4 py-2.5 sm:min-h-0 sm:py-2"
            >
              {publicKey ? CREATE_SEND_OFFER_LABEL : "Connect wallet to continue"}
            </Button>
          )}
        </div>
        {progressNote ? <p className="mt-2 text-sm text-ink-soft">{progressNote}</p> : null}
        {showRecovery ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-3 rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
          >
            <p className="font-medium text-ink">
              {attentionMessage ? "Setup needs your attention" : SETUP_INCOMPLETE_LABEL}
            </p>
            {recoveryLines.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-ink-soft">
                {recoveryLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {attentionMessage ? <p className="mt-1 text-danger">{attentionMessage}</p> : null}
            {setupNotice ? <p className="mt-1 text-ink-soft">{setupNotice}</p> : null}
            {canResume && !attentionMessage && !setupNotice ? (
              <p className="mt-1 text-xs text-ink-faint">
                Resume setup checks the chain first and only sends the missing steps.
              </p>
            ) : null}
            {recoveryAddress ? (
              <div className="mt-2">
                <Address value={recoveryAddress} label="Contract" />
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {canResume ? (
                <Button
                  type="button"
                  onClick={() => void resumeSetup()}
                  disabled={!client || !canResumeCreateSetup(tx.state.phase)}
                >
                  {RESUME_SETUP_LABEL}
                </Button>
              ) : null}
              {recoveryAddress ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push(`/contracts/${recoveryAddress}`)}
                >
                  {OPEN_CONTRACT_LABEL}
                </Button>
              ) : null}
              {canDiscard ? (
                <Button type="button" variant="ghost" onClick={() => void discardSetup()}>
                  Discard setup
                </Button>
              ) : null}
            </div>
            {canDiscard ? (
              <p className="mt-2 text-xs text-ink-faint">
                Discard checks the chain first and only forgets this setup in this browser.
                Anything already on-chain stays and can be managed from the contract page.
              </p>
            ) : null}
          </div>
        ) : null}
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
        title="Offer sent"
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
      <h3 className="mt-1 font-display text-xl">Confirm and send offer</h3>
      <p className="mt-1 text-xs text-ink-soft">
        Create &amp; Send Offer funds the contract from your wallet
        {draft.paymentMode === "Milestone"
          ? ", adds each milestone, then sends the offer. Your wallet asks you to approve each step"
          : " and sends the offer to the freelancer"}
        .
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
        <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
                    <p className="text-sm font-medium text-danger">
                      Fix these fields before creating:
                    </p>
                    <ul className="mt-1 space-y-1 text-xs text-danger">
                      {Array.from(new Set(Object.values(errors))).slice(0, 8).map((message) => (
                        <li key={message}>• {message}</li>
                      ))}
                    </ul>
                  </div>
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
    return !errors.trialAmountUi && !errors.maxRevisions;
  }

  if (step === 4) {
    if (
      errors.title ||
      errors.description ||
      (draft.paymentMode !== "Hourly" && errors.deliverables)
    ) return false;

    if (draft.paymentMode === "Milestone") {
      const badMilestone = Object.keys(errors).some(
        (key) => key === "milestones" || key.startsWith("milestone-")
      );
      return milestonesOk && !badMilestone;
    }
    return true;
  }

  if (step === 5) {
    return (
      !errors.durationSeconds &&
      !errors.engagementDurationValue &&
      !errors.reviewDuration &&
      !errors.acceptanceWindowSeconds &&
      !errors.scheduledStartLocal &&
      !errors.checkpointInterval
    );
  }

  return Object.keys(errors).length === 0;
}
