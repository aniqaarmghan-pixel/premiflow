"use client";

import { getMint } from "@solana/spl-token";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Lifecycle } from "@/components/contracts/Lifecycle";
import { PaymentProgress } from "@/components/contracts/PaymentProgress";
import { StatusBadge } from "@/components/contracts/StatusBadge";
import { StreamShowcase } from "@/components/contracts/StreamShowcase";
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
import { formatUnix } from "@/lib/app/datetime";
import { localMetadataStore } from "@/lib/app/local-metadata";
import { formatTokenAmount } from "@/lib/app/money";
import {
  actionLabel,
  completeContractCopy,
  confirmTitle,
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
  voidDeliverableCopy,
  voidStaleRevisionCopy,
  withdrawFreelancerCopy,
} from "@/lib/app/view-model";
import {
  employerRemainder,
  validateAmountUi,
  validateDisputeAward,
} from "@/lib/app/validation";
import { useNow } from "@/lib/hooks/useNow";
import { useStreamPayClient } from "@/lib/hooks/useStreamPayClient";
import { useTx } from "@/lib/hooks/useTx";
import { useContracts } from "@/lib/hooks/ContractsProvider";
import {
  availableActions,
  fetchContract,
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
  type UiAction,
  type WorkUnitView,
} from "@/lib/streampay-v2";

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
];

