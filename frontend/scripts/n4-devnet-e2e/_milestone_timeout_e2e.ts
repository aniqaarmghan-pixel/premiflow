/**
 * Preserved Milestone review-timeout Devnet E2E (test-only).
 * Default: preflight + simulations only. `--execute` sends at most 3 txs.
 * Never prints secret key material.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

import {
  StreamPayV2Client,
  deriveContractEscrowPda,
  deriveFreelancerDestinationAta,
  fetchContract,
  fetchWorkUnit,
  getStreamPayV2Program,
  STREAMPAY_PROGRAM_ID,
  type ContractView,
  type WorkUnitView,
} from "@/lib/streampay-v2";
import { withdrawFreelancerAccounts } from "@/lib/streampay-v2/instructions";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  freelancerWithdrawAtaCreateInstruction,
} from "@/lib/streampay-v2/tokens";

import {
  EXPECTED_DEVNET_GENESIS,
  EXPECTED_EMPLOYER,
  EXPECTED_FREELANCER,
  EXPECTED_MINT,
  EXPECTED_PROGRAM,
  repoRootFromScript,
} from "./config";
import { keypairToAnchorWallet } from "./keypair-wallet";
import { loadN4E2eKeypairs } from "./load-keypairs";
import { runSafetyGates } from "./safety";
import { PRESERVED_CONTRACT, PRESERVED_WORK_UNIT } from "./revise-existing";

const EXECUTE = process.argv.includes("--execute");
const EXPECTED_AMOUNT = 1_000_000n;

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

async function simulate(
  connection: Connection,
  payer: PublicKey,
  ixs: TransactionInstruction[]
): Promise<{ err: unknown; logs: string[] | null; unitsConsumed?: number }> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(...ixs);
  const res = await (connection as unknown as {
    _rpcRequest: (
      m: string,
      a: unknown[]
    ) => Promise<{ result?: { value: unknown }; error?: unknown }>;
  })._rpcRequest("simulateTransaction", [
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" },
  ]);
  if (res.error) throw new StopError(`simulate RPC error: ${JSON.stringify(res.error)}`);
  return res.result!.value as { err: unknown; logs: string[] | null; unitsConsumed?: number };
}

async function tokenAmount(connection: Connection, account: PublicKey): Promise<bigint | null> {
  const info = await connection.getAccountInfo(account, "confirmed");
  if (!info) return null;
  const bal = await connection.getTokenAccountBalance(account, "confirmed");
  return BigInt(bal.value.amount);
}

function contractSnapshot(c: ContractView) {
  return {
    status: c.status,
    paymentMode: c.paymentMode,
    total: c.totalAmount.toString(),
    main: c.mainAmount.toString(),
    allocated: c.allocatedAmount.toString(),
    released: c.releasedAmount.toString(),
    withdrawn: c.withdrawnAmount.toString(),
    refunded: c.refundedAmount.toString(),
    freelancerSettlement: c.freelancerSettlementAmount.toString(),
    employerRefundable: c.employerRefundableAmount.toString(),
    contested: c.contestedAmount.toString(),
    workUnitCount: c.workUnitCount,
    releasedUnitCount: c.releasedUnitCount,
    voidedUnitCount: c.voidedUnitCount,
    openReviewCount: c.openReviewCount,
    completedAt: c.completedAt,
  };
}

function unitSnapshot(u: WorkUnitView) {
  return {
    status: u.status,
    kind: u.kind,
    amount: u.amount.toString(),
    submittedAt: u.submittedAt,
    actionDeadline: u.actionDeadline,
    releasedAt: u.releasedAt,
    releaseTrigger: u.releaseTrigger,
    revisionCount: u.revisionCount,
    hasSubmissionUri: u.submissionUri.length > 0,
  };
}

async function main() {
  const report: Record<string, unknown> = { mode: EXECUTE ? "execute" : "preflight-only" };
  const sent: string[] = [];
  const url = rpcUrl();

  try {
    // ---------------- Preflight ----------------
    const gate = await runSafetyGates({ rpcUrl: url });
    check(gate.genesis === EXPECTED_DEVNET_GENESIS, "genesis is devnet");
    check(STREAMPAY_PROGRAM_ID.toBase58() === EXPECTED_PROGRAM, "client program id");

    const connection = new Connection(url, "confirmed");
    const programInfo = await connection.getAccountInfo(STREAMPAY_PROGRAM_ID, "confirmed");
    check(programInfo?.executable === true, "program account is executable");

    const keys = loadN4E2eKeypairs();
    check(keys.employer.publicKey.toBase58() === EXPECTED_EMPLOYER, "employer pubkey");
    check(keys.freelancer.publicKey.toBase58() === EXPECTED_FREELANCER, "freelancer pubkey");
    const employerWallet = keypairToAnchorWallet(keys.employer);
    const freelancerWallet = keypairToAnchorWallet(keys.freelancer);
    const employerProgram = getStreamPayV2Program(connection, employerWallet);
    const freelancerProgram = getStreamPayV2Program(connection, freelancerWallet);
    const employerClient = new StreamPayV2Client(employerProgram);
    const freelancerClient = new StreamPayV2Client(freelancerProgram);

    const contractPk = new PublicKey(PRESERVED_CONTRACT);
    const unitPk = new PublicKey(PRESERVED_WORK_UNIT);
    check(contractPk.toBase58() === "GzbsRoX6D1seSwrgAgtxbTdEf9FAR2qky7XmTPGiexas", "target contract");

    const contractInfo = await connection.getAccountInfo(contractPk, "confirmed");
    const unitInfo = await connection.getAccountInfo(unitPk, "confirmed");
    check(contractInfo?.owner.equals(STREAMPAY_PROGRAM_ID), "contract owned by program");
    check(unitInfo?.owner.equals(STREAMPAY_PROGRAM_ID), "work unit owned by program");

    const c0 = await fetchContract(employerProgram, contractPk);
    const u0 = await fetchWorkUnit(employerProgram, unitPk);
    const slot = await connection.getSlot("confirmed");
    const chainNow = (await connection.getBlockTime(slot)) ?? 0;

    check(c0.employer.toBase58() === EXPECTED_EMPLOYER, "contract employer");
    check(c0.freelancer.toBase58() === EXPECTED_FREELANCER, "contract freelancer");
    check(c0.tokenMint.toBase58() === EXPECTED_MINT, "contract mint");
    check(c0.status === "Active", `contract Active (got ${c0.status})`);
    check(c0.paymentMode === "Milestone", `mode Milestone (got ${c0.paymentMode})`);
    check(c0.workUnitCount === 1, "workUnitCount 1");
    check(c0.totalAmount === EXPECTED_AMOUNT && c0.mainAmount === EXPECTED_AMOUNT, "amounts 1 PFT");
    check(c0.releasedAmount === 0n && c0.withdrawnAmount === 0n && c0.refundedAmount === 0n, "nothing released/withdrawn/refunded yet");
    check(u0.contract.equals(contractPk), "unit belongs to contract");
    check(u0.kind === "Milestone", "unit kind Milestone");
    check(u0.status === "Submitted", `unit Submitted (got ${u0.status})`);
    check(u0.submissionUri.length > 0, "submission uri present");
    check(u0.amount === EXPECTED_AMOUNT, "unit amount 1 PFT");
    check(chainNow >= u0.actionDeadline, `review deadline passed (chain ${chainNow} vs ${u0.actionDeadline})`);

    const escrow = deriveContractEscrowPda(contractPk, STREAMPAY_PROGRAM_ID).address;
    const escrow0 = await tokenAmount(connection, escrow);
    check(escrow0 === EXPECTED_AMOUNT, `escrow holds 1 PFT (got ${escrow0})`);

    const freelancerAta = deriveFreelancerDestinationAta(keys.freelancer.publicKey, c0.tokenMint);
    const ataCreate = freelancerWithdrawAtaCreateInstruction({
      payer: keys.freelancer.publicKey,
      freelancer: keys.freelancer.publicKey,
      mint: c0.tokenMint,
      destination: freelancerAta,
    });
    check(ataCreate, "ATA create instruction built for derived destination");
    check(ataCreate.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID), "ATA program");
    check(ataCreate.data[0] === 1, "ATA create is idempotent");
    check(ataCreate.keys[0].pubkey.equals(keys.freelancer.publicKey) && ataCreate.keys[0].isSigner, "ATA payer = freelancer signer");
    check(ataCreate.keys[1].pubkey.equals(freelancerAta), "ATA address");
    check(ataCreate.keys[2].pubkey.equals(keys.freelancer.publicKey), "ATA owner = freelancer");
    check(ataCreate.keys[3].pubkey.equals(c0.tokenMint), "ATA mint = contract mint");
    check(ataCreate.keys[5].pubkey.equals(TOKEN_PROGRAM_ID), "ATA classic SPL Token program");
    const ataBefore = await tokenAmount(connection, freelancerAta);

    const employerSol0 = await connection.getBalance(keys.employer.publicKey, "confirmed");
    const freelancerSol0 = await connection.getBalance(keys.freelancer.publicKey, "confirmed");
    const employerPft0 = await tokenAmount(
      connection,
      deriveFreelancerDestinationAta(keys.employer.publicKey, c0.tokenMint)
    );

    report.preflight = {
      cluster: "devnet",
      genesis: gate.genesis,
      program: STREAMPAY_PROGRAM_ID.toBase58(),
      programExecutable: true,
      contract: contractPk.toBase58(),
      workUnit: unitPk.toBase58(),
      employer: EXPECTED_EMPLOYER,
      freelancer: EXPECTED_FREELANCER,
      keypairsGitignored: true,
      chainNow,
      secondsPastDeadline: chainNow - u0.actionDeadline,
      contract0: contractSnapshot(c0),
      unit0: unitSnapshot(u0),
      escrow: escrow.toBase58(),
      escrow0: escrow0.toString(),
      freelancerAta: freelancerAta.toBase58(),
      freelancerAtaExistsBefore: ataBefore !== null,
      freelancerAtaBalanceBefore: ataBefore === null ? null : ataBefore.toString(),
      employerSol0,
      freelancerSol0,
      employerPft0: employerPft0?.toString() ?? null,
    };

    // ---------------- TX1 simulate ----------------
    const tx1Ix = await employerProgram.methods
      .finalizeReviewTimeout()
      .accountsPartial({ caller: keys.employer.publicKey, contract: contractPk, workUnit: unitPk })
      .instruction();
    const sim1 = await simulate(connection, keys.employer.publicKey, [tx1Ix]);
    report.tx1Simulation = { err: sim1.err, unitsConsumed: sim1.unitsConsumed };
    check(sim1.err === null, `TX1 simulation succeeded (${JSON.stringify(sim1.err)})`);

    if (!EXECUTE) {
      report.result = "PREFLIGHT_OK_NO_TX_SENT";
      return;
    }

    // ---------------- TX1 send ----------------
    const r1 = await employerClient.finalizeReviewTimeout({ contract: contractPk, workUnit: unitPk });
    sent.push(r1.signature);
    const st1 = await connection.getSignatureStatus(r1.signature, { searchTransactionHistory: true });
    check(st1.value && !st1.value.err, "TX1 confirmed without error");
    const c1 = await fetchContract(employerProgram, contractPk);
    const u1 = await fetchWorkUnit(employerProgram, unitPk);
    const escrow1 = await tokenAmount(connection, escrow);
    check(u1.status === "Released", `TX1 unit Released (got ${u1.status})`);
    check(u1.releaseTrigger === "ReviewTimeout", `TX1 trigger ReviewTimeout (got ${u1.releaseTrigger})`);
    check(u1.releasedAt > 0, "TX1 releasedAt set");
    check(c1.status === "Active", "TX1 contract still Active");
    check(c1.releasedAmount === EXPECTED_AMOUNT, `TX1 released 1 PFT (got ${c1.releasedAmount})`);
    check(c1.withdrawnAmount === 0n && c1.refundedAmount === 0n, "TX1 withdrawn/refunded unchanged");
    check(c1.releasedUnitCount === 1 && c1.openReviewCount === 0, "TX1 unit counters");
    check(escrow1 === EXPECTED_AMOUNT, `TX1 escrow unchanged (got ${escrow1})`);
    report.tx1 = {
      signature: r1.signature,
      confirmation: st1.value?.confirmationStatus,
      unitBefore: u0.status,
      unitAfter: unitSnapshot(u1),
      contractAfter: contractSnapshot(c1),
      escrowAfter: escrow1?.toString(),
    };

    // ---------------- TX2 simulate (same construction as fixed client) ----------------
    const withdrawIx = await freelancerProgram.methods
      .withdrawFreelancer()
      .accountsPartial(
        withdrawFreelancerAccounts({
          freelancer: keys.freelancer.publicKey,
          contract: contractPk,
          tokenMint: c1.tokenMint,
          contractEscrow: escrow,
          freelancerTokenAccount: freelancerAta,
        })
      )
      .instruction();
    const sim2 = await simulate(connection, keys.freelancer.publicKey, [ataCreate, withdrawIx]);
    report.tx2Simulation = { err: sim2.err, unitsConsumed: sim2.unitsConsumed, instructionCount: 2 };
    check(sim2.err === null, `TX2 simulation succeeded (${JSON.stringify(sim2.err)})`);

    // ---------------- TX2 send via fixed client ----------------
    const r2 = await freelancerClient.withdrawFreelancer({ contract: contractPk });
    sent.push(r2.signature);
    const st2 = await connection.getSignatureStatus(r2.signature, { searchTransactionHistory: true });
    check(st2.value && !st2.value.err, "TX2 confirmed without error");
    const tx2 = await connection.getTransaction(r2.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    check(tx2, "TX2 fetched");
    const keys2 = tx2.transaction.message.getAccountKeys().staticAccountKeys;
    const programs2 = tx2.transaction.message.compiledInstructions.map((ix) =>
      keys2[ix.programIdIndex]!.toBase58()
    );
    check(
      programs2.length === 2 &&
        programs2[0] === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58() &&
        programs2[1] === STREAMPAY_PROGRAM_ID.toBase58(),
      `TX2 instructions = [ATA create, withdraw] (got ${programs2.join(",")})`
    );
    check(keys2[0]!.equals(keys.freelancer.publicKey), "TX2 fee payer = freelancer");

    const c2 = await fetchContract(employerProgram, contractPk);
    const escrow2 = await tokenAmount(connection, escrow);
    const ataAfter = await tokenAmount(connection, freelancerAta);
    const ataParsed = await connection.getParsedAccountInfo(freelancerAta, "confirmed");
    const ataInfo = (ataParsed.value?.data as { parsed?: { info?: { owner?: string; mint?: string } } })
      ?.parsed?.info;
    check(ataInfo?.owner === EXPECTED_FREELANCER, `ATA owner freelancer (got ${ataInfo?.owner})`);
    check(ataInfo?.mint === EXPECTED_MINT, `ATA mint PFT (got ${ataInfo?.mint})`);
    check(ataParsed.value?.owner.equals(TOKEN_PROGRAM_ID), "ATA owned by classic SPL Token");
    const withdrawn = c2.withdrawnAmount - c1.withdrawnAmount;
    check(withdrawn === EXPECTED_AMOUNT, `TX2 withdrawn 1 PFT (got ${withdrawn})`);
    check((ataAfter ?? 0n) - (ataBefore ?? 0n) === withdrawn, "TX2 ATA delta = withdrawn");
    check((escrow1 ?? 0n) - (escrow2 ?? 0n) === withdrawn, "TX2 escrow delta = withdrawn");
    check(c2.releasedAmount === EXPECTED_AMOUNT && c2.refundedAmount === 0n, "TX2 released/refunded unchanged");
    report.tx2 = {
      signature: r2.signature,
      confirmation: st2.value?.confirmationStatus,
      instructionPrograms: programs2,
      feePayer: keys2[0]!.toBase58(),
      ataCreated: ataBefore === null && ataAfter !== null,
      ataOwner: ataInfo?.owner,
      ataMint: ataInfo?.mint,
      freelancerPftBefore: ataBefore === null ? "0 (no ATA)" : ataBefore.toString(),
      freelancerPftAfter: ataAfter?.toString(),
      escrowBefore: escrow1?.toString(),
      escrowAfter: escrow2?.toString(),
      withdrawnBefore: c1.withdrawnAmount.toString(),
      withdrawnAfter: c2.withdrawnAmount.toString(),
    };

    // ---------------- TX3 simulate + send ----------------
    const tx3Ix = await employerProgram.methods
      .completeContract()
      .accountsPartial({ caller: keys.employer.publicKey, contract: contractPk })
      .instruction();
    const sim3 = await simulate(connection, keys.employer.publicKey, [tx3Ix]);
    report.tx3Simulation = { err: sim3.err, unitsConsumed: sim3.unitsConsumed };
    check(sim3.err === null, `TX3 simulation succeeded (${JSON.stringify(sim3.err)})`);

    const r3 = await employerClient.completeContract(contractPk);
    sent.push(r3.signature);
    const st3 = await connection.getSignatureStatus(r3.signature, { searchTransactionHistory: true });
    check(st3.value && !st3.value.err, "TX3 confirmed without error");
    const c3 = await fetchContract(employerProgram, contractPk);
    const u3 = await fetchWorkUnit(employerProgram, unitPk);
    const escrow3 = await tokenAmount(connection, escrow);
    const ata3 = await tokenAmount(connection, freelancerAta);
    const employerPft3 = await tokenAmount(
      connection,
      deriveFreelancerDestinationAta(keys.employer.publicKey, c0.tokenMint)
    );
    check(c3.status === "Completed", `TX3 contract Completed (got ${c3.status})`);
    check(c3.completedAt > 0, "TX3 completedAt set");
    check(u3.status === "Released", "TX3 unit still Released");
    check(c3.releasedAmount === EXPECTED_AMOUNT && c3.withdrawnAmount === EXPECTED_AMOUNT, "TX3 released=withdrawn=1 PFT");
    check(c3.refundedAmount === 0n, "TX3 refunded 0");
    check(c3.releasedAmount + c3.refundedAmount <= c3.totalAmount, "TX3 released+refunded <= total");
    check(c3.withdrawnAmount <= c3.releasedAmount, "TX3 withdrawn <= released");
    check(escrow3 === escrow2, "TX3 no token movement from escrow");
    check(ata3 === ataAfter, "TX3 no token movement to freelancer");
    check(employerPft3 === employerPft0, "employer PFT unchanged across E2E");

    report.tx3 = {
      signature: r3.signature,
      confirmation: st3.value?.confirmationStatus,
      finalStatus: c3.status,
    };
    report.finalAccounting = {
      contract: contractSnapshot(c3),
      unit: unitSnapshot(u3),
      escrowRemaining: escrow3?.toString(),
      freelancerPft: ata3?.toString(),
      employerPft: employerPft3?.toString() ?? null,
      employerSolDelta: (await connection.getBalance(keys.employer.publicKey, "confirmed")) - employerSol0,
      freelancerSolDelta: (await connection.getBalance(keys.freelancer.publicKey, "confirmed")) - freelancerSol0,
    };
    report.result = "ALL_PASS";
  } catch (err) {
    report.result = "STOPPED";
    report.error = err instanceof Error ? err.message : String(err);
    const logs = (err as { logs?: string[]; transactionLogs?: string[] })?.logs ??
      (err as { transactionLogs?: string[] })?.transactionLogs;
    if (Array.isArray(logs)) report.errorLogs = logs;
    process.exitCode = 1;
  } finally {
    report.transactionsSent = sent.length;
    report.signatures = sent;
    console.log(JSON.stringify(report, null, 2));
  }
}

void main();
