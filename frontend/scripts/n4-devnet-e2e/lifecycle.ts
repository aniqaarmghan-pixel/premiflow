/**
 * Planned N4 on-chain + API lifecycle — unlocked for one approved Devnet E2E.
 *
 * Reuses StreamPayV2Client / sendV2Method (no alternate instruction encoding).
 */

import { Connection, PublicKey } from "@solana/web3.js";

import {
  StreamPayV2Client,
  fetchContract,
  fetchWorkUnit,
  getStreamPayV2Program,
  deriveWorkUnitPda,
  deriveContractEscrowPda,
  STREAMPAY_PROGRAM_ID,
} from "@/lib/streampay-v2";
import type { CreateContractRequest } from "@/lib/streampay-v2/types";
import { workSubmissionUniqueKey } from "@/lib/server/notifications/work-submitted";

import {
  EXPECTED_EMPLOYER,
  EXPECTED_FREELANCER,
  EXPECTED_MINT,
  PFT_ESCROW_RAW,
  PLANNED_CONTRACT,
  expectedResolver,
} from "./config";
import { keypairToAnchorWallet, type KeypairWallet } from "./keypair-wallet";
import type { N4E2eKeypairs } from "./load-keypairs";
import { apiJson, authenticateWallet } from "./api-session";

export const SUBMISSION_URI =
  "https://premiflow.app/e2e/n4-devnet-work-submission";

export const METADATA_URI = "https://premiflow.app/e2e/n4-devnet-metadata";

export type LifecycleWallets = {
  employer: KeypairWallet;
  freelancer: KeypairWallet;
};

export function buildLifecycleWallets(keys: N4E2eKeypairs): LifecycleWallets {
  return {
    employer: keypairToAnchorWallet(keys.employer),
    freelancer: keypairToAnchorWallet(keys.freelancer),
  };
}

export function buildEmployerClient(
  connection: Connection,
  employerWallet: KeypairWallet
): StreamPayV2Client {
  return new StreamPayV2Client(getStreamPayV2Program(connection, employerWallet));
}

export function buildFreelancerClient(
  connection: Connection,
  freelancerWallet: KeypairWallet
): StreamPayV2Client {
  return new StreamPayV2Client(
    getStreamPayV2Program(connection, freelancerWallet)
  );
}

export function plannedCreateContractRequest(nowSec: number): CreateContractRequest {
  return {
    contractId: BigInt(nowSec),
    paymentMode: PLANNED_CONTRACT.paymentMode,
    startMode: PLANNED_CONTRACT.startMode,
    totalAmount: PLANNED_CONTRACT.totalAmount,
    acceptanceDeadline: nowSec + 86_400,
    scheduledStartTime: 0,
    durationSeconds: 86_400,
    checkpointInterval: 0,
    reviewDuration: PLANNED_CONTRACT.reviewDuration,
    activationReviewDuration: 3_600,
    maxRevisions: PLANNED_CONTRACT.maxRevisions,
    trialAmount: PLANNED_CONTRACT.trialAmount,
    resolver: new PublicKey(expectedResolver()),
    metadataUri: METADATA_URI,
    metadataHash: new Uint8Array(32),
  };
}

export function plannedMint(): PublicKey {
  return new PublicKey(EXPECTED_MINT);
}

export class LifecycleTxError extends Error {
  constructor(
    readonly step: string,
    readonly signature: string | null,
    readonly detail: string,
    readonly logs?: string[]
  ) {
    super(`${step} failed: ${detail}`);
    this.name = "LifecycleTxError";
  }
}

function formatErr(err: unknown): { detail: string; logs?: string[]; signature: string | null } {
  if (!err || typeof err !== "object") {
    return { detail: String(err), signature: null };
  }
  const e = err as {
    message?: string;
    signature?: string;
    logs?: string[];
    transactionLogs?: string[];
  };
  const logs = e.logs ?? e.transactionLogs;
  return {
    detail: e.message ?? String(err),
    logs: Array.isArray(logs) ? logs : undefined,
    signature: typeof e.signature === "string" ? e.signature : null,
  };
}

