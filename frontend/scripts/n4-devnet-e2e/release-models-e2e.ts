/**
 * Release smoke E2E for Streaming and Hourly on Devnet (test-only).
 * Usage: tsx release-models-e2e.ts <streaming|hourly|milestone-check>
 *
 * Every transaction is built by StreamPayV2Client. The signing wallet
 * simulates the exact transaction immediately before signing; a failed
 * simulation aborts before anything is sent. Never prints key material.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type Keypair,
} from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";

import {
  StreamPayV2Client,
  deriveContractEscrowPda,
  deriveFreelancerDestinationAta,
  deriveHourlySessionPda,
  deriveHourlyStatePda,
  fetchContract,
  fetchHourlySession,
  fetchHourlyState,
  getStreamPayV2Program,
  STREAMPAY_PROGRAM_ID,
  type ContractView,
} from "@/lib/streampay-v2";
import type {
  CreateContractRequest,
  CreateHourlyContractRequest,
} from "@/lib/streampay-v2/types";

import {
  EXPECTED_DEVNET_GENESIS,
  EXPECTED_EMPLOYER,
  EXPECTED_FREELANCER,
  EXPECTED_MINT,
  EXPECTED_PROGRAM,
  expectedResolver,
  repoRootFromScript,
} from "./config";
import { keypairToAnchorWallet } from "./keypair-wallet";
import { loadN4E2eKeypairs } from "./load-keypairs";
import { runSafetyGates } from "./safety";
import { PRESERVED_CONTRACT } from "./revise-existing";

const PHASE = process.argv[2];
const METADATA_URI = "https://premiflow.app/e2e/release-smoke-metadata";
const WORK_LOG_URI = "https://premiflow.app/e2e/release-smoke-hourly-log";

class StopError extends Error {}

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new StopError(`CHECK FAILED: ${msg}`);
}

function rpcUrl(): string {
  if (process.env.SOLANA_RPC_URL) return process.env.SOLANA_RPC_URL;
  const envPath = path.join(repoRootFromScript(), "frontend", ".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t.startsWith("SOLANA_RPC_URL=")) continue;
    let v = t.slice("SOLANA_RPC_URL=".length).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  throw new StopError("SOLANA_RPC_URL missing");
}

type Ledger = {
  signed: number;
  budget: number;
  simulations: Array<{ step: string; err: unknown; unitsConsumed?: number }>;
  step: string;
};

async function simulateExact(
  connection: Connection,
  tx: Transaction | VersionedTransaction
): Promise<{ err: unknown; logs: string[] | null; unitsConsumed?: number }> {
  const bytes =
    tx instanceof VersionedTransaction
      ? Buffer.from(tx.serialize())
      : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const res = await (connection as unknown as {
    _rpcRequest: (
      m: string,
      a: unknown[]
    ) => Promise<{ result?: { value: unknown }; error?: unknown }>;
  })._rpcRequest("simulateTransaction", [
    bytes.toString("base64"),
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed" },
  ]);
  if (res.error) throw new StopError(`simulate RPC error: ${JSON.stringify(res.error)}`);
  return res.result!.value as { err: unknown; logs: string[] | null; unitsConsumed?: number };
}

/** Wallet that simulates the exact tx and enforces the phase budget before signing. */
function simulatingWallet(
  connection: Connection,
  keypair: Keypair,
  ledger: Ledger
): AnchorWallet {
  const inner = keypairToAnchorWallet(keypair);
  const wallet: AnchorWallet = {
    publicKey: keypair.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      const sim = await simulateExact(connection, tx);
      ledger.simulations.push({ step: ledger.step, err: sim.err, unitsConsumed: sim.unitsConsumed });
      if (sim.err !== null) {
        const e = new StopError(`${ledger.step} simulation failed: ${JSON.stringify(sim.err)}`);
        (e as unknown as { logs?: string[] }).logs = sim.logs ?? undefined;
        throw e;
      }
      check(ledger.signed < ledger.budget, `${ledger.step}: phase tx budget ${ledger.budget} reached`);
      ledger.signed += 1;
      return inner.signTransaction(tx);
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      const out: T[] = [];
      for (const tx of txs) out.push(await wallet.signTransaction(tx));
      return out;
    },
  };
  return wallet;
}

