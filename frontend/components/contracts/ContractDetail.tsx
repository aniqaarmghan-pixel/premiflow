"use client";

import {
  lifecycleNotificationForAction,
  requestOfferLifecycleNotification,
} from "@/lib/app/lifecycle-notifications-client";
import { withSameWalletOfferActions } from "@/lib/app/dashboard-offers";

import { getMint } from "@solana/spl-token";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import Link from "next/link";

import { Lifecycle } from "@/components/contracts/Lifecycle";
import { PaymentProgress } from "@/components/contracts/PaymentProgress";
import { ResolutionCenter } from "@/components/contracts/ResolutionCenter";
import { requestDisputeAssignedNotification } from "@/lib/app/dispute-assigned-client";
import {
  markOutcomeSync,
  outcomeNotificationKindForStatus,
  outcomeSyncKey,
  requestContractOutcomeNotification,
} from "@/lib/app/outcome-notifications-client";
import {
  assertResolverPrecheck,
  canShowResolverSettlementControls,
  contractRolesForWallet,
  parseFreelancerAllocation,
  resolverSettlementSummary,
  validateResolverSettlement,
} from "@/lib/app/resolver-cases";
import { StatusBadge } from "@/components/contracts/StatusBadge";
import { ContractMessages } from "@/components/contracts/ContractMessages";
import { HourlyShowcase } from "@/components/contracts/HourlyShowcase";
import { StreamShowcase } from "@/components/contracts/StreamShowcase";
import {
  emptyDeliveryDraft,
  SubmitWorkForm,
  type DeliveryAttachmentDraft,
  type DeliveryDraft,
  type DeliverySessionUi,
} from "@/components/contracts/SubmitWorkForm";
import { WorkDeliveryHistory } from "@/components/contracts/WorkDeliveryHistory";
import {
  discardPendingAttachment,
  uploadContractAttachment,
} from "@/lib/app/attachments-client";
import {
  WORK_ATTACHMENT_MAX,
  validateAttachmentFile,
} from "@/lib/app/attachments-policy";
import type { ApiError } from "@/lib/app/messages-client";
import {
  ensureMessagingSession,
  messagingSessionErrorMessage,
  readExistingMessagingSession,
} from "@/lib/app/messaging-session";
import { ConnectPrompt } from "@/components/shell/ConnectPrompt";
import { PageFade } from "@/components/shell/PageFade";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import { Identicon } from "@/components/ui/Identicon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { TransactionStatus } from "@/components/ui/TransactionStatus";
import {
  POST_RESOLUTION_COLLECT_COPY,
  POST_RESOLUTION_REFUND_COPY,
  RESOLVE_DISPUTE_COPY,
  openDisputePresentation,
  postResolutionCollectAvailable,
  postResolutionRefundAvailable,
  presentResolver,
  resolutionPreview,
  shouldOfferOpenDispute,
  shouldRefreshAfterDisputeFailure,
} from "@/lib/app/dispute-ux";
import {
  HOURLY_COPY,
  endHourlyCopy,
  resolveHourlyWorkLogUri,
  stopHourlyCopy,
} from "@/lib/app/hourly-ux";
import {
  CASE_PREPARATION_COPY,
  DISPUTE_CATEGORIES,
  SUPPORT_VS_DISPUTE_COPY,
  type DisputeCategoryId,
} from "@/lib/app/resolution-center";
import { shouldRecoverAfterAction } from "@/lib/app/resolution-case";
import {
  TRIAL_EXIT_COPY,
  endBeforeTrialWorkConfirmation,
  finalizeTrialReviewTimeoutConfirmation,
  settleTrialAndEndConfirmation,
  trialEmployerDecisions,
} from "@/lib/app/trial-exit";
import { OFFER_EXIT_COPY, expireOfferConfirmation } from "@/lib/app/offer-exit";
import {
  ACTIVATION_EXIT_COPY,
  expireActivationConfirmation,
} from "@/lib/app/activation-exit";
import { supportTopicHref } from "@/lib/app/support";
import { formatUnix } from "@/lib/app/datetime";
import { localMetadataStore } from "@/lib/app/local-metadata";
import { formatTokenAmount } from "@/lib/app/money";
import {
  STREAMING_PAY_EXPLAINER,
  streamingTrialStartedCopy,
} from "@/lib/app/stream-display";
import {
  fetchContractSubmissions,
  persistContractSubmission,
  type PublicWorkSubmission,
} from "@/lib/app/submissions-client";
import {
  WORK_DELIVERY_SYNC_WARNING,
  deliverableContextTitle,
  revisionLabel,
  submissionKindFromWorkUnit,
  submittedWorkDisplay,
  validateDeliveryPayload,
  type SubmittedWorkDisplay,
} from "@/lib/app/work-delivery";
import {
  actionLabel,
  actionsSectionGuidance,
  completeContractCopy,
  confirmTitle,
  contractActionVariant,
  counterparty,
  needsConfirmation,
  officialDeliverableCopy,
  presentStatus,
  presentType,
  revisionDeadlinePresentation,
  revisionsUsedLabel,
  roleForContract,
  roleLabel,
  splitTrialUnits,
  summaryWorkUnitActions,
  voidDeliverableCopy,
  voidStaleRevisionCopy,
  withdrawFreelancerCopy,
  workUnitsHaveOwnCards,
} from "@/lib/app/view-model";
import {
  parseDisputeAwardInput,
  validateAmountUi,
} from "@/lib/app/validation";
import { useNow } from "@/lib/hooks/useNow";
import { useStreamPayClient } from "@/lib/hooks/useStreamPayClient";
import { useTx } from "@/lib/hooks/useTx";
import { useContracts } from "@/lib/hooks/ContractsProvider";
import {
  availableActions,
  activationDeadlineUnix,
  deriveHourlySessionPda,
  deriveHourlyStatePda,
  fetchContract,
  fetchHourlySession,
  fetchHourlyState,
  fetchWorkUnitsForContract,
  getStreamPayV2Program,
  hashBytes,
  remainingEmployerRefund,
  remainingFreelancerClaim,
  settlementView,
  workUnitStatusLabel,
  type ContractMetadata,
  type ContractRole,
  type ContractView,
  type HourlySessionView,
  type HourlyStateView,
  type UiAction,
  type WorkUnitView,
} from "@/lib/streampay-v2";
import { HOURLY_NO_ACTIVE_SESSION } from "@/lib/streampay-v2/constants";

const UNIT_ACTIONS: UiAction[] = [
  "submitWorkUnit",
  "requestWorkRevision",
  "approveWorkUnit",
  "voidStaleRevision",
  "finalizeReviewTimeout",
];

const TRIAL_ACTIONS: UiAction[] = [
  "submitTrialWork",
  "requestTrialRevision",
  "approveTrialAndActivate",
  "settleTrialAndEnd",
  "finalizeTrialReviewTimeout",
];