export function ContractDetail({ address }: { address: string }) {
  const { connected, publicKey } = useWallet();
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
  const [decimals, setDecimals] = useState<number | undefined>();
  const [metadata, setMetadata] = useState<ContractMetadata | null>(null);
  const [confirm, setConfirm] = useState<{
    action: UiAction;
    unit?: WorkUnitView;
  } | null>(null);
  const [uri, setUri] = useState("");
  const [awardUi, setAwardUi] = useState("");
  const [milestoneAmountUi, setMilestoneAmountUi] = useState("");
  const [milestoneDue, setMilestoneDue] = useState("3600");

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
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not load this contract.");
    }
  }, [address, connection, wallet]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const { trial, main } = splitTrialUnits(units);

  const actions = useMemo(() => {
    if (!publicKey || !contract) return [];
    const trialUnit = units.find((u) => u.kind === "Trial") ?? null;
    return availableActions({
      wallet: publicKey,
      contract,
      trialUnit,
      now,
    });
  }, [contract, now, publicKey, units]);

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
  const other = counterparty(publicKey, contract);
  const settlement = settlementView(contract);

  async function afterSuccess() {
    await load();
    await refreshList();
  }

  async function execute(action: UiAction, unit?: WorkUnitView) {
    if (!client || !contract) return;
    const ok = await tx.run(
      actionLabel(action, { workUnitStatus: unit?.status }),
      async () => {
      switch (action) {
        case "finalizeTerms":
          return client.finalizeTerms(contract.address);
        case "acceptContract":
          return client.acceptContract(contract.address);
        case "declineContract":
          return client.declineContract(contract.address);
        case "approveActivation":
          return client.approveActivation(contract.address);
        case "rejectActivation":
          return client.rejectActivation(contract.address);
        case "submitTrialWork": {
          const hash = await hashBytes(new TextEncoder().encode(uri));
          return client.submitTrialWork({
            contract: contract.address,
            submissionUri: uri,
            submissionHash: hash,
          });
        }
        case "requestTrialRevision":
          return client.requestTrialRevision(contract.address);
        case "approveTrialAndActivate":
          return client.approveTrialAndActivate(contract.address);
        case "submitWorkUnit": {
          if (!unit) throw new Error("Choose a work unit.");
          const hash = await hashBytes(new TextEncoder().encode(uri));
          return client.submitWorkUnit({
            contract: contract.address,
            workUnit: unit.address,
            submissionUri: uri,
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
          return client.withdrawFreelancer({ contract: contract.address });
        case "claimEmployerRefund":
          return client.claimEmployerRefund({ contract: contract.address });
        case "openDispute":
          return client.openDispute(contract.address);
        case "resolveDispute": {
          if (decimals == null) throw new Error("Mint decimals are required for an exact award.");
          const parsed = validateAmountUi(awardUi, decimals, "Award");
          if (parsed.error || parsed.amount == null) throw new Error(parsed.error ?? "Invalid award");
          const invalid = validateDisputeAward(parsed.amount, contract.contestedAmount);
          if (invalid) throw new Error(invalid);
          return client.resolveDispute({
            contract: contract.address,
            freelancerContestedAward: parsed.amount,
          });
        }
        case "completeContract":
          return client.completeContract(contract.address);
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
      },
      {
        action,
        workUnitStatus:
          unit?.status ??
          (action === "rejectActivation" ? trial?.status : undefined),
      }
    );
    setConfirm(null);
    if (ok) await afterSuccess();
    else if (action === "voidStaleRevision" || action === "submitWorkUnit") {
      await load();
      await refreshList();
    }
  }

  function requestAction(action: UiAction, unit?: WorkUnitView) {
    if (needsConfirmation(action)) {
      setConfirm({ action, unit });
      return;
    }
    void execute(action, unit);
  }

  const contractButtons = actions.filter(
    (a) => !UNIT_ACTIONS.includes(a) && !TRIAL_ACTIONS.includes(a)
  );

  return (
    <PageFade>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
              {presentType(contract.paymentMode)} · {roleLabel(role)}
            </p>
            <h1 className="mt-1 font-display text-4xl tracking-tight">
              {metadata?.title || "Protected contract"}
            </h1>
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

        <Card className="p-5">
          <Lifecycle contract={contract} />
        </Card>

        {contract.paymentMode === "Streaming" ? (
          <StreamShowcase
            contract={contract}
            now={now}
            decimals={decimals}
            canRelease={actions.includes("releaseStreamAccrual")}
            busy={tx.busy}
            onRelease={() => requestAction("releaseStreamAccrual")}
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <PaymentProgress contract={contract} decimals={decimals} />
          <Card className="p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">Overview</p>
            <h2 className="mt-1 font-display text-2xl">Parties & terms</h2>
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
              <Row label="Resolver" value={<Address value={contract.resolver.toBase58()} />} />
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
          </Card>
        </div>

        {contract.trialAmount > 0n ? (
          <Card className="p-5">
            <h2 className="font-display text-2xl">Paid trial</h2>
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
                }).filter((a) => TRIAL_ACTIONS.includes(a))}
                busy={tx.busy}
                onAction={(action) => requestAction(action, trial)}
              />
            ) : (
              <p className="mt-3 text-sm text-ink-faint">Trial unit not found yet.</p>
            )}
          </Card>
        ) : null}

        {contract.paymentMode !== "Streaming" ? (
          <Card className="p-5">
            <h2 className="font-display text-2xl">
              {contract.paymentMode === "Milestone" ? "Milestones" : "Deliverable"}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Official review starts only from this card. Drafts and progress updates belong in
              Messages.
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
                    onAction={(action) => requestAction(action, unit)}
                  />
                ))
              )}
            </div>
          </Card>
        ) : null}

        {contract.status === "Disputed" || contract.status === "Resolved" ? (
          <Card className="p-5">
            <h2 className="font-display text-2xl">Dispute</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Contested value is frozen until the named resolver awards the freelancer share.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Row label="Initiator" value={contract.disputeInitiator} />
              <Row label="Opened" value={formatUnix(contract.disputedAt)} />
              <Row
                label="Contested"
                value={formatTokenAmount(contract.contestedAmount, decimals)}
              />
              <Row label="Resolver" value={<Address value={contract.resolver.toBase58()} />} />
            </dl>
          </Card>
        ) : null}

        {["Cancelled", "Completed", "Resolved"].includes(contract.status) ? (
          <Card className="p-5">
            <h2 className="font-display text-2xl">Settlement</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Completion records entitlements. Tokens move only when withdraw or refund is sent.
            </p>
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
                label="Still to withdraw"
                value={formatTokenAmount(remainingFreelancerClaim(contract), decimals)}
              />
              <Row
                label="Still to refund"
                value={formatTokenAmount(remainingEmployerRefund(contract), decimals)}
              />
            </dl>
          </Card>
        ) : null}

        <Card className="p-5">
          <h2 className="font-display text-2xl">Actions</h2>
          <p className="mt-1 text-sm text-ink-faint">
            Buttons follow Phase 12 availability. The program still authorizes every instruction.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {contractButtons.length === 0 ? (
              <p className="text-sm text-ink-faint">No contract-level actions right now.</p>
            ) : (
              contractButtons.map((action) => (
                <Button
                  key={action}
                  variant={action === "openDispute" || action === "cancelActiveContract" ? "danger" : "primary"}
                  disabled={tx.busy}
                  onClick={() => requestAction(action)}
                >
                  {actionLabel(action)}
                </Button>
              ))
            )}
          </div>
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
          <div className="mt-4">
            <TransactionStatus state={tx.state} />
          </div>
        </Card>

        <details className="rounded-[24px] border border-line bg-card p-5">
          <summary className="cursor-pointer text-sm font-medium">Advanced details</summary>
          <div className="mt-4 space-y-2">
            <Row label="Contract PDA" value={<Address value={contract.address.toBase58()} />} />
            <Row label="Metadata URI" value={contract.metadataUri} />
            <Row label="Contract ID" value={contract.contractId.toString()} />
            <Row label="Work units" value={String(contract.workUnitCount)} />
            <Row label="Open reviews" value={String(contract.openReviewCount)} />
          </div>
        </details>
      </div>

      <Modal
        open={confirm != null}
        title={confirm ? confirmTitle(confirm.action) : ""}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              disabled={tx.busy}
              variant={
                confirm?.action === "openDispute" ||
                confirm?.action === "cancelActiveContract" ||
                confirm?.action === "voidStaleRevision"
                  ? "danger"
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
            uri={uri}
            setUri={setUri}
            awardUi={awardUi}
            setAwardUi={setAwardUi}
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
  onAction,
}: {
  unit: WorkUnitView;
  contract: ContractView;
  decimals?: number;
  role: ContractRole;
  now: number;
  actions: UiAction[];
  busy: boolean;
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

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-faint">
            {unit.kind} · #{unit.index}
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
        <Row label="Submission URI" value={unit.submissionUri || "None"} />
      </dl>
      {actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action}
              disabled={busy}
              variant={action === "voidStaleRevision" ? "danger" : "secondary"}
              onClick={() => onAction(action)}
            >
              {actionLabel(action, { workUnitStatus: unit.status })}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConfirmBody({
  action,
  contract,
  decimals,
  uri,
  setUri,
  awardUi,
  setAwardUi,
}: {
  action: UiAction;
  contract: ContractView;
  decimals?: number;
  uri: string;
  setUri: (v: string) => void;
  awardUi: string;
  setAwardUi: (v: string) => void;
}) {
  if (action === "submitWorkUnit") {
    const copy = officialDeliverableCopy(contract);
    return (
      <div className="space-y-4 text-sm leading-6 text-ink-soft">
        <p>{copy.intro}</p>
        <p>{copy.messagesHint}</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">
              {copy.reviewPeriodLabel}
            </dt>
            <dd className="font-medium text-ink">{copy.reviewPeriod}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">
              {copy.revisionRequestsLabel}
            </dt>
            <dd className="font-medium text-ink">{copy.revisionRequests}</dd>
          </div>
        </dl>
        <Field label={copy.fieldLabel} hint={copy.fieldHint}>
          <Input
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            After submission
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {copy.consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <p>{copy.recordedReference}</p>
        <p className="font-medium text-ink">{copy.acknowledgement}</p>
      </div>
    );
  }
  if (action === "submitTrialWork") {
    return (
      <Field
        label="Submission URI"
        hint="A link to the trial deliverable. This app does not host files. Max 200 characters."
      >
        <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…" />
      </Field>
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
    return (
      <p>
        Opening a dispute freezes contested economics until the named resolver awards a split. Only
        that resolver can resolve.
      </p>
    );
  }
  if (action === "resolveDispute") {
    const parsed =
      decimals != null ? validateAmountUi(awardUi || "0", decimals, "Award") : { error: "Need mint decimals" };
    const award = parsed.amount ?? 0n;
    const remainder = employerRemainder(contract.contestedAmount, award);
    return (
      <div className="space-y-3">
        <p>
          Contested amount: {formatTokenAmount(contract.contestedAmount, decimals)}. Award must be
          an integer in token units between 0 and that amount.
        </p>
        <Field label="Freelancer award" error={parsed.error ?? validateDisputeAward(award, contract.contestedAmount) ?? undefined}>
          <Input value={awardUi} onChange={(e) => setAwardUi(e.target.value)} />
        </Field>
        <p className="text-sm">
          Employer remainder: {formatTokenAmount(remainder, decimals)}
        </p>
      </div>
    );
  }
  if (action === "withdrawFreelancer") {
    const copy = withdrawFreelancerCopy(
      formatTokenAmount(contract.releasedAmount, decimals),
      formatTokenAmount(contract.withdrawnAmount, decimals),
      formatTokenAmount(remainingFreelancerClaim(contract), decimals)
    );
    return (
      <div className="space-y-3 text-sm leading-6 text-ink-soft">
        <p>{copy.intro}</p>
        <dl className="grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Released</dt>
            <dd className="font-medium text-ink">{copy.released}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Already withdrawn</dt>
            <dd className="font-medium text-ink">{copy.withdrawn}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Claimable now</dt>
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
      <p>
        Claims the remaining employer refund. Already refunded:{" "}
        {formatTokenAmount(contract.refundedAmount, decimals)}. Remaining:{" "}
        {formatTokenAmount(remainingEmployerRefund(contract), decimals)}.
      </p>
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
      <p>
        The program computes accrued release from on-chain time. The live number on this page is a
        display estimate only and is not sent as an argument.
      </p>
    );
  }
  return <p>This action will be sent to your wallet for approval.</p>;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{value}</dd>
    </div>
  );
}