async function chainNow(connection: Connection): Promise<number> {
  const slot = await connection.getSlot("confirmed");
  return (await connection.getBlockTime(slot)) ?? 0;
}

async function waitForChainTime(connection: Connection, target: number): Promise<number> {
  for (;;) {
    const now = await chainNow(connection);
    if (now >= target) return now;
    await new Promise((r) => setTimeout(r, Math.min(5_000, Math.max(1_000, (target - now) * 1_000))));
  }
}

async function tokenAmount(connection: Connection, account: PublicKey): Promise<bigint | null> {
  const info = await connection.getAccountInfo(account, "confirmed");
  if (!info) return null;
  return BigInt((await connection.getTokenAccountBalance(account, "confirmed")).value.amount);
}

async function txBlockTime(connection: Connection, sig: string): Promise<number> {
  const tx = await connection.getTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  check(tx && tx.meta && tx.meta.err === null, `tx ${sig} confirmed without error`);
  return tx.blockTime ?? 0;
}

function snap(c: ContractView) {
  return {
    status: c.status,
    mode: c.paymentMode,
    total: c.totalAmount.toString(),
    main: c.mainAmount.toString(),
    released: c.releasedAmount.toString(),
    streamReleased: c.streamReleasedAmount.toString(),
    withdrawn: c.withdrawnAmount.toString(),
    refunded: c.refundedAmount.toString(),
    freelancerSettlement: c.freelancerSettlementAmount.toString(),
    employerRefundable: c.employerRefundableAmount.toString(),
    startTime: c.startTime,
    endTime: c.endTime,
    completedAt: c.completedAt,
    terminatedAt: c.terminatedAt,
  };
}

function assertInvariants(c: ContractView, label: string) {
  check(c.withdrawnAmount <= c.releasedAmount, `${label}: withdrawn <= released`);
  check(c.releasedAmount + c.refundedAmount <= c.totalAmount, `${label}: released+refunded <= total`);
}

async function setup(ledger: Ledger) {
  const url = rpcUrl();
  const gate = await runSafetyGates({ rpcUrl: url });
  check(gate.genesis === EXPECTED_DEVNET_GENESIS, "genesis devnet");
  check(STREAMPAY_PROGRAM_ID.toBase58() === EXPECTED_PROGRAM, "program id");
  const connection = new Connection(url, "confirmed");
  const programInfo = await connection.getAccountInfo(STREAMPAY_PROGRAM_ID, "confirmed");
  check(programInfo?.executable === true, "program executable");
  const keys = loadN4E2eKeypairs();
  check(keys.employer.publicKey.toBase58() === EXPECTED_EMPLOYER, "employer pubkey");
  check(keys.freelancer.publicKey.toBase58() === EXPECTED_FREELANCER, "freelancer pubkey");
  const employer = new StreamPayV2Client(
    getStreamPayV2Program(connection, simulatingWallet(connection, keys.employer, ledger))
  );
  const freelancer = new StreamPayV2Client(
    getStreamPayV2Program(connection, simulatingWallet(connection, keys.freelancer, ledger))
  );
  const mint = new PublicKey(EXPECTED_MINT);
  const employerAta = deriveFreelancerDestinationAta(keys.employer.publicKey, mint);
  const freelancerAta = deriveFreelancerDestinationAta(keys.freelancer.publicKey, mint);
  const balances = {
    employerSol: await connection.getBalance(keys.employer.publicKey, "confirmed"),
    freelancerSol: await connection.getBalance(keys.freelancer.publicKey, "confirmed"),
    employerPft: (await tokenAmount(connection, employerAta)) ?? 0n,
    freelancerPft: (await tokenAmount(connection, freelancerAta)) ?? 0n,
  };
  return { connection, keys, employer, freelancer, mint, employerAta, freelancerAta, balances, gate };
}