export function ContractDetail({ address }: { address: string }) {
  const { connected, publicKey, signMessage } = useWallet();
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const client = useStreamPayClient();
  const { refresh: refreshList } = useContracts();
  const { now } = useNow(1000);
  const tx = useTx();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractView | null>(null);
  const [units, setUnits] = useState<WorkUnitView[]>([]);
  const [hourlyState, setHourlyState] = useState<HourlyStateView | null>(null);
  const [hourlySession, setHourlySession] = useState<HourlySessionView | null>(null);
  const [decimals, setDecimals] = useState<number | undefined>();
  const [metadata, setMetadata] = useState<ContractMetadata | null>(null);
  const [confirm, setConfirm] = useState<{
    action: UiAction;
    unit?: WorkUnitView;
  } | null>(null);
  const [uri, setUri] = useState("");
  const [deliveryDraft, setDeliveryDraft] = useState<DeliveryDraft>(() => emptyDeliveryDraft());
  const [deliverySession, setDeliverySession] = useState<DeliverySessionUi>({
    status: "unknown",
    error: null,
  });
  const [submissions, setSubmissions] = useState<PublicWorkSubmission[]>([]);
  const [historySyncWarning, setHistorySyncWarning] = useState<string | null>(null);
  const [pendingHistoryPayload, setPendingHistoryPayload] = useState<Parameters<
    typeof persistContractSubmission
  >[1] | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [awardUi, setAwardUi] = useState("");
  const [milestoneAmountUi, setMilestoneAmountUi] = useState("");
  const [milestoneDue, setMilestoneDue] = useState("3600");
  const [disputeCategory, setDisputeCategory] = useState<DisputeCategoryId | "">("");
  const [disputeDescription, setDisputeDescription] = useState("");
  const [caseRecoverGeneration, setCaseRecoverGeneration] = useState(0);
  const [caseOpenSignature, setCaseOpenSignature] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    setStatus("loading");
    setError(null);
    try {
      const pk = new PublicKey(address);
      const program = getStreamPayV2Program(connection, wallet);
      const fetched = await fetchContract(program, pk);
      const work = await fetchWorkUnitsForContract(program, pk);
      setContract(fetched);
      setUnits(work);
      if (fetched.paymentMode === "Hourly") {
        const statePda = deriveHourlyStatePda(pk, program.programId);
        const state = await fetchHourlyState(program, statePda.address);
        setHourlyState(state);
        if (
          state.activeSessionIndex !== HOURLY_NO_ACTIVE_SESSION &&
          Number.isFinite(state.activeSessionIndex)
        ) {
          const sessionPda = deriveHourlySessionPda(
            pk,
            state.activeSessionIndex,
            program.programId
          );
          setHourlySession(await fetchHourlySession(program, sessionPda.address));
        } else {
          setHourlySession(null);
        }
      } else {
        setHourlyState(null);
        setHourlySession(null);
      }
      try {
        const mint = await getMint(connection, fetched.tokenMint);
        setDecimals(mint.decimals);
      } catch {
        setDecimals(undefined);
      }
      try {
        setMetadata(await localMetadataStore.get(fetched.metadataUri));
      } catch {
        setMetadata(null);
      }
      setStatus("ready");
      return { contract: fetched, units: work };
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not load this contract.");
      return null;
    }
  }, [address, connection, wallet]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Confirmed-outcome inbox sync. Settlement: any party/resolver on load
  // (server dedupes per recipient). Ended/cancelled: only when this page saw
  // the transition, i.e. right after the viewer's own confirmed action.
  const outcomeStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!contract || !publicKey) return;
    const address58 = contract.address.toBase58();
    const current = `${address58}:${contract.status}`;
    const previous = outcomeStatusRef.current;
    outcomeStatusRef.current = current;
    const kind = outcomeNotificationKindForStatus(contract.status);
    if (!kind) return;
    const roles = contractRolesForWallet(publicKey, contract);
    if (kind === "settlement_recorded") {
      if (!roles.isEmployer && !roles.isFreelancer && !roles.isResolver) return;
    } else {
      if (!roles.isEmployer && !roles.isFreelancer) return;
      if (!previous || !previous.startsWith(`${address58}:`) || previous === current) return;
    }
    const key = outcomeSyncKey(address58, kind, publicKey.toBase58());
    if (markOutcomeSync(key)) void requestContractOutcomeNotification(address58, kind);
  }, [contract, publicKey]);

  useEffect(() => {
    if (status !== "ready" || !contract) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await fetchContractSubmissions(contract.address.toBase58());
        if (!cancelled) setSubmissions(page.submissions);
      } catch {
        // History is optional until the wallet session is verified.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contract, status, caseRecoverGeneration]);

  useEffect(() => {
    const isSubmit =
      confirm?.action === "submitWorkUnit" || confirm?.action === "submitTrialWork";
    if (!isSubmit) {
      setDeliverySession({ status: "unknown", error: null });
      return;
    }
    const walletAddress = publicKey?.toBase58() ?? null;
    if (!walletAddress) {
      setDeliverySession({ status: "needs_verify", error: null });
      return;
    }
    let cancelled = false;
    setDeliverySession({ status: "unknown", error: null });
    void (async () => {
      try {
        const existing = await readExistingMessagingSession(walletAddress);
        if (cancelled) return;
        if (existing === "mismatch") {
          setDeliverySession({ status: "needs_verify", error: null });
          return;
        }
        if (existing) {
          setDeliverySession({ status: "ready", error: null });
          return;
        }
        setDeliverySession({ status: "needs_verify", error: null });
      } catch {
        if (!cancelled) setDeliverySession({ status: "needs_verify", error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [confirm?.action, publicKey]);

  const { trial, main } = splitTrialUnits(units);

  const actions = useMemo(() => {
    if (!publicKey || !contract) return [];
    const trialUnit = units.find((u) => u.kind === "Trial") ?? null;
    return withSameWalletOfferActions(
      availableActions({
        wallet: publicKey,
        contract,
        trialUnit,
        hourlyState,
        now,
      }),
      publicKey,
      contract,
      now
    );
  }, [contract, hourlyState, now, publicKey, units]);

  if (!connected) return <ConnectPrompt />;
  if (status === "loading" && !contract) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (status === "error" || !contract || !publicKey) {
    return (
      <EmptyState
        title="Contract unavailable"
        body={error ?? "Connect a wallet and confirm the address is a V2 contract."}
        action={{ label: "Retry", onClick: () => void load() }}
      />
    );
  }

  const role = roleForContract(publicKey, contract);
  // isEmployer / isFreelancer / isResolver from the confirmed on-chain account.
  const walletRoles = contractRolesForWallet(publicKey, contract);
  const canSettleDispute =
    walletRoles.isResolver && canShowResolverSettlementControls(publicKey, contract);
  const other = counterparty(publicKey, contract);
  const settlement = settlementView(contract);
  const trialStarted = streamingTrialStartedCopy(contract);
  const resolver = presentResolver(contract.resolver);
  const openDisputeShown = shouldOfferOpenDispute(role, actions);
  const openPresentation = openDisputePresentation(contract, now);
  const resolveParsed =
    decimals != null
      ? parseDisputeAwardInput(awardUi, decimals, contract.contestedAmount)
      : { error: "Mint decimals are required for an exact award." };
  const resolvePreview =
    resolveParsed.amount != null
      ? resolutionPreview(contract, resolveParsed.amount)
      : resolutionPreview(contract, 0n);
  const uploadedDeliveryAttachmentIds = deliveryDraft.attachments
    .filter((item) => item.status === "uploaded" && item.attachmentId)
    .map((item) => item.attachmentId!);
  const deliveryValidation = validateDeliveryPayload({
    deliveryNote: deliveryDraft.note,
    links: deliveryDraft.links,
    uploadedAttachmentIds: uploadedDeliveryAttachmentIds,
  });
  const deliveryAttachmentsReady =
    deliveryDraft.attachments.length === 0 ||
    deliveryDraft.attachments.every((item) => item.status === "uploaded" && item.attachmentId);
  const deliveryAttachmentsFailed = deliveryDraft.attachments.some(
    (item) => item.status === "failed"
  );
  const deliveryAttachmentsPending = deliveryDraft.attachments.some(
    (item) => item.status === "uploading" || item.status === "selected"
  );
  const confirmBlocked =
    confirm?.action === "openDispute"
      ? !openPresentation.canSubmit
      : confirm?.action === "resolveDispute"
        ? decimals == null ||
          Boolean(resolveParsed.error) ||
          !resolvePreview.valid ||
          Boolean(parseFreelancerAllocation(awardUi, decimals, contract).error)
        : confirm?.action === "submitWorkUnit" || confirm?.action === "submitTrialWork"
          ? !deliveryValidation.ok ||
            !deliveryAttachmentsReady ||
            deliveryAttachmentsFailed ||
            deliveryAttachmentsPending
          : false;

  async function onVerifyDeliveryWallet() {
    const walletAddress = publicKey?.toBase58();
    if (!walletAddress) {
      setDeliverySession({
        status: "failed",
        error: "Connect your freelancer wallet to verify.",
      });
      return;
    }
    setDeliverySession({ status: "verifying", error: null });
    try {
      await ensureMessagingSession({
        wallet: walletAddress,
        signMessage,
      });
      setDeliverySession({ status: "ready", error: null });
    } catch (err) {
      setDeliverySession({
        status: "failed",
        error: messagingSessionErrorMessage(err),
      });
    }
  }

  async function uploadDeliveryAttachment(localId: string, file: File) {
    if (!contract) return;
    const walletAddress = publicKey?.toBase58();
    if (!walletAddress) {
      setDeliveryDraft((current) => ({
        ...current,
        attachments: current.attachments.map((item) =>
          item.localId === localId
            ? {
                ...item,
                status: "failed",
                error: "Connect your freelancer wallet to upload files.",
              }
            : item
        ),
      }));
      return;
    }
    setDeliveryDraft((current) => ({
      ...current,
      attachments: current.attachments.map((item) =>
        item.localId === localId
          ? { ...item, status: "uploading", progress: 0, error: null }
          : item
      ),
    }));
    try {
      await ensureMessagingSession({
        wallet: walletAddress,
        signMessage,
      });
      setDeliverySession({ status: "ready", error: null });
      const result = await uploadContractAttachment(
        contract.address.toBase58(),
        file,
        "work_submission",
        (ratio) => {
          setDeliveryDraft((current) => ({
            ...current,
            attachments: current.attachments.map((item) =>
              item.localId === localId ? { ...item, progress: ratio } : item
            ),
          }));
        }
      );
      setDeliveryDraft((current) => ({
        ...current,
        attachments: current.attachments.map((item) =>
          item.localId === localId
            ? {
                ...item,
                status: "uploaded",
                progress: 1,
                attachmentId: result.attachment.id,
                error: null,
              }
            : item
        ),
      }));
    } catch (err) {
      const api = err as ApiError;
      const message = messagingSessionErrorMessage(err);
      if (
        api.code === "unauthenticated" ||
        api.code === "session_mismatch" ||
        api.code === "wallet_cannot_sign" ||
        api.code === "expired_session" ||
        api.code === "revoked_session"
      ) {
        setDeliverySession({ status: "failed", error: message });
      }
      setDeliveryDraft((current) => ({
        ...current,
        attachments: current.attachments.map((item) =>
          item.localId === localId
            ? { ...item, status: "failed", error: message }
            : item
        ),
      }));
    }
  }

  function onPickDeliveryFiles(files: FileList | null) {
    if (deliverySession.status !== "ready") return;
    if (!files || files.length === 0) return;
    const room = WORK_ATTACHMENT_MAX - deliveryDraft.attachments.length;
    if (room <= 0) return;
    const additions: DeliveryAttachmentDraft[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      const policy = validateAttachmentFile({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        byteSize: file.size,
      });
      const localId = crypto.randomUUID();
      if (!policy.ok) {
        additions.push({
          localId,
          file,
          displayFilename: file.name || "file",
          byteSize: file.size,
          status: "failed",
          error: policy.error,
        });
        continue;
      }
      additions.push({
        localId,
        file,
        displayFilename: policy.displayFilename,
        byteSize: policy.byteSize,
        status: "selected",
      });
    }
    setDeliveryDraft((current) => ({
      ...current,
      attachments: [...current.attachments, ...additions],
    }));
    for (const item of additions) {
      if (item.status === "selected") void uploadDeliveryAttachment(item.localId, item.file);
    }
  }

  async function onRemoveDeliveryAttachment(localId: string) {
    const target = deliveryDraft.attachments.find((item) => item.localId === localId);
    setDeliveryDraft((current) => ({
      ...current,
      attachments: current.attachments.filter((item) => item.localId !== localId),
    }));
    if (target?.attachmentId && contract) {
      try {
        await discardPendingAttachment(contract.address.toBase58(), target.attachmentId);
      } catch {
        // Best-effort pending cleanup.
      }
    }
  }

  function onRetryDeliveryAttachment(localId: string) {
    const target = deliveryDraft.attachments.find((item) => item.localId === localId);
    if (!target) return;
    void uploadDeliveryAttachment(localId, target.file);
  }

  async function persistDeliveryHistory(
    payload: Parameters<typeof persistContractSubmission>[1]
  ): Promise<boolean> {
    setSyncBusy(true);
    try {
      const result = await persistContractSubmission(contract!.address.toBase58(), payload);
      setSubmissions((current) => {
        const without = current.filter((row) => row.id !== result.submission.id);
        return [result.submission, ...without];
      });
      setHistorySyncWarning(null);
      setPendingHistoryPayload(null);
      return true;
    } catch {
      setPendingHistoryPayload(payload);
      setHistorySyncWarning(WORK_DELIVERY_SYNC_WARNING);
      return false;
    } finally {
      setSyncBusy(false);
    }
  }

  async function execute(action: UiAction, unit?: WorkUnitView) {
    if (!client || !contract) return;
    let signature: string | undefined;
    const submitDelivery =
      action === "submitWorkUnit" || action === "submitTrialWork"
        ? deliveryValidation.ok
          ? deliveryValidation.value
          : null
        : null;
    if (
      (action === "submitWorkUnit" || action === "submitTrialWork") &&
      !submitDelivery
    ) {
      return;
    }
    const submissionUri = submitDelivery?.onChainSubmissionUri ?? uri;
    const ok = await tx.run(
      actionLabel(action, { workUnitStatus: unit?.status }),
      async () => {
      const result = await (async () => {
      switch (action) {
        case "finalizeTerms":
          return client.finalizeTerms(contract.address);
        case "acceptContract":
          return client.acceptContract(contract.address);
        case "declineContract":
          return client.declineContract(contract.address);
        case "expireAcceptance":
          return client.expireAcceptance(contract.address);
        case "expireActivation":
          return client.expireActivation(contract.address);
        case "approveActivation":
          return client.approveActivation(contract.address);
        case "rejectActivation":
          return client.rejectActivation(contract.address);
        case "submitTrialWork": {
          const hash = await hashBytes(new TextEncoder().encode(submissionUri));
          return client.submitTrialWork({
            contract: contract.address,
            submissionUri,
            submissionHash: hash,
          });
        }
        case "requestTrialRevision":
          return client.requestTrialRevision(contract.address);
        case "approveTrialAndActivate":
          return client.approveTrialAndActivate(contract.address);
        case "settleTrialAndEnd":
          return client.settleTrialAndEnd(contract.address);
        case "finalizeTrialReviewTimeout":
          return client.finalizeTrialReviewTimeout(contract.address);
        case "submitWorkUnit": {
          if (!unit) throw new Error("Choose a work unit.");
          const hash = await hashBytes(new TextEncoder().encode(submissionUri));
          return client.submitWorkUnit({
            contract: contract.address,
            workUnit: unit.address,
            submissionUri,
            submissionHash: hash,
          });
        }
        case "requestWorkRevision":
          if (!unit) throw new Error("Choose a work unit.");
          return client.requestWorkRevision({
            contract: contract.address,
            workUnit: unit.address,
          });
        case "approveWorkUnit":
          if (!unit) throw new Error("Choose a work unit.");
          return client.approveWorkUnit({
            contract: contract.address,
            workUnit: unit.address,
          });
        case "voidStaleRevision":
          if (!unit) throw new Error("Choose a work unit.");
          return client.voidStaleRevision({
            contract: contract.address,
            workUnit: unit.address,
          });
        case "finalizeReviewTimeout":
          if (!unit) throw new Error("Choose a work unit.");
          return client.finalizeReviewTimeout({
            contract: contract.address,
            workUnit: unit.address,
          });
        case "releaseStreamAccrual":
          return client.releaseStreamAccrual(contract.address);
        case "cancelActiveContract":
          return client.cancelActiveContract(contract.address);
        case "withdrawFreelancer":
          return client.withdrawFreelancer({
            contract: contract.address,
            // One-click Collect: materialize stream accrual in the same tx while Active.
            releaseAccrualFirst:
              contract.paymentMode === "Streaming" &&
              contract.status === "Active" &&
              actions.includes("releaseStreamAccrual"),
          });
        case "claimEmployerRefund":
          return client.claimEmployerRefund({ contract: contract.address });
        case "openDispute":
          return client.openDispute(contract.address);
        case "resolveDispute": {
          if (decimals == null) throw new Error("Mint decimals are required for an exact award.");
          if (!wallet) throw new Error("Connect the designated resolver wallet.");
          // Pre-check a fresh on-chain read before building the transaction. The
          // program's has_one = resolver constraint remains authoritative.
          const onChain = await fetchContract(
            getStreamPayV2Program(connection, wallet),
            contract.address
          );
          assertResolverPrecheck(publicKey, onChain);
          const allocation = parseFreelancerAllocation(awardUi, decimals, onChain);
          if (allocation.error || allocation.award == null) {
            throw new Error(allocation.error ?? "Invalid allocation");
          }
          const parsed = { amount: allocation.award };
          return client.resolveDispute({
            contract: contract.address,
            freelancerContestedAward: parsed.amount,
          });
        }
        case "completeContract":
          return client.completeContract(contract.address);
        case "startHourlySession":
          return client.startHourlySession(contract.address);
        case "stopHourlySession": {
          const workLogUri = resolveHourlyWorkLogUri(uri);
          const hash = await hashBytes(new TextEncoder().encode(workLogUri));
          return client.stopHourlySession({
            contract: contract.address,
            workLogUri,
            workLogHash: hash,
          });
        }
        case "endHourlyContract":
          return client.endHourlyContract(contract.address);
        case "addMilestone": {
          if (decimals == null) throw new Error("Mint decimals are required.");
          const parsed = validateAmountUi(milestoneAmountUi, decimals, "Milestone amount");
          if (parsed.error || parsed.amount == null) {
            throw new Error(parsed.error ?? "Invalid milestone amount");
          }
          const due = Number(milestoneDue);
          if (!Number.isInteger(due) || due <= 0) {
            throw new Error("Due offset must be a positive number of seconds.");
          }
          return client.addMilestone({
            contract: contract.address,
            amount: parsed.amount,
            dueOffsetSeconds: due,
          });
        }
        default:
          throw new Error("Unsupported action");
      }
      })();
      signature = result.signature;
      return result;
      },
      {
        action,
        workUnitStatus:
          unit?.status ??
          (action === "rejectActivation" ||
          action === "settleTrialAndEnd" ||
          action === "finalizeTrialReviewTimeout"
            ? trial?.status
            : undefined),
        paymentMode: contract.paymentMode,
      }
    );
    setConfirm(null);
    if (ok) {
      // Best-effort inbox notification after a confirmed accept/activation. The
      // server re-reads on-chain status and dedupes per contract+recipient+kind.
      const lifecycleKind = lifecycleNotificationForAction(action);
      if (lifecycleKind) {
        void requestOfferLifecycleNotification(contract.address.toBase58(), lifecycleKind);
      }
      if (action === "openDispute") {
        // Best-effort resolver inbox notification; the server re-reads chain facts and dedupes.
        void requestDisputeAssignedNotification(contract.address.toBase58());
      }
      const latest = await load();
      await refreshList();
      if (
        (action === "submitWorkUnit" || action === "submitTrialWork") &&
        submitDelivery &&
        signature &&
        unit
      ) {
        const refreshed =
          latest?.units.find((row) => row.address.equals(unit.address)) ?? unit;
        await persistDeliveryHistory({
          submissionKind: submissionKindFromWorkUnit(unit.kind),
          workUnitIndex: unit.index,
          revisionNumber: refreshed.revisionCount,
          deliveryNote: submitDelivery.deliveryNote,
          links: submitDelivery.links.map((link) => ({
            url: link.url,
            label: link.label,
          })),
          onChainSubmissionUri: submitDelivery.onChainSubmissionUri,
          transactionSignature: signature,
          chainSubmittedAt: refreshed.submittedAt > 0 ? refreshed.submittedAt : null,
          attachmentIds: deliveryDraft.attachments
            .filter((item) => item.status === "uploaded" && item.attachmentId)
            .map((item) => item.attachmentId!),
        });
        setDeliveryDraft(emptyDeliveryDraft());
      }
      if (latest?.contract && shouldRecoverAfterAction(action, latest.contract.status)) {
        setCaseOpenSignature(signature ?? null);
        setCaseRecoverGeneration((n) => n + 1);
      }
    } else if (
      action === "voidStaleRevision" ||
      action === "submitWorkUnit" ||
      shouldRefreshAfterDisputeFailure(action)
    ) {
      await load();
      await refreshList();
    }
  }

  function requestAction(action: UiAction, unit?: WorkUnitView) {
    if (action === "submitWorkUnit" || action === "submitTrialWork") {
      setDeliveryDraft(emptyDeliveryDraft());
      setUri("");
    }
    if (needsConfirmation(action)) {
      setConfirm({ action, unit });
      return;
    }
    void execute(action, unit);
  }

  const hourlyPrimary: UiAction[] = [
    "startHourlySession",
    "stopHourlySession",
    "endHourlyContract",
  ];
  const contractButtons = actions
    .filter((a) => !UNIT_ACTIONS.includes(a) && !TRIAL_ACTIONS.includes(a))
    .filter((a) => !hourlyPrimary.includes(a))
    // Streaming release lives in the Ongoing pay panel (freelancer only); no duplicate here.
    .filter((a) => a !== "releaseStreamAccrual")
    .filter((a) => {
      if (
        a === "rejectActivation" &&
        (trial?.status === "Submitted" || trial?.status === "Revising")
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a === "completeContract") return 1;
      if (b === "completeContract") return -1;
      return 0;
    });

  const disputeActive =
    contract.status === "Disputed" || contract.status === "Resolved";
  const headerDeadline =
    contract.status === "PendingAcceptance" && contract.acceptanceDeadline > 0
      ? {
          label: "Acceptance deadline",
          value: formatUnix(contract.acceptanceDeadline),
        }
      : contract.status === "PendingEmployerApproval" && contract.acceptedAt > 0
        ? {
            label: "Activation deadline",
            value: formatUnix(activationDeadlineUnix(contract)),
          }
        : contract.status === "Active" && contract.endTime > 0
          ? { label: "End", value: formatUnix(contract.endTime) }
          : null;

  const primaryUnitButtons = summaryWorkUnitActions({
    paymentMode: contract.paymentMode,
    units: main,
    actionsFor: (unit) =>
      availableActions({
        wallet: publicKey,
        contract,
        workUnit: unit,
        trialUnit: trial,
        now,
      }).filter((a) => UNIT_ACTIONS.includes(a)),
  });

  return (
    <PageFade>
      <div className="space-y-4 sm:space-y-5">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
              {presentType(contract.paymentMode)} · {roleLabel(role)}
            </p>
            <h1 className="mt-1 break-words font-display text-[1.75rem] tracking-tight sm:text-3xl">
              {metadata?.title || "Protected contract"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
              <span>
                Funded{" "}
                <span className="font-medium text-ink">
                  {formatTokenAmount(contract.totalAmount, decimals)}
                </span>
              </span>
              {headerDeadline ? (
                <span>
                  {headerDeadline.label}{" "}
                  <span className="font-medium text-ink">{headerDeadline.value}</span>
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Identicon seed={other.address.toBase58()} />
              <div className="min-w-0">
                <p className="text-sm text-ink-faint">{other.label}</p>
                <Address value={other.address.toBase58()} />
              </div>
            </div>
          </div>
          <StatusBadge status={contract.status} label={presentStatus(contract.status)} />
        </header>

        <div className="grid min-w-0 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4 sm:space-y-5">
        {disputeActive ? (
          <div id="resolution">
            <ResolutionCenter
              contract={contract}
              units={units}
              now={now}
              decimals={decimals}
              role={role}
              canSettle={canSettleDispute}
              awardUi={awardUi}
              onAwardChange={setAwardUi}
              onReviewSettlement={() => requestAction("resolveDispute")}
              hourlyState={hourlyState}
              hourlySession={hourlySession}
              showOpenGuidance={openDisputeShown}
              category={disputeCategory}
              onCategoryChange={setDisputeCategory}
              description={disputeDescription}
              onDescriptionChange={setDisputeDescription}
              recoverGeneration={caseRecoverGeneration}
              openSignature={caseOpenSignature}
            />
          </div>
        ) : null}

        <Card id="actions" className="scroll-mt-20 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
            Next step
          </p>
          <h2 className="mt-1 font-display text-xl">Actions</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {actionsSectionGuidance({
              status: contract.status,
              role,
              actions,
              paymentMode: contract.paymentMode,
              workUnitStatus:
                main.find((unit) => unit.status === "Submitted")?.status ??
                main.find((unit) => unit.status === "Revising")?.status ??
                main.find((unit) => unit.status === "Defined")?.status ??
                main[0]?.status ??
                null,
              claimRemaining: remainingFreelancerClaim(contract),
            })}
          </p>
          {tx.state.phase !== "ready" ? (
            <div className="mt-4">
              <TransactionStatus state={tx.state} />
            </div>
          ) : null}
          {contractButtons.length > 0 || primaryUnitButtons.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {primaryUnitButtons.map(({ action, unit }) => (
                <Button
                  key={`${unit.address.toBase58()}-${action}`}
                  variant={contractActionVariant(action)}
                  disabled={tx.busy}
                  onClick={() => requestAction(action, unit)}
                >
                  {actionLabel(action, { workUnitStatus: unit.status })}
                </Button>
              ))}
              {contractButtons.map((action) => (
                <Button
                  key={action}
                  variant={contractActionVariant(action)}
                  disabled={tx.busy}
                  onClick={() => requestAction(action)}
                >
                  {actionLabel(action, { workUnitStatus: trial?.status })}
                </Button>
              ))}
            </div>
          ) : null}
          {actions.includes("addMilestone") ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Next milestone amount">
                <Input
                  value={milestoneAmountUi}
                  onChange={(e) => setMilestoneAmountUi(e.target.value)}
                />
              </Field>
              <Field label="Due offset (seconds)">
                <Input
                  value={milestoneDue}
                  onChange={(e) => setMilestoneDue(e.target.value)}
                />
              </Field>
            </div>
          ) : null}
        </Card>

        {["Cancelled", "Completed", "Resolved", "ActivationRejected", "Declined", "Expired"].includes(
          contract.status
        ) ? (
          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl">Settlement</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {contract.status === "Resolved"
                ? "The resolver recorded settlement accounting. Tokens move only when Collect pay or Claim refund is sent."
                : contract.status === "ActivationRejected"
                  ? "The main engagement did not start. Tokens move only when Claim refund is sent. The freelancer has no earned amount to collect."
                  : contract.status === "Declined"
                    ? `${OFFER_EXIT_COPY.declinedTitle} ${OFFER_EXIT_COPY.declinedBody} ${OFFER_EXIT_COPY.laterRefund}`
                    : contract.status === "Expired"
                      ? "The offer expired before work started. Tokens move only when Claim refund is sent. The freelancer has no earned amount to collect."
                : "Completion records entitlements. Tokens move only when withdraw or refund is sent."}
            </p>
            {contract.status === "Resolved" && role === "freelancer" ? (
              postResolutionCollectAvailable(contract) ? (
                <p className="mt-3 text-sm leading-6 text-ink-soft">
                  {POST_RESOLUTION_COLLECT_COPY.intro}
                </p>
              ) : (
                <p className="mt-3 text-sm leading-6 text-ink-soft">
                  There is no claimable freelancer amount to collect.
                </p>
              )
            ) : null}
            {contract.status === "Resolved" && role === "employer" ? (
              postResolutionRefundAvailable(contract) ? (
                <p className="mt-3 text-sm leading-6 text-ink-soft">
                  {POST_RESOLUTION_REFUND_COPY.intro}
                </p>
              ) : (
                <p className="mt-3 text-sm leading-6 text-ink-soft">
                  There is no employer refund to claim.
                </p>
              )
            ) : null}
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Row
                label="Freelancer settlement"
                value={formatTokenAmount(settlement.freelancerSettlementAmount, decimals)}
              />
              <Row
                label="Employer refundable"
                value={formatTokenAmount(settlement.employerRefundableAmount, decimals)}
              />
              <Row
                label="Still to collect"
                value={formatTokenAmount(remainingFreelancerClaim(contract), decimals)}
              />
              <Row
                label="Still to refund"
                value={formatTokenAmount(remainingEmployerRefund(contract), decimals)}
              />
            </dl>
          </Card>
        ) : null}

        {contract.paymentMode === "Hourly" ? (
          <HourlyShowcase
            contract={contract}
            hourlyState={hourlyState}
            hourlySession={hourlySession}
            now={now}
            decimals={decimals}
            role={role}
            canStart={actions.includes("startHourlySession")}
            canStop={actions.includes("stopHourlySession")}
            canEnd={actions.includes("endHourlyContract")}
            canCollect={actions.includes("withdrawFreelancer")}
            busy={tx.busy}
            onStart={() => requestAction("startHourlySession")}
            onStop={() => requestAction("stopHourlySession")}
            onEnd={() => requestAction("endHourlyContract")}
            onCollect={() => requestAction("withdrawFreelancer")}
          />
        ) : null}

        {contract.paymentMode === "Streaming" ? (
          <>
            {trialStarted ? (
              <Card className="border-cyan/30 bg-[linear-gradient(180deg,rgba(46,230,214,0.08),transparent)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
                  Paid trial
                </p>
                <h2 className="mt-1 font-display text-xl">{trialStarted.headline}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{trialStarted.body}</p>
              </Card>
            ) : null}
            <StreamShowcase
              contract={contract}
              now={now}
              decimals={decimals}
              role={role}
              canRelease={role === "freelancer" && actions.includes("releaseStreamAccrual")}
              canCollect={actions.includes("withdrawFreelancer")}
              busy={tx.busy}
              onRelease={() => requestAction("releaseStreamAccrual")}
              onCollect={() => requestAction("withdrawFreelancer")}
            />
          </>
        ) : null}

        <div id="work" className="scroll-mt-20 space-y-4">
        {contract.trialAmount > 0n ? (
          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl">Paid trial</h2>
            <p className="mt-1 text-sm text-ink-soft">
              The trial is funded and reviewed before the main contract activates. Approving it
              does not rewrite the main amount.
            </p>
            {trial ? (
              <WorkUnitPanel
                unit={trial}
                contract={contract}
                decimals={decimals}
                role={role}
                now={now}
                actions={availableActions({
                  wallet: publicKey,
                  contract,
                  trialUnit: trial,
                  now,
                }).filter(
                  (a) =>
                    TRIAL_ACTIONS.includes(a) ||
                    (a === "rejectActivation" &&
                      (trial.status === "Submitted" || trial.status === "Revising"))
                )}
                busy={tx.busy}
                submissions={submissions}
                historySyncWarning={
                  pendingHistoryPayload &&
                  pendingHistoryPayload.submissionKind ===
                    submissionKindFromWorkUnit(trial.kind) &&
                  pendingHistoryPayload.workUnitIndex === trial.index
                    ? historySyncWarning
                    : null
                }
                onRetrySync={
                  pendingHistoryPayload &&
                  pendingHistoryPayload.submissionKind ===
                    submissionKindFromWorkUnit(trial.kind) &&
                  pendingHistoryPayload.workUnitIndex === trial.index
                    ? () => void persistDeliveryHistory(pendingHistoryPayload)
                    : undefined
                }
                syncBusy={syncBusy}
                onAction={(action) => requestAction(action, trial)}
              />
            ) : (
              <p className="mt-3 text-sm text-ink-faint">Trial unit not found yet.</p>
            )}
          </Card>
        ) : null}

        {workUnitsHaveOwnCards(contract.paymentMode) ? (
          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl">
              {contract.paymentMode === "Milestone" ? "Milestones" : "Deliverable"}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Official review starts only from this card. Drafts and progress updates will belong
              in Messages when messaging is connected.
            </p>
            <div className="mt-4 space-y-3">
              {main.length === 0 ? (
                <p className="text-sm text-ink-faint">No work units loaded.</p>
              ) : (
                main.map((unit) => (
                  <WorkUnitPanel
                    key={unit.address.toBase58()}
                    unit={unit}
                    contract={contract}
                    decimals={decimals}
                    role={role}
                    now={now}
                    actions={availableActions({
                      wallet: publicKey,
                      contract,
                      workUnit: unit,
                      trialUnit: trial,
                      now,
                    }).filter((a) => UNIT_ACTIONS.includes(a))}
                    busy={tx.busy}
                    submissions={submissions}
                    historySyncWarning={
                      pendingHistoryPayload &&
                      pendingHistoryPayload.submissionKind ===
                        submissionKindFromWorkUnit(unit.kind) &&
                      pendingHistoryPayload.workUnitIndex === unit.index
                        ? historySyncWarning
                        : null
                    }
                    onRetrySync={
                      pendingHistoryPayload &&
                      pendingHistoryPayload.submissionKind ===
                        submissionKindFromWorkUnit(unit.kind) &&
                      pendingHistoryPayload.workUnitIndex === unit.index
                        ? () => void persistDeliveryHistory(pendingHistoryPayload)
                        : undefined
                    }
                    syncBusy={syncBusy}
                    onAction={(action) => requestAction(action, unit)}
                  />
                ))
              )}
            </div>
          </Card>
        ) : null}
        </div>

        <div id="payment" className="scroll-mt-20">
          <PaymentProgress contract={contract} decimals={decimals} />
        </div>

        <div id="messages" className="scroll-mt-20">
          <Suspense fallback={null}>
            <ContractMessages
              role={role}
              paymentMode={contract.paymentMode}
              contractAddress={contract.address.toBase58()}
              contractTitle={metadata?.title || "Protected contract"}
            />
          </Suspense>
        </div>

        </div>

        <div className="min-w-0 space-y-4 sm:space-y-5">
        <Card id="overview" className="scroll-mt-20 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">Overview</p>
          <h2 className="mt-1 font-display text-xl">Contract details</h2>
          {metadata?.description ? (
            <p className="mt-3 text-sm leading-6 text-ink-soft">{metadata.description}</p>
          ) : (
            <p className="mt-3 text-sm text-ink-faint">
              Off-chain notes are stored in this browser when the contract was created here.
            </p>
          )}
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Employer" value={<Address value={contract.employer.toBase58()} />} />
            <Row label="Freelancer" value={<Address value={contract.freelancer.toBase58()} />} />
            <Row
              label={resolver.roleTitle}
              value={
                resolver.isTrustedLabel ? resolver.displayName : <Address value={resolver.address} />
              }
            />
            <Row label="Token mint" value={<Address value={contract.tokenMint.toBase58()} />} />
            <Row label="Total" value={formatTokenAmount(contract.totalAmount, decimals)} />
            <Row label="Main" value={formatTokenAmount(contract.mainAmount, decimals)} />
            {contract.trialAmount > 0n ? (
              <Row label="Trial" value={formatTokenAmount(contract.trialAmount, decimals)} />
            ) : null}
            <Row label="Created" value={formatUnix(contract.createdAt)} />
            <Row label="Accepted" value={formatUnix(contract.acceptedAt)} />
            <Row label="Start" value={formatUnix(contract.startTime)} />
            <Row label="End" value={formatUnix(contract.endTime)} />
            <Row label="Acceptance deadline" value={formatUnix(contract.acceptanceDeadline)} />
          </dl>
          <div className="mt-5">
            <Lifecycle contract={contract} />
          </div>
        </Card>

        {!disputeActive ? (
          <Card id="support" className="scroll-mt-20 border-dashed p-4 sm:p-5">
            <h2 className="font-display text-xl">Need help with this contract?</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              Get support, learn about disputes, or open the Resolution Center.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/support">
                <Button variant="secondary" className="text-[13px]">
                  Help & Support
                </Button>
              </Link>
              <Link href={supportTopicHref("disputes")}>
                <Button variant="ghost" className="text-[13px]">
                  About disputes
                </Button>
              </Link>
              {openDisputeShown ? (
                <a href="#resolution">
                  <Button variant="ghost" className="text-[13px]">
                    Resolution Center
                  </Button>
                </a>
              ) : null}
            </div>
          </Card>
        ) : (
          <div id="support" className="scroll-mt-20" />
        )}

        {!disputeActive && openDisputeShown ? (
          <details
            id="resolution"
            className="scroll-mt-20 rounded-[24px] border border-line bg-card p-4 sm:p-5"
          >
            <summary className="cursor-pointer list-none font-display text-xl marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>Resolution & dispute information</span>
                <span className="text-xs font-sans font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Secondary
                </span>
              </span>
            </summary>
            <p className="mt-2 text-sm text-ink-soft">
              This section is for dispute preparation. It is not required for ordinary work on an
              active contract.
            </p>
            <div className="mt-4">
              <ResolutionCenter
                contract={contract}
                units={units}
                now={now}
                decimals={decimals}
                role={role}
                hourlyState={hourlyState}
                hourlySession={hourlySession}
                showOpenGuidance={openDisputeShown}
                category={disputeCategory}
                onCategoryChange={setDisputeCategory}
                description={disputeDescription}
                onDescriptionChange={setDisputeDescription}
                recoverGeneration={caseRecoverGeneration}
                openSignature={caseOpenSignature}
              />
            </div>
          </details>
        ) : !disputeActive ? (
          <div id="resolution" />
        ) : null}

        <details className="rounded-[24px] border border-line bg-card p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-medium">Advanced details</summary>
          <div className="mt-4 space-y-2">
            <Row label="Contract PDA" value={<Address value={contract.address.toBase58()} />} />
            <Row label="Resolver wallet" value={<Address value={contract.resolver.toBase58()} />} />
            <Row label="Metadata URI" value={contract.metadataUri} />
            <Row label="Contract ID" value={contract.contractId.toString()} />
            <Row label="Work units" value={String(contract.workUnitCount)} />
            <Row label="Open reviews" value={String(contract.openReviewCount)} />
          </div>
        </details>
        </div>
        </div>
      </div>

      <Modal
        open={confirm != null}
        title={
          confirm
            ? confirmTitle(confirm.action, {
                workUnitStatus: confirm.unit?.status ?? trial?.status,
              })
            : ""
        }
        onClose={() => setConfirm(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              disabled={tx.busy || confirmBlocked}
              variant={
                confirm?.action === "openDispute" ||
                confirm?.action === "cancelActiveContract" ||
                confirm?.action === "voidStaleRevision" ||
                confirm?.action === "rejectActivation"
                  ? "danger"
                  :                       confirm?.action === "completeContract" ||
                      confirm?.action === "settleTrialAndEnd" ||
                      confirm?.action === "finalizeTrialReviewTimeout" ||
                      confirm?.action === "expireAcceptance" ||
                      confirm?.action === "expireActivation"
                    ? "secondary"
                    : "primary"
              }
              onClick={() => confirm && void execute(confirm.action, confirm.unit)}
            >
              Confirm
            </Button>
          </>
        }
      >
        {confirm ? (
          <ConfirmBody
            action={confirm.action}
            contract={contract}
            decimals={decimals}
            now={now}
            uri={uri}
            setUri={setUri}
            deliveryDraft={deliveryDraft}
            setDeliveryDraft={setDeliveryDraft}
            onPickDeliveryFiles={onPickDeliveryFiles}
            onRemoveDeliveryAttachment={(localId) => void onRemoveDeliveryAttachment(localId)}
            onRetryDeliveryAttachment={onRetryDeliveryAttachment}
            deliverySession={deliverySession}
            onVerifyDeliveryWallet={() => void onVerifyDeliveryWallet()}
            confirmUnit={confirm.unit ?? (confirm.action === "submitTrialWork" ? trial : undefined)}
            awardUi={awardUi}
            setAwardUi={setAwardUi}
            disputeCategory={disputeCategory}
            hourlySessionOpen={hourlySession?.status === "Open"}
            workUnitStatus={confirm.unit?.status ?? trial?.status}
          />
        ) : null}
      </Modal>
    </PageFade>
  );
}

function WorkUnitPanel({
  unit,
  contract,
  decimals,
  role,
  now,
  actions,
  busy,
  submissions,
  historySyncWarning,
  onRetrySync,
  syncBusy,
  onAction,
}: {
  unit: WorkUnitView;
  contract: ContractView;
  decimals?: number;
  role: ContractRole;
  now: number;
  actions: UiAction[];
  busy: boolean;
  submissions: readonly PublicWorkSubmission[];
  historySyncWarning?: string | null;
  onRetrySync?: () => void;
  syncBusy?: boolean;
  onAction: (action: UiAction) => void;
}) {
  const revision =
    unit.status === "Revising"
      ? revisionDeadlinePresentation({
          actionDeadline: unit.actionDeadline,
          now,
          role,
        })
      : null;
  const voidCopy = voidDeliverableCopy({ contract, unit, now });
  const kind = submissionKindFromWorkUnit(unit.kind);
  const submitted = submittedWorkDisplay(unit.submissionUri);

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-faint">
            {deliverableContextTitle(unit)}
          </p>
          <p className="font-medium">{workUnitStatusLabel(unit.status)}</p>
        </div>
        <p className="font-display text-2xl">{formatTokenAmount(unit.amount, decimals)}</p>
      </div>
      {revision ? (
        <div
          className={`mt-3 rounded-xl border p-3 ${
            revision.expired ? "border-danger bg-danger-soft" : "border-gold bg-gold-soft"
          }`}
        >
          <p className="text-sm font-medium text-ink">{revision.heading}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {revision.deadlineLabel}: {revision.deadlineText}
          </p>
          <p className="mt-1 text-sm text-ink-soft">{revision.remainingText}</p>
          {revision.detail ? (
            <p className="mt-2 text-sm leading-6 text-ink-soft">{revision.detail}</p>
          ) : null}
        </div>
      ) : null}
      {voidCopy ? (
        <div className="mt-3 space-y-2 text-sm leading-6 text-ink-soft">
          <p>{voidCopy.body}</p>
          {voidCopy.contractNote ? <p>{voidCopy.contractNote}</p> : null}
          {voidCopy.nextStep ? <p>{voidCopy.nextStep}</p> : null}
        </div>
      ) : null}
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <Row label="Submitted" value={formatUnix(unit.submittedAt)} />
        {unit.status === "Revising" ? null : (
          <Row label="Review deadline" value={formatUnix(unit.actionDeadline)} />
        )}
        <Row
          label="Revisions used"
          value={revisionsUsedLabel(unit.revisionCount, contract.maxRevisions)}
        />
        <Row label={submitted.label} value={<SubmittedWorkValue display={submitted} />} />
      </dl>
      {submitted.kind !== "none" ? (
        <details className="mt-2 text-xs text-ink-faint">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <p className="mt-1">Value saved with the contract:</p>
          <p className="mt-1 break-all font-mono [overflow-wrap:anywhere]">{unit.submissionUri}</p>
        </details>
      ) : null}

      <WorkDeliveryHistory
        submissions={submissions}
        kind={kind}
        workUnitIndex={unit.index}
        syncWarning={historySyncWarning}
        onRetrySync={onRetrySync}
        retryBusy={syncBusy}
      />

      {actions.length > 0 ? (
        unit.kind === "Trial" &&
        unit.status === "Submitted" &&
        trialEmployerDecisions({ actions }).length > 0 ? (
          <div className="mt-4 space-y-3">
            {trialEmployerDecisions({ actions }).map((decision) => (
              <div
                key={decision.action}
                className="rounded-xl border border-line p-3"
              >
                <p className="text-sm font-medium text-ink">{decision.title}</p>
                <p className="mt-1 text-sm leading-6 text-ink-soft">{decision.body}</p>
                {(decision.action === "settleTrialAndEnd" ||
                  decision.action === "finalizeTrialReviewTimeout") &&
                contract.paymentMode === "Streaming" ? (
                  <p className="mt-1 text-sm leading-6 text-ink-soft">
                    {TRIAL_EXIT_COPY.streamingDoesNotStart}
                  </p>
                ) : null}
                {(decision.action === "settleTrialAndEnd" ||
                  decision.action === "finalizeTrialReviewTimeout") &&
                contract.paymentMode === "Hourly" ? (
                  <p className="mt-1 text-sm leading-6 text-ink-soft">
                    {TRIAL_EXIT_COPY.hourlyDoesNotActivate}
                  </p>
                ) : null}
                <div className="mt-3">
                  <Button
                    disabled={busy}
                    variant={contractActionVariant(decision.action)}
                    onClick={() => onAction(decision.action)}
                  >
                    {decision.title}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action}
                disabled={busy}
                variant={
                  action === "voidStaleRevision" || action === "rejectActivation"
                    ? "danger"
                    : "secondary"
                }
                onClick={() => onAction(action)}
              >
                {actionLabel(action, { workUnitStatus: unit.status })}
              </Button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function ConfirmBody({
  action,
  contract,
  decimals,
  now,
  uri,
  setUri,
  deliveryDraft,
  setDeliveryDraft,
  onPickDeliveryFiles,
  onRemoveDeliveryAttachment,
  onRetryDeliveryAttachment,
  deliverySession,
  onVerifyDeliveryWallet,
  confirmUnit,
  awardUi,
  setAwardUi,
  disputeCategory,
  hourlySessionOpen,
  workUnitStatus,
}: {
  action: UiAction;
  contract: ContractView;
  decimals?: number;
  now: number;
  uri: string;
  setUri: (v: string) => void;
  deliveryDraft: DeliveryDraft;
  setDeliveryDraft: Dispatch<SetStateAction<DeliveryDraft>>;
  onPickDeliveryFiles: (files: FileList | null) => void;
  onRemoveDeliveryAttachment: (localId: string) => void;
  onRetryDeliveryAttachment: (localId: string) => void;
  deliverySession: DeliverySessionUi;
  onVerifyDeliveryWallet: () => void;
  confirmUnit?: WorkUnitView | null;
  awardUi: string;
  setAwardUi: (v: string) => void;
  disputeCategory: DisputeCategoryId | "";
  hourlySessionOpen?: boolean;
  workUnitStatus?: WorkUnitView["status"];
}) {
  if (action === "submitWorkUnit" || action === "submitTrialWork") {
    const unit = confirmUnit;
    const copy = action === "submitWorkUnit" ? officialDeliverableCopy(contract) : null;
    return (
      <div className="space-y-4">
        {copy ? (
          <>
            <p className="text-sm leading-6 text-ink-soft">{copy.intro}</p>
            <p className="text-sm leading-6 text-ink-soft">{copy.messagesHint}</p>
          </>
        ) : (
          <p className="text-sm leading-6 text-ink-soft">
            Official paid-trial submission for employer review. Drafts belong in Messages.
          </p>
        )}
        <SubmitWorkForm
          kind={unit?.kind ?? (action === "submitTrialWork" ? "Trial" : "Fixed")}
          contextTitle={
            unit ? deliverableContextTitle(unit) : action === "submitTrialWork" ? "Paid Trial" : "Deliverable"
          }
          revisionLabelText={revisionLabel(unit?.revisionCount ?? 0)}
          draft={deliveryDraft}
          onChange={setDeliveryDraft}
          onPickFiles={onPickDeliveryFiles}
          onRemoveAttachment={onRemoveDeliveryAttachment}
          onRetryAttachment={onRetryDeliveryAttachment}
          deliverySession={deliverySession}
          onVerifyWallet={onVerifyDeliveryWallet}
          reviewPeriod={copy?.reviewPeriod}
          revisionRequests={copy?.revisionRequests}
        />
        {copy ? (
          <div className="text-sm leading-6 text-ink-soft">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              After submission
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {copy.consequences.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3">{copy.recordedReference}</p>
            <p className="mt-2 font-medium text-ink">{copy.acknowledgement}</p>
          </div>
        ) : null}
      </div>
    );
  }
  if (action === "expireAcceptance") {
    const copy = expireOfferConfirmation({ contract, decimals });
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{OFFER_EXIT_COPY.expireBody}</p>
        <ul className="list-disc space-y-1 pl-5">
          {copy.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (action === "expireActivation") {
    const copy = expireActivationConfirmation({ contract, decimals });
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{ACTIVATION_EXIT_COPY.body}</p>
        <ul className="list-disc space-y-1 pl-5">
          {copy.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (action === "declineContract") {
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{OFFER_EXIT_COPY.declinedTitle}</p>
        <p>{OFFER_EXIT_COPY.declinedBody}</p>
        <p>{OFFER_EXIT_COPY.noImmediateTransfer}</p>
      </div>
    );
  }
  if (action === "settleTrialAndEnd") {
    const copy = settleTrialAndEndConfirmation({ contract, decimals });
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{TRIAL_EXIT_COPY.payEndBody}</p>
        <ul className="list-disc space-y-1 pl-5">
          {copy.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (action === "finalizeTrialReviewTimeout") {
    const copy = finalizeTrialReviewTimeoutConfirmation({ contract, decimals });
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{TRIAL_EXIT_COPY.timeoutBody}</p>
        <ul className="list-disc space-y-1 pl-5">
          {copy.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (action === "requestTrialRevision") {
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{TRIAL_EXIT_COPY.revisionBody}</p>
      </div>
    );
  }
  if (action === "rejectActivation") {
    if (workUnitStatus === "Submitted" || workUnitStatus === "Revising") {
      return (
        <div className="space-y-3 text-sm leading-6 text-ink-soft">
          <p>{TRIAL_EXIT_COPY.disputeBody}</p>
        </div>
      );
    }
    const copy = endBeforeTrialWorkConfirmation({ contract, decimals });
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>
          {contract.trialAmount > 0n
            ? TRIAL_EXIT_COPY.endBeforeBody
            : TRIAL_EXIT_COPY.doNotStartBody}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {copy.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (action === "stopHourlySession") {
    const copy = stopHourlyCopy();
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{copy.intro}</p>
        <ul className="list-disc space-y-1 pl-5">
          {copy.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>{HOURLY_COPY.stopNotWithdraw}</p>
        <p>{HOURLY_COPY.shortSession} {HOURLY_COPY.shortRemainder}</p>
        <Field label="Work log link or note (optional)" hint={copy.workLogHint}>
          <Input
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="https://… or a short note"
          />
        </Field>
      </div>
    );
  }
  if (action === "endHourlyContract") {
    const copy = endHourlyCopy();
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{copy.intro}</p>
        <ul className="list-disc space-y-1 pl-5">
          {copy.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (action === "cancelActiveContract") {
    return (
      <p>
        Earned and already released value stays protected according to the program. Unearned value
        becomes employer settlement/refund under current on-chain rules. This interface does not
        promise amounts beyond fetched account state.
      </p>
    );
  }
  if (action === "openDispute") {
    const presentation = openDisputePresentation(contract, now);
    const selected = DISPUTE_CATEGORIES.find((item) => item.id === disputeCategory);
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{SUPPORT_VS_DISPUTE_COPY.whenToDispute}</p>
        <p>{SUPPORT_VS_DISPUTE_COPY.supportFirst}</p>
        <p>
          <a className="font-medium text-accent underline" href={supportTopicHref("disputes")}>
            {SUPPORT_VS_DISPUTE_COPY.helpLabel}
          </a>
        </p>
        <p>{presentation.lead}</p>
        <ul className="list-disc space-y-1 pl-5">
          {presentation.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          {presentation.contestedLabel}:{" "}
          <span className="font-medium text-ink">
            {formatTokenAmount(presentation.contestedAmount, decimals)}
          </span>
        </p>
        {presentation.streamingNote ? <p>{presentation.streamingNote}</p> : null}
        {contract.paymentMode === "Hourly" && hourlySessionOpen ? (
          <p>{HOURLY_COPY.disputeDuringSession}</p>
        ) : null}
        {selected ? (
          <p>
            Optional case note: {selected.label}. {CASE_PREPARATION_COPY.notStored}
          </p>
        ) : (
          <p>{CASE_PREPARATION_COPY.notStored}</p>
        )}
        <p className="font-medium text-ink">{presentation.wallet}</p>
      </div>
    );
  }
  if (action === "resolveDispute") {
    const parsed =
      decimals != null
        ? parseDisputeAwardInput(awardUi, decimals, contract.contestedAmount)
        : { error: "Mint decimals are required for an exact award." };
    const preview = resolutionPreview(contract, parsed.amount ?? 0n);
    const settlementCheck =
      parsed.amount != null ? validateResolverSettlement(contract, parsed.amount) : null;
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{RESOLVE_DISPUTE_COPY.youAre}</p>
        <p>{RESOLVE_DISPUTE_COPY.decides}</p>
        <p>{RESOLVE_DISPUTE_COPY.noEscrow}</p>
        <Field
          label={RESOLVE_DISPUTE_COPY.inputLabel}
          hint={RESOLVE_DISPUTE_COPY.inputHint}
          error={
            parsed.error ??
            (settlementCheck && !settlementCheck.ok ? settlementCheck.error : undefined)
          }
        >
          <Input value={awardUi} onChange={(e) => setAwardUi(e.target.value)} />
        </Field>
        {parsed.amount != null && preview.valid && settlementCheck?.ok ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {resolverSettlementSummary(settlementCheck, decimals).map((row) => (
              <Row key={row.label} label={row.label} value={row.value} />
            ))}
            <Row
              label="Freelancer then collects"
              value={formatTokenAmount(preview.freelancerStillToCollect, decimals)}
            />
            <Row
              label="Employer then refunds"
              value={formatTokenAmount(preview.employerStillToRefund, decimals)}
            />
          </dl>
        ) : null}
        <p>{RESOLVE_DISPUTE_COPY.collectAfter}</p>
        <p>{RESOLVE_DISPUTE_COPY.refundAfter}</p>
        <p className="font-medium text-ink">{RESOLVE_DISPUTE_COPY.wallet}</p>
      </div>
    );
  }
  if (action === "withdrawFreelancer") {
    const streaming = contract.paymentMode === "Streaming";
    const copy = withdrawFreelancerCopy(
      formatTokenAmount(contract.releasedAmount, decimals),
      formatTokenAmount(contract.withdrawnAmount, decimals),
      formatTokenAmount(remainingFreelancerClaim(contract), decimals)
    );
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>
          {contract.status === "Resolved"
            ? POST_RESOLUTION_COLLECT_COPY.intro
            : copy.intro}
        </p>
        {streaming ? <p>{STREAMING_PAY_EXPLAINER}</p> : null}
        {contract.paymentMode === "Hourly" ? <p>{HOURLY_COPY.collectExplain}</p> : null}
        <dl className="grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">
              {streaming ? "Recorded for collection" : "Released"}
            </dt>
            <dd className="font-medium text-ink">{copy.released}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">
              {streaming ? "Already collected" : "Already withdrawn"}
            </dt>
            <dd className="font-medium text-ink">{copy.withdrawn}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">
              {streaming ? "Available to collect" : "Claimable now"}
            </dt>
            <dd className="font-medium text-ink">{copy.remaining}</dd>
          </div>
        </dl>
        <ul className="list-disc space-y-1 pl-5">
          {copy.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="font-medium text-ink">{copy.wallet}</p>
      </div>
    );
  }
  if (action === "claimEmployerRefund") {
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>
          {contract.status === "Resolved"
            ? POST_RESOLUTION_REFUND_COPY.intro
            : "Claims the remaining employer refund from escrow. This transfers tokens to your wallet."}
        </p>
        <p>
          Already refunded: {formatTokenAmount(contract.refundedAmount, decimals)}. Remaining:{" "}
          {formatTokenAmount(remainingEmployerRefund(contract), decimals)}.
        </p>
        <p className="font-medium text-ink">
          {contract.status === "Resolved"
            ? POST_RESOLUTION_REFUND_COPY.wallet
            : "Phantom will ask you to approve the transfer."}
        </p>
      </div>
    );
  }
  if (action === "completeContract") {
    const copy = completeContractCopy();
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{copy.intro}</p>
        <ul className="list-disc space-y-1 pl-5">
          {copy.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="font-medium text-ink">{copy.notPayment}</p>
        <p>{copy.wallet}</p>
      </div>
    );
  }
  if (action === "voidStaleRevision") {
    const copy = voidStaleRevisionCopy();
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <ul className="list-disc space-y-1 pl-5">
          {copy.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="font-medium text-ink">{copy.wallet}</p>
      </div>
    );
  }
  if (action === "releaseStreamAccrual") {
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>
          Update earnings writes the program&apos;s newly accrued amount into
          released accounting. It does not transfer tokens. The freelancer collects
          available pay separately. Collect does not end the stream.
        </p>
        <p>
          The live number on this page is a display estimate only and is not sent as
          an argument. The program uses on-chain time.
        </p>
      </div>
    );
  }
  return <p>This action will be sent to your wallet for approval.</p>;
}

function SubmittedWorkValue({ display }: { display: SubmittedWorkDisplay }) {
  if (display.kind === "link") {
    return (
      <a
        href={display.href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-medium text-cyan underline-offset-2 hover:underline [overflow-wrap:anywhere]"
      >
        {display.text} ↗
      </a>
    );
  }
  if (display.kind === "text") {
    return <span className="break-all [overflow-wrap:anywhere]">{display.text}</span>;
  }
  return <span>{display.text}</span>;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{value}</dd>
    </div>
  );
}