export type N4E2eResult = {
  contractAddress: string;
  workUnitAddress: string;
  escrowAddress: string;
  signatures: {
    createContract: string;
    addMilestone: string;
    finalizeTerms: string;
    acceptContract: string;
    approveActivation: string;
    submitWorkUnit: string;
  };
  onChain: {
    contractStatus: string;
    workUnitStatus: string;
    revisionCount: number;
    escrowRaw: string;
  };
  submission: {
    firstStatus: number;
    firstCreated: boolean;
    submissionId: string;
    retryStatus: number;
    retryCreated: boolean;
  };
  notification: {
    id: string;
    type: string;
    href: string | null;
    payload: Record<string, unknown> | null;
    expectedUniqueKey: string;
    matchingCount: number;
  };
  negatives: {
    freelancerWorkSubmittedCount: number;
    trialNotificationCount: number;
  };
  balances: {
    employerSolLamports: number;
    freelancerSolLamports: number;
    employerPftRaw: string;
    freelancerPftRaw: string;
  };
  premiflowTransactionCount: 6;
};

/**
 * Exactly one Milestone lifecycle + real submissions/notifications path.
 */
export async function runApprovedLifecycle(input: {
  rpcUrl: string;
  appOrigin: string;
  apiBaseUrl: string;
  keys: N4E2eKeypairs;
}): Promise<N4E2eResult> {
  const connection = new Connection(input.rpcUrl, "confirmed");
  const wallets = buildLifecycleWallets(input.keys);
  const employerClient = buildEmployerClient(connection, wallets.employer);
  const freelancerClient = buildFreelancerClient(connection, wallets.freelancer);
  const mint = plannedMint();
  const nowSec = Math.floor(Date.now() / 1000);
  const request = plannedCreateContractRequest(nowSec);
  const freelancerPk = input.keys.freelancer.publicKey;

  let contractPk: PublicKey;
  let workUnitPk: PublicKey;
  let escrowPk: PublicKey;
  const sigs = {
    createContract: "",
    addMilestone: "",
    finalizeTerms: "",
    acceptContract: "",
    approveActivation: "",
    submitWorkUnit: "",
  };

  // --- TX1 createContract ---
  try {
    const created = await employerClient.createContract({
      request,
      freelancer: freelancerPk,
      tokenMint: mint,
    });
    sigs.createContract = created.signature;
    if (!created.contract) {
      throw new LifecycleTxError(
        "TX1 createContract",
        created.signature,
        "createContract result missing contract address"
      );
    }
    contractPk = created.contract;
    escrowPk =
      created.escrow ??
      deriveContractEscrowPda(contractPk, STREAMPAY_PROGRAM_ID).address;
  } catch (err) {
    const f = formatErr(err);
    throw new LifecycleTxError("TX1 createContract", f.signature, f.detail, f.logs);
  }

  {
    const c = await fetchContract(employerClient.program, contractPk);
    const escrowRaw = await connection.getTokenAccountBalance(escrowPk).then((b) => BigInt(b.value.amount));
    if (c.status !== "Draft") {
      throw new LifecycleTxError(
        "TX1 verify",
        sigs.createContract,
        `expected Draft, got ${c.status}`
      );
    }
    if (escrowRaw !== PFT_ESCROW_RAW) {
      throw new LifecycleTxError(
        "TX1 verify",
        sigs.createContract,
        `expected escrow ${PFT_ESCROW_RAW}, got ${escrowRaw}`
      );
    }
    if (c.employer.toBase58() !== EXPECTED_EMPLOYER) {
      throw new LifecycleTxError("TX1 verify", sigs.createContract, "employer mismatch");
    }
    if (c.freelancer.toBase58() !== EXPECTED_FREELANCER) {
      throw new LifecycleTxError("TX1 verify", sigs.createContract, "freelancer mismatch");
    }
  }

  // --- TX2 addMilestone ---
  try {
    const added = await employerClient.addMilestone({
      contract: contractPk,
      amount: PFT_ESCROW_RAW,
      dueOffsetSeconds: 86_400,
    });
    sigs.addMilestone = added.signature;
    workUnitPk =
      added.workUnit ??
      deriveWorkUnitPda(contractPk, 0, STREAMPAY_PROGRAM_ID).address;
  } catch (err) {
    const f = formatErr(err);
    throw new LifecycleTxError("TX2 addMilestone", f.signature, f.detail, f.logs);
  }

  {
    const wu = await fetchWorkUnit(employerClient.program, workUnitPk);
    if (wu.index !== 0) {
      throw new LifecycleTxError("TX2 verify", sigs.addMilestone, `WU index ${wu.index}`);
    }
    if (wu.amount !== PFT_ESCROW_RAW) {
      throw new LifecycleTxError(
        "TX2 verify",
        sigs.addMilestone,
        `WU amount ${wu.amount}`
      );
    }
    if (wu.status !== "Defined") {
      throw new LifecycleTxError(
        "TX2 verify",
        sigs.addMilestone,
        `expected Defined, got ${wu.status}`
      );
    }
  }

  // --- TX3 finalizeTerms ---
  try {
    const fin = await employerClient.finalizeTerms(contractPk);
    sigs.finalizeTerms = fin.signature;
  } catch (err) {
    const f = formatErr(err);
    throw new LifecycleTxError("TX3 finalizeTerms", f.signature, f.detail, f.logs);
  }

  {
    const c = await fetchContract(employerClient.program, contractPk);
    if (c.status !== "PendingAcceptance") {
      throw new LifecycleTxError(
        "TX3 verify",
        sigs.finalizeTerms,
        `expected PendingAcceptance, got ${c.status}`
      );
    }
  }

  // --- TX4 acceptContract ---
  try {
    const acc = await freelancerClient.acceptContract(contractPk);
    sigs.acceptContract = acc.signature;
  } catch (err) {
    const f = formatErr(err);
    throw new LifecycleTxError("TX4 acceptContract", f.signature, f.detail, f.logs);
  }

  {
    const c = await fetchContract(employerClient.program, contractPk);
    if (c.status !== "PendingEmployerApproval") {
      throw new LifecycleTxError(
        "TX4 verify",
        sigs.acceptContract,
        `expected PendingEmployerApproval, got ${c.status}`
      );
    }
  }

  // --- TX5 approveActivation ---
  try {
    const act = await employerClient.approveActivation(contractPk);
    sigs.approveActivation = act.signature;
  } catch (err) {
    const f = formatErr(err);
    throw new LifecycleTxError(
      "TX5 approveActivation",
      f.signature,
      f.detail,
      f.logs
    );
  }

  {
    const c = await fetchContract(employerClient.program, contractPk);
    const wu = await fetchWorkUnit(employerClient.program, workUnitPk);
    if (c.status !== "Active") {
      throw new LifecycleTxError(
        "TX5 verify",
        sigs.approveActivation,
        `expected Active, got ${c.status}`
      );
    }
    if (wu.status !== "Defined") {
      throw new LifecycleTxError(
        "TX5 verify",
        sigs.approveActivation,
        `WU expected Defined for submit, got ${wu.status}`
      );
    }
  }

  // --- TX6 submitWorkUnit ---
  const submissionHash = new Uint8Array(32);
  submissionHash[0] = 0x4e; // 'N' marker — non-empty content
  try {
    const sub = await freelancerClient.submitWorkUnit({
      contract: contractPk,
      workUnit: workUnitPk,
      submissionUri: SUBMISSION_URI,
      submissionHash,
    });
    sigs.submitWorkUnit = sub.signature;
  } catch (err) {
    const f = formatErr(err);
    throw new LifecycleTxError("TX6 submitWorkUnit", f.signature, f.detail, f.logs);
  }

  {
    const wu = await fetchWorkUnit(employerClient.program, workUnitPk);
    if (wu.status !== "Submitted") {
      throw new LifecycleTxError(
        "TX6 verify",
        sigs.submitWorkUnit,
        `expected Submitted, got ${wu.status}`
      );
    }
    if (wu.revisionCount !== 0) {
      throw new LifecycleTxError(
        "TX6 verify",
        sigs.submitWorkUnit,
        `expected revisionCount 0, got ${wu.revisionCount}`
      );
    }
  }

  const contractAddress = contractPk.toBase58();

  // --- Freelancer auth + submissions POST ---
  const freSession = await authenticateWallet({
    baseUrl: input.apiBaseUrl,
    origin: input.appOrigin,
    keypair: input.keys.freelancer,
  });

  const submissionBody = {
    submissionKind: "milestone",
    workUnitIndex: 0,
    revisionNumber: 0,
    deliveryNote: "N4 scripted Devnet E2E work submission (disposable wallets).",
    links: [{ url: SUBMISSION_URI, label: "N4 E2E deliverable" }],
    onChainSubmissionUri: SUBMISSION_URI,
    transactionSignature: sigs.submitWorkUnit,
  };

  const firstPost = await apiJson<{
    submission?: { id?: string; transactionSignature?: string | null };
    created?: boolean;
    error?: { code?: string; message?: string };
  }>(input.apiBaseUrl, `/api/contracts/${contractAddress}/submissions`, {
    method: "POST",
    origin: input.appOrigin,
    cookie: freSession.cookie,
    body: submissionBody,
  });

  if (firstPost.status !== 201 && firstPost.status !== 200) {
    throw new Error(
      `submissions POST failed (${firstPost.status}): ${JSON.stringify(firstPost.json)}`
    );
  }
  const submissionId = firstPost.json.submission?.id;
  if (!submissionId) {
    throw new Error(`submissions POST missing submission.id: ${JSON.stringify(firstPost.json)}`);
  }
  if (firstPost.json.created !== true) {
    throw new Error(
      `expected created:true on first persist, got ${String(firstPost.json.created)}`
    );
  }

  // --- Employer auth + notifications GET ---
  const empSession = await authenticateWallet({
    baseUrl: input.apiBaseUrl,
    origin: input.appOrigin,
    keypair: input.keys.employer,
  });

  const employerNotes = await apiJson<{
    notifications?: Array<{
      id: string;
      type: string;
      contractAddress: string | null;
      href: string | null;
      payload: Record<string, unknown> | null;
    }>;
    error?: { code?: string; message?: string };
  }>(input.apiBaseUrl, "/api/notifications?limit=50", {
    method: "GET",
    origin: input.appOrigin,
    cookie: empSession.cookie,
  });
  if (employerNotes.status !== 200 || !employerNotes.json.notifications) {
    throw new Error(
      `employer notifications GET failed (${employerNotes.status}): ${JSON.stringify(employerNotes.json)}`
    );
  }

  const matching = employerNotes.json.notifications.filter((n) => {
    if (n.type !== "work_submitted") return false;
    if (n.contractAddress !== contractAddress) return false;
    if (n.href !== `/contracts/${contractAddress}`) return false;
    const p = n.payload ?? {};
    return (
      p.workUnitIndex === 0 &&
      p.revisionNumber === 0 &&
      p.transactionSignature === sigs.submitWorkUnit &&
      typeof p.submissionId === "string" &&
      p.submissionId === submissionId
    );
  });

  if (matching.length !== 1) {
    throw new Error(
      `expected exactly 1 matching work_submitted notification, got ${matching.length}: ${JSON.stringify(
        employerNotes.json.notifications.filter((n) => n.contractAddress === contractAddress)
      )}`
    );
  }
  const note = matching[0]!;
  const expectedUniqueKey = workSubmissionUniqueKey(
    "work_submitted",
    sigs.submitWorkUnit,
    EXPECTED_EMPLOYER
  );

  // --- Freelancer negative: no employer work_submitted ---
  const freNotes = await apiJson<{
    notifications?: Array<{ type: string; contractAddress: string | null }>;
  }>(input.apiBaseUrl, "/api/notifications?limit=50", {
    method: "GET",
    origin: input.appOrigin,
    cookie: freSession.cookie,
  });
  if (freNotes.status !== 200 || !freNotes.json.notifications) {
    throw new Error(
      `freelancer notifications GET failed (${freNotes.status}): ${JSON.stringify(freNotes.json)}`
    );
  }
  const freWorkSubmitted = freNotes.json.notifications.filter(
    (n) =>
      n.type === "work_submitted" && n.contractAddress === contractAddress
  );
  const trialNotificationCount = [
    ...employerNotes.json.notifications,
    ...freNotes.json.notifications,
  ].filter(
    (n) =>
      n.contractAddress === contractAddress &&
      (n.type.includes("trial") || n.type === "trial_submitted")
  ).length;

  if (freWorkSubmitted.length !== 0) {
    throw new Error(
      `freelancer received work_submitted for this contract (count=${freWorkSubmitted.length})`
    );
  }
  if (trialNotificationCount !== 0) {
    throw new Error(
      `unexpected trial-related notification count=${trialNotificationCount}`
    );
  }

  // --- Idempotency: same POST again (no new chain tx) ---
  const retryPost = await apiJson<{
    submission?: { id?: string };
    created?: boolean;
    error?: { code?: string; message?: string };
  }>(input.apiBaseUrl, `/api/contracts/${contractAddress}/submissions`, {
    method: "POST",
    origin: input.appOrigin,
    cookie: freSession.cookie,
    body: submissionBody,
  });
  if (retryPost.status !== 200 && retryPost.status !== 201) {
    throw new Error(
      `idempotent submissions POST failed (${retryPost.status}): ${JSON.stringify(retryPost.json)}`
    );
  }
  if (retryPost.json.created !== false) {
    throw new Error(
      `expected created:false on idempotent retry, got ${String(retryPost.json.created)}`
    );
  }
  if (retryPost.json.submission?.id !== submissionId) {
    throw new Error(
      `idempotent retry changed submission id: ${retryPost.json.submission?.id} vs ${submissionId}`
    );
  }

  const employerNotes2 = await apiJson<{
    notifications?: Array<{
      id: string;
      type: string;
      contractAddress: string | null;
      href: string | null;
      payload: Record<string, unknown> | null;
    }>;
  }>(input.apiBaseUrl, "/api/notifications?limit=50", {
    method: "GET",
    origin: input.appOrigin,
    cookie: empSession.cookie,
  });
  const matching2 = (employerNotes2.json.notifications ?? []).filter((n) => {
    if (n.type !== "work_submitted") return false;
    if (n.contractAddress !== contractAddress) return false;
    const p = n.payload ?? {};
    return p.transactionSignature === sigs.submitWorkUnit;
  });
  if (matching2.length !== 1) {
    throw new Error(
      `after idempotent retry expected 1 work_submitted, got ${matching2.length}`
    );
  }

  // Final on-chain snapshot
  const finalContract = await fetchContract(employerClient.program, contractPk);
  const finalWu = await fetchWorkUnit(employerClient.program, workUnitPk);
  const escrowRaw = BigInt(
    (await connection.getTokenAccountBalance(escrowPk)).value.amount
  );

  const employerSol = await connection.getBalance(input.keys.employer.publicKey);
  const freelancerSol = await connection.getBalance(
    input.keys.freelancer.publicKey
  );
  async function pftRaw(owner: PublicKey): Promise<bigint> {
    const atas = await connection.getTokenAccountsByOwner(owner, { mint });
    let total = 0n;
    for (const { pubkey } of atas.value) {
      total += BigInt((await connection.getTokenAccountBalance(pubkey)).value.amount);
    }
    return total;
  }

  return {
    contractAddress,
    workUnitAddress: workUnitPk.toBase58(),
    escrowAddress: escrowPk.toBase58(),
    signatures: sigs,
    onChain: {
      contractStatus: finalContract.status,
      workUnitStatus: finalWu.status,
      revisionCount: finalWu.revisionCount,
      escrowRaw: escrowRaw.toString(),
    },
    submission: {
      firstStatus: firstPost.status,
      firstCreated: true,
      submissionId,
      retryStatus: retryPost.status,
      retryCreated: false,
    },
    notification: {
      id: note.id,
      type: note.type,
      href: note.href,
      payload: note.payload,
      expectedUniqueKey,
      matchingCount: matching2.length,
    },
    negatives: {
      freelancerWorkSubmittedCount: freWorkSubmitted.length,
      trialNotificationCount,
    },
    balances: {
      employerSolLamports: employerSol,
      freelancerSolLamports: freelancerSol,
      employerPftRaw: (await pftRaw(input.keys.employer.publicKey)).toString(),
      freelancerPftRaw: (await pftRaw(input.keys.freelancer.publicKey)).toString(),
    },
    premiflowTransactionCount: 6,
  };
}