async function send(
  ledger: Ledger,
  step: string,
  sigs: Record<string, string>,
  fn: () => Promise<{ signature: string }>
): Promise<string> {
  ledger.step = step;
  const before = ledger.signed;
  try {
    const r = await fn();
    sigs[step] = r.signature;
    return r.signature;
  } catch (err) {
    const sig = (err as { signature?: string })?.signature;
    if (ledger.signed > before) {
      throw new StopError(
        `${step} was signed/sent but client reported failure (${err instanceof Error ? err.message : String(err)}). Signature to check on-chain: ${sig ?? "unknown"}. Not retrying.`
      );
    }
    throw err;
  }
}

async function runStreaming(report: Record<string, unknown>, ledger: Ledger) {
  const s = await setup(ledger);
  const sigs: Record<string, string> = {};
  report.initialBalances = {
    employerSol: s.balances.employerSol,
    freelancerSol: s.balances.freelancerSol,
    employerPft: s.balances.employerPft.toString(),
    freelancerPft: s.balances.freelancerPft.toString(),
  };
  report.signatures = sigs;
  const AMOUNT = 500_000n;
  check(s.balances.employerPft >= AMOUNT, "employer PFT >= 0.5");
  check(s.balances.employerSol >= 15_000_000, "employer SOL >= 0.015");

  const nowSec = await chainNow(s.connection);
  const request: CreateContractRequest = {
    contractId: BigInt(nowSec),
    paymentMode: "Streaming",
    startMode: "OnActivation",
    totalAmount: AMOUNT,
    acceptanceDeadline: nowSec + 1_800,
    scheduledStartTime: 0,
    durationSeconds: 60,
    checkpointInterval: 60,
    reviewDuration: 10,
    activationReviewDuration: 600,
    maxRevisions: 0,
    trialAmount: 0n,
    resolver: new PublicKey(expectedResolver()),
    metadataUri: METADATA_URI,
    metadataHash: new Uint8Array(32),
  };
  report.terms = { amount: AMOUNT.toString(), durationSeconds: 60, checkpointInterval: 60, reviewDuration: 10 };

  // S1
  let contractPk!: PublicKey;
  await send(ledger, "S1 createContract", sigs, async () => {
    const r = await s.employer.createContract({ request, freelancer: s.keys.freelancer.publicKey, tokenMint: s.mint });
    contractPk = r.contract!;
    return r;
  });
  const escrow = deriveContractEscrowPda(contractPk, STREAMPAY_PROGRAM_ID).address;
  report.contract = contractPk.toBase58();
  report.escrow = escrow.toBase58();
  let c = await fetchContract(s.employer.program, contractPk);
  check(c.status === "PendingAcceptance", `S1 PendingAcceptance (got ${c.status})`);
  check(c.paymentMode === "Streaming", "S1 Streaming");
  check(c.totalAmount === AMOUNT && c.mainAmount === AMOUNT, "S1 amounts");
  check((await tokenAmount(s.connection, escrow)) === AMOUNT, "S1 escrow funded");
  check(
    (await tokenAmount(s.connection, s.employerAta)) === s.balances.employerPft - AMOUNT,
    "S1 employer PFT debited exactly"
  );

  // S2
  await send(ledger, "S2 acceptContract", sigs, () => s.freelancer.acceptContract(contractPk));
  c = await fetchContract(s.employer.program, contractPk);
  check(c.status === "PendingEmployerApproval", `S2 PendingEmployerApproval (got ${c.status})`);

  // S3
  await send(ledger, "S3 approveActivation", sigs, () => s.employer.approveActivation(contractPk));
  c = await fetchContract(s.employer.program, contractPk);
  check(c.status === "Active", `S3 Active (got ${c.status})`);
  check(c.startTime > 0 && c.endTime === c.startTime + 60, "S3 start/end = +60s");
  const activeSnap = snap(c);

  // S4 mid-stream accrual
  await waitForChainTime(s.connection, c.startTime + 30);
  const s4 = await send(ledger, "S4 releaseStreamAccrual", sigs, () =>
    s.employer.releaseStreamAccrual(contractPk)
  );
  const s4Time = await txBlockTime(s.connection, s4);
  c = await fetchContract(s.employer.program, contractPk);
  const elapsed = BigInt(Math.min(Math.max(s4Time - c.startTime, 0), 60));
  const expectedAccrual = (AMOUNT * elapsed) / 60n;
  check(c.status === "Active", "S4 still Active");
  check(c.streamReleasedAmount > 0n && c.streamReleasedAmount < AMOUNT, "S4 partial accrual");
  check(c.releasedAmount === c.streamReleasedAmount, "S4 released == streamReleased");
  const accrualDelta = c.streamReleasedAmount - expectedAccrual;
  check(accrualDelta >= -(AMOUNT / 60n) && accrualDelta <= AMOUNT / 60n, "S4 accrual matches floor(main*elapsed/duration) within 1s of block-time skew");
  check((await tokenAmount(s.connection, escrow)) === AMOUNT, "S4 escrow unchanged");
  assertInvariants(c, "S4");
  const afterS4 = { ...snap(c), txBlockTime: s4Time, elapsedSeconds: Number(elapsed), expectedAccrual: expectedAccrual.toString() };

  // S5 complete after end
  await waitForChainTime(s.connection, c.endTime + 2);
  await send(ledger, "S5 completeContract", sigs, () => s.employer.completeContract(contractPk));
  c = await fetchContract(s.employer.program, contractPk);
  check(c.status === "Completed", `S5 Completed (got ${c.status})`);
  check(c.streamReleasedAmount === AMOUNT && c.releasedAmount === AMOUNT, "S5 fully materialized");
  check(c.freelancerSettlementAmount === AMOUNT && c.employerRefundableAmount === 0n, "S5 settlement");
  check((await tokenAmount(s.connection, escrow)) === AMOUNT, "S5 escrow unchanged");
  assertInvariants(c, "S5");
  const afterS5 = snap(c);

  // S6 withdraw everything
  const fBefore = (await tokenAmount(s.connection, s.freelancerAta)) ?? 0n;
  await send(ledger, "S6 withdrawFreelancer", sigs, () => s.freelancer.withdrawFreelancer({ contract: contractPk }));
  c = await fetchContract(s.employer.program, contractPk);
  const fAfter = (await tokenAmount(s.connection, s.freelancerAta)) ?? 0n;
  const escrowFinal = await tokenAmount(s.connection, escrow);
  check(c.withdrawnAmount === AMOUNT, "S6 withdrawn == total");
  check(fAfter - fBefore === AMOUNT, "S6 freelancer received total");
  check(escrowFinal === 0n, "S6 escrow drained");
  check(c.status === "Completed", "S6 still Completed");
  assertInvariants(c, "S6");

  report.states = { active: activeSnap, afterS4, afterS5, final: snap(c) };
  report.freelancerPft = { before: fBefore.toString(), after: fAfter.toString() };
  report.escrowFinal = escrowFinal?.toString();
  report.employerPftFinal = ((await tokenAmount(s.connection, s.employerAta)) ?? 0n).toString();
  report.result = "STREAMING_PASS";
}

