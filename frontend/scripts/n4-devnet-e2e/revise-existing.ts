/**
 * N4 revised_work_submitted Devnet E2E — reuses preserved contract.
 * Maximum 2 PREMIFLOW transactions. Test-only.
 */

import { Connection, PublicKey } from "@solana/web3.js";

import {
  fetchContract,
  fetchWorkUnit,
  deriveContractEscrowPda,
  STREAMPAY_PROGRAM_ID,
} from "@/lib/streampay-v2";
import { availableActions } from "@/lib/streampay-v2/actions";
import { workSubmissionUniqueKey } from "@/lib/server/notifications/work-submitted";

import {
  EXPECTED_EMPLOYER,
  EXPECTED_FREELANCER,
  PFT_ESCROW_RAW,
} from "./config";
import { apiJson, authenticateWallet } from "./api-session";
import {
  buildEmployerClient,
  buildFreelancerClient,
  buildLifecycleWallets,
  LifecycleTxError,
} from "./lifecycle";
import type { N4E2eKeypairs } from "./load-keypairs";

export const PRESERVED_CONTRACT =
  "GzbsRoX6D1seSwrgAgtxbTdEf9FAR2qky7XmTPGiexas";
export const PRESERVED_WORK_UNIT =
  "D5aXufUftBEDNrWVvbK5SFyvJjErerjDgh1TmzedY24U";

export const REVISED_SUBMISSION_URI =
  "https://premiflow.app/e2e/n4-devnet-revised-work-submission";

function formatErr(err: unknown): {
  detail: string;
  logs?: string[];
  signature: string | null;
} {
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

async function escrowRaw(
  connection: Connection,
  contract: PublicKey
): Promise<bigint> {
  const escrow = deriveContractEscrowPda(contract, STREAMPAY_PROGRAM_ID).address;
  return BigInt((await connection.getTokenAccountBalance(escrow)).value.amount);
}

export type ReviseE2eResult = {
  contractAddress: string;
  workUnitAddress: string;
  preflight: {
    now: number;
    submittedAt: number;
    actionDeadline: number;
    secondsUntilDeadline: number;
    revisionWindowValid: true;
    escrowBefore: string;
  };
  signatures: {
    requestWorkRevision: string;
    submitWorkUnit: string;
  };
  afterTx1: {
    contractStatus: string;
    workUnitStatus: string;
    revisionCount: number;
  };
  afterTx2: {
    contractStatus: string;
    workUnitStatus: string;
    revisionCount: number;
    escrowAfter: string;
  };
  submission: {
    firstStatus: number;
    firstCreated: boolean;
    submissionId: string;
    revisionNumber: number;
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
    originalWorkSubmittedStillPresent: boolean;
  };
  negatives: {
    freelancerRevisedCount: number;
    trialNotificationCount: number;
  };
  premiflowTransactionCount: 2;
};

export class RevisionWindowExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevisionWindowExpiredError";
  }
}