async function runHourly(report: Record<string, unknown>, ledger: Ledger) {
  const s = await setup(ledger);
  const sigs: Record<string, string> = {};
  report.signatures = sigs;
  report.initialBalances = {
    employerSol: s.balances.employerSol,
    freelancerSol: s.balances.freelancerSol,
    employerPft: s.balances.employerPft.toString(),
    freelancerPft: s.balances.freelancerPft.toString(),
  };
  const RATE = 18_000_000n;
  const AUTH = 60n;
  const MAIN = (RATE * AUTH) / 3_600n;
  check(MAIN === 300_000n, "hourly main = 0.3 PFT");
  check(s.balances.employerPft >= MAIN, "employer PFT >= 0.3");
  check(s.balances.employerSol >= 15_000_000, "employer SOL >= 0.015");
  check(s.balances.freelancerSol >= 8_000_000, "freelancer SOL >= 0.008");

  const nowSec = await chainNow(s.connection);
  const request: CreateHourlyContractRequest = {
    contractId: BigInt(nowSec) + 7n,
    hourlyRate: RATE,
    authorizedSeconds: AUTH,
    acceptanceDeadline: nowSec + 1_800,
    durationSeconds: 1_800,
    reviewDuration: 60,
    activationReviewDuration: 600,
    maxRevisions: 0,
    trialAmount: 0n,
    resolver: new PublicKey(expectedResolver()),
    metadataUri: METADATA_URI,
    metadataHash: new Uint8Array(32),
  };
  report.terms = { hourlyRate: RATE.toString(), authorizedSeconds: 60, main: MAIN.toString(), durationSeconds: 1_800 };

  let contractPk!: PublicKey;
  await send(ledger, "H1 createHourlyContract", sigs, async () => {
    const r = await s.employer.createHourlyContract({ request, freelancer: s.keys.freelancer.publicKey, tokenMint: s.mint });
    contractPk = r.contract!;
    return r;
  });
  const escrow = deriveContractEscrowPda(contractPk, STREAMPAY_PROGRAM_ID).address;
  const statePda = deriveHourlyStatePda(contractPk, STREAMPAY_PROGRAM_ID).address;
  report.contract = contractPk.toBase58();
  report.hourlyState = statePda.toBase58();
  let c = await fetchContract(s.employer.program, contractPk);
  check(c.paymentMode === "Hourly", "H1 Hourly");
  check(c.status === "PendingAcceptance", `H1 PendingAcceptance (got ${c.status})`);
  check(c.totalAmount === MAIN && c.mainAmount === MAIN, "H1 amounts");
  check((await tokenAmount(s.connection, escrow)) === MAIN, "H1 escrow funded");
  let hs = await fetchHourlyState(s.employer.program, statePda);
  check(hs.hourlyRate === RATE && hs.authorizedSeconds === AUTH && hs.sessionCount === 0, "H1 hourly state");

  await send(ledger, "H2 acceptContract", sigs, () => s.freelancer.acceptContract(contractPk));
  c = await fetchContract(s.employer.program, contractPk);
  check(c.status === "PendingEmployerApproval", `H2 PendingEmployerApproval (got ${c.status})`);

  await send(ledger, "H3 approveActivation", sigs, () => s.employer.approveActivation(contractPk));
  c = await fetchContract(s.employer.program, contractPk);
  check(c.status === "Active" && c.startTime > 0, `H3 Active (got ${c.status})`);

  await waitForChainTime(s.connection, c.startTime);
  await send(ledger, "H4 startHourlySession", sigs, () => s.freelancer.startHourlySession(contractPk));
  hs = await fetchHourlyState(s.employer.program, statePda);
  check(hs.sessionCount === 1 && hs.activeSessionIndex === 0, "H4 session 0 open");
  const sessionPda = deriveHourlySessionPda(contractPk, 0, STREAMPAY_PROGRAM_ID).address;
  let sess = await fetchHourlySession(s.employer.program, sessionPda);
  check(sess.status === "Open" && sess.startedAt > 0, `H4 session Open (got ${sess.status})`);
  report.session = sessionPda.toBase58();

  await waitForChainTime(s.connection, sess.startedAt + 65);
  await send(ledger, "H5 stopHourlySession", sigs, () =>
    s.freelancer.stopHourlySession({ contract: contractPk, workLogUri: WORK_LOG_URI, workLogHash: new Uint8Array(32) })
  );
  sess = await fetchHourlySession(s.employer.program, sessionPda);
  hs = await fetchHourlyState(s.employer.program, statePda);
  c = await fetchContract(s.employer.program, contractPk);
  check(sess.status === "Recorded", `H5 session Recorded (got ${sess.status})`);
  check(sess.stoppedAt >= sess.startedAt + 60, "H5 >= 60s elapsed");
  check(sess.durationSeconds === AUTH, `H5 credited 60s (got ${sess.durationSeconds})`);
  check(hs.approvedSeconds === AUTH, "H5 approvedSeconds = 60");
  check(c.releasedAmount === MAIN, `H5 released = floor(rate*60/3600) (got ${c.releasedAmount})`);
  check((await tokenAmount(s.connection, escrow)) === MAIN, "H5 escrow unchanged");
  assertInvariants(c, "H5");
  const afterStop = snap(c);
  const sessionSnap = {
    status: sess.status,
    startedAt: sess.startedAt,
    stoppedAt: sess.stoppedAt,
    rawElapsed: sess.stoppedAt - sess.startedAt,
    creditedSeconds: sess.durationSeconds.toString(),
  };

  await send(ledger, "H6 endHourlyContract", sigs, () => s.employer.endHourlyContract(contractPk));
  c = await fetchContract(s.employer.program, contractPk);
  check(c.freelancerSettlementAmount === MAIN && c.employerRefundableAmount === 0n, "H6 settlement all to freelancer");
  check(c.status !== "Active", `H6 no longer Active (got ${c.status})`);
  assertInvariants(c, "H6");
  const afterEnd = snap(c);

  const fBefore = (await tokenAmount(s.connection, s.freelancerAta)) ?? 0n;
  await send(ledger, "H7 withdrawFreelancer", sigs, () => s.freelancer.withdrawFreelancer({ contract: contractPk }));
  c = await fetchContract(s.employer.program, contractPk);
  const fAfter = (await tokenAmount(s.connection, s.freelancerAta)) ?? 0n;
  const escrowFinal = await tokenAmount(s.connection, escrow);
  check(c.withdrawnAmount === MAIN, "H7 withdrawn = main");
  check(fAfter - fBefore === MAIN, "H7 freelancer received main");
  check(escrowFinal === 0n, "H7 escrow drained");
  assertInvariants(c, "H7");

  report.states = { afterStop, session: sessionSnap, afterEnd, final: snap(c) };
  report.freelancerPft = { before: fBefore.toString(), after: fAfter.toString() };
  report.escrowFinal = escrowFinal?.toString();
  report.employerPftFinal = ((await tokenAmount(s.connection, s.employerAta)) ?? 0n).toString();
  report.result = "HOURLY_PASS";
}

async function runMilestoneCheck(report: Record<string, unknown>) {
  const connection = new Connection(rpcUrl(), "confirmed");
  check((await connection.getGenesisHash()) === EXPECTED_DEVNET_GENESIS, "genesis devnet");
  const keys = loadN4E2eKeypairs();
  const program = getStreamPayV2Program(connection, keypairToAnchorWallet(keys.employer));
  const c = await fetchContract(program, new PublicKey(PRESERVED_CONTRACT));
  const escrow = deriveContractEscrowPda(c.address, STREAMPAY_PROGRAM_ID).address;
  report.milestone = { ...snap(c), escrow: (await tokenAmount(connection, escrow))?.toString() };
  report.result = c.status === "Completed" ? "MILESTONE_ALREADY_COMPLETED" : `MILESTONE_${c.status}`;
}

async function main() {
  const budget = PHASE === "streaming" ? 6 : PHASE === "hourly" ? 7 : 0;
  const ledger: Ledger = { signed: 0, budget, simulations: [], step: "" };
  const report: Record<string, unknown> = { phase: PHASE };
  try {
    if (PHASE === "streaming") await runStreaming(report, ledger);
    else if (PHASE === "hourly") await runHourly(report, ledger);
    else if (PHASE === "milestone-check") await runMilestoneCheck(report);
    else throw new StopError("usage: <streaming|hourly|milestone-check>");
  } catch (err) {
    report.result = "STOPPED";
    report.failedStep = ledger.step;
    report.error = err instanceof Error ? err.message : String(err);
    const logs = (err as { logs?: string[] })?.logs;
    if (Array.isArray(logs)) report.errorLogs = logs.slice(-20);
    process.exitCode = 1;
  } finally {
    report.transactionsSent = ledger.signed;
    report.simulations = ledger.simulations;
    console.log(JSON.stringify(report, null, 2));
  }
}

void main();