export async function runRevisedSubmissionE2e(input: {
  rpcUrl: string;
  appOrigin: string;
  apiBaseUrl: string;
  keys: N4E2eKeypairs;
}): Promise<ReviseE2eResult> {
  const connection = new Connection(input.rpcUrl, "confirmed");
  const wallets = buildLifecycleWallets(input.keys);
  const employerClient = buildEmployerClient(connection, wallets.employer);
  const freelancerClient = buildFreelancerClient(connection, wallets.freelancer);

  const contractPk = new PublicKey(PRESERVED_CONTRACT);
  const workUnitPk = new PublicKey(PRESERVED_WORK_UNIT);

  // --- Preflight (must pass before any sign) ---
  const now = Math.floor(Date.now() / 1000);
  const c0 = await fetchContract(employerClient.program, contractPk);
  const w0 = await fetchWorkUnit(employerClient.program, workUnitPk);
  const empActions = availableActions({
    contract: c0,
    workUnit: w0,
    wallet: c0.employer,
    now,
  });
  const escrowBefore = await escrowRaw(connection, contractPk);

  if (c0.employer.toBase58() !== EXPECTED_EMPLOYER) {
    throw new Error("Contract employer mismatch.");
  }
  if (c0.freelancer.toBase58() !== EXPECTED_FREELANCER) {
    throw new Error("Contract freelancer mismatch.");
  }
  if (c0.status !== "Active" || w0.status !== "Submitted" || w0.revisionCount !== 0) {
    throw new Error(
      `Unexpected preflight state: contract=${c0.status} wu=${w0.status} rev=${w0.revisionCount}`
    );
  }
  if (c0.maxRevisions < 1 || w0.revisionCount >= c0.maxRevisions) {
    throw new Error("No revisions remaining.");
  }
  if (
    now >= w0.actionDeadline ||
    !empActions.includes("requestWorkRevision")
  ) {
    throw new RevisionWindowExpiredError(
      `Review window expired or requestWorkRevision unavailable (now=${now}, deadline=${w0.actionDeadline}, actions=${empActions.join(",")})`
    );
  }
  if (escrowBefore !== PFT_ESCROW_RAW) {
    throw new Error(`Escrow expected ${PFT_ESCROW_RAW}, got ${escrowBefore}`);
  }

  const sigs = { requestWorkRevision: "", submitWorkUnit: "" };

  // --- TX1 requestWorkRevision ---
  try {
    const tx1 = await employerClient.requestWorkRevision({
      contract: contractPk,
      workUnit: workUnitPk,
    });
    sigs.requestWorkRevision = tx1.signature;
  } catch (err) {
    const f = formatErr(err);
    throw new LifecycleTxError(
      "TX1 requestWorkRevision",
      f.signature,
      f.detail,
      f.logs
    );
  }

  const c1 = await fetchContract(employerClient.program, contractPk);
  const w1 = await fetchWorkUnit(employerClient.program, workUnitPk);
  if (c1.status !== "Active") {
    throw new LifecycleTxError(
      "TX1 verify",
      sigs.requestWorkRevision,
      `expected Active, got ${c1.status}`
    );
  }
  if (w1.status !== "Revising") {
    throw new LifecycleTxError(
      "TX1 verify",
      sigs.requestWorkRevision,
      `expected Revising, got ${w1.status}`
    );
  }
  if (w1.revisionCount < 1) {
    throw new LifecycleTxError(
      "TX1 verify",
      sigs.requestWorkRevision,
      `expected revisionCount >= 1, got ${w1.revisionCount}`
    );
  }
  const escrowMid = await escrowRaw(connection, contractPk);
  if (escrowMid !== PFT_ESCROW_RAW) {
    throw new LifecycleTxError(
      "TX1 verify",
      sigs.requestWorkRevision,
      `escrow moved: ${escrowMid}`
    );
  }

  // --- TX2 submitWorkUnit (revised) ---
  const submissionHash = new Uint8Array(32);
  submissionHash[0] = 0x52; // 'R' revised marker
  try {
    const tx2 = await freelancerClient.submitWorkUnit({
      contract: contractPk,
      workUnit: workUnitPk,
      submissionUri: REVISED_SUBMISSION_URI,
      submissionHash,
    });
    sigs.submitWorkUnit = tx2.signature;
  } catch (err) {
    const f = formatErr(err);
    throw new LifecycleTxError("TX2 submitWorkUnit", f.signature, f.detail, f.logs);
  }

  const c2 = await fetchContract(employerClient.program, contractPk);
  const w2 = await fetchWorkUnit(employerClient.program, workUnitPk);
  const escrowAfter = await escrowRaw(connection, contractPk);
  if (c2.status !== "Active") {
    throw new LifecycleTxError(
      "TX2 verify",
      sigs.submitWorkUnit,
      `expected Active, got ${c2.status}`
    );
  }
  if (w2.status !== "Submitted") {
    throw new LifecycleTxError(
      "TX2 verify",
      sigs.submitWorkUnit,
      `expected Submitted, got ${w2.status}`
    );
  }
  if (w2.revisionCount < 1) {
    throw new LifecycleTxError(
      "TX2 verify",
      sigs.submitWorkUnit,
      `expected revisionCount >= 1, got ${w2.revisionCount}`
    );
  }
  if (escrowAfter !== PFT_ESCROW_RAW) {
    throw new LifecycleTxError(
      "TX2 verify",
      sigs.submitWorkUnit,
      `escrow moved: ${escrowAfter}`
    );
  }

  const revisionNumber = w2.revisionCount;
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
    revisionNumber,
    deliveryNote:
      "N4 revised Devnet E2E work submission after employer requestRevision.",
    links: [{ url: REVISED_SUBMISSION_URI, label: "N4 revised deliverable" }],
    onChainSubmissionUri: REVISED_SUBMISSION_URI,
    transactionSignature: sigs.submitWorkUnit,
  };

  const firstPost = await apiJson<{
    submission?: { id?: string; revisionNumber?: number };
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
      `revised submissions POST failed (${firstPost.status}): ${JSON.stringify(firstPost.json)}`
    );
  }
  if (firstPost.json.created !== true) {
    throw new Error(
      `expected created:true on first revised persist, got ${String(firstPost.json.created)}`
    );
  }
  const submissionId = firstPost.json.submission?.id;
  if (!submissionId) {
    throw new Error("revised submissions POST missing submission.id");
  }

  // --- Employer notifications ---
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
  }>(input.apiBaseUrl, "/api/notifications?limit=50", {
    method: "GET",
    origin: input.appOrigin,
    cookie: empSession.cookie,
  });
  if (employerNotes.status !== 200 || !employerNotes.json.notifications) {
    throw new Error(
      `employer notifications GET failed (${employerNotes.status})`
    );
  }

  const matching = employerNotes.json.notifications.filter((n) => {
    if (n.type !== "revised_work_submitted") return false;
    if (n.contractAddress !== contractAddress) return false;
    if (n.href !== `/contracts/${contractAddress}`) return false;
    const p = n.payload ?? {};
    return (
      p.workUnitIndex === 0 &&
      typeof p.revisionNumber === "number" &&
      (p.revisionNumber as number) >= 1 &&
      p.transactionSignature === sigs.submitWorkUnit &&
      p.submissionId === submissionId
    );
  });
  if (matching.length !== 1) {
    throw new Error(
      `expected exactly 1 revised_work_submitted for TX2, got ${matching.length}: ${JSON.stringify(
        employerNotes.json.notifications.filter(
          (n) => n.contractAddress === contractAddress
        )
      )}`
    );
  }
  const note = matching[0]!;
  const expectedUniqueKey = workSubmissionUniqueKey(
    "revised_work_submitted",
    sigs.submitWorkUnit,
    EXPECTED_EMPLOYER
  );

  const originalWorkSubmitted = employerNotes.json.notifications.filter(
    (n) =>
      n.type === "work_submitted" && n.contractAddress === contractAddress
  );
  if (originalWorkSubmitted.length < 1) {
    throw new Error("original work_submitted notification missing");
  }

  const freNotes = await apiJson<{
    notifications?: Array<{ type: string; contractAddress: string | null }>;
  }>(input.apiBaseUrl, "/api/notifications?limit=50", {
    method: "GET",
    origin: input.appOrigin,
    cookie: freSession.cookie,
  });
  if (freNotes.status !== 200 || !freNotes.json.notifications) {
    throw new Error(`freelancer notifications GET failed (${freNotes.status})`);
  }
  const freRevised = freNotes.json.notifications.filter(
    (n) =>
      n.type === "revised_work_submitted" &&
      n.contractAddress === contractAddress
  );
  if (freRevised.length !== 0) {
    throw new Error(
      `freelancer received revised_work_submitted (count=${freRevised.length})`
    );
  }
  const trialNotificationCount = [
    ...employerNotes.json.notifications,
    ...freNotes.json.notifications,
  ].filter(
    (n) =>
      n.contractAddress === contractAddress &&
      (n.type.includes("trial") || n.type === "trial_submitted")
  ).length;
  if (trialNotificationCount !== 0) {
    throw new Error(`unexpected trial notifications: ${trialNotificationCount}`);
  }

  // --- Idempotency ---
  const retryPost = await apiJson<{
    submission?: { id?: string };
    created?: boolean;
  }>(input.apiBaseUrl, `/api/contracts/${contractAddress}/submissions`, {
    method: "POST",
    origin: input.appOrigin,
    cookie: freSession.cookie,
    body: submissionBody,
  });
  if (retryPost.status !== 200 && retryPost.status !== 201) {
    throw new Error(
      `idempotent revised POST failed (${retryPost.status}): ${JSON.stringify(retryPost.json)}`
    );
  }
  if (retryPost.json.created !== false) {
    throw new Error(
      `expected created:false on retry, got ${String(retryPost.json.created)}`
    );
  }
  if (retryPost.json.submission?.id !== submissionId) {
    throw new Error("idempotent retry changed submission id");
  }

  const employerNotes2 = await apiJson<{
    notifications?: Array<{
      type: string;
      contractAddress: string | null;
      payload: Record<string, unknown> | null;
    }>;
  }>(input.apiBaseUrl, "/api/notifications?limit=50", {
    method: "GET",
    origin: input.appOrigin,
    cookie: empSession.cookie,
  });
  const matching2 = (employerNotes2.json.notifications ?? []).filter((n) => {
    if (n.type !== "revised_work_submitted") return false;
    if (n.contractAddress !== contractAddress) return false;
    return (n.payload ?? {}).transactionSignature === sigs.submitWorkUnit;
  });
  if (matching2.length !== 1) {
    throw new Error(
      `after idempotent retry expected 1 revised_work_submitted, got ${matching2.length}`
    );
  }

  return {
    contractAddress,
    workUnitAddress: workUnitPk.toBase58(),
    preflight: {
      now,
      submittedAt: w0.submittedAt,
      actionDeadline: w0.actionDeadline,
      secondsUntilDeadline: w0.actionDeadline - now,
      revisionWindowValid: true,
      escrowBefore: escrowBefore.toString(),
    },
    signatures: sigs,
    afterTx1: {
      contractStatus: c1.status,
      workUnitStatus: w1.status,
      revisionCount: w1.revisionCount,
    },
    afterTx2: {
      contractStatus: c2.status,
      workUnitStatus: w2.status,
      revisionCount: w2.revisionCount,
      escrowAfter: escrowAfter.toString(),
    },
    submission: {
      firstStatus: firstPost.status,
      firstCreated: true,
      submissionId,
      revisionNumber,
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
      originalWorkSubmittedStillPresent: originalWorkSubmitted.length >= 1,
    },
    negatives: {
      freelancerRevisedCount: freRevised.length,
      trialNotificationCount,
    },
    premiflowTransactionCount: 2,
  };
}
