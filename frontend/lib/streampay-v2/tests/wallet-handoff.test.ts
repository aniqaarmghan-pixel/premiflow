import assert from "node:assert/strict";
import test from "node:test";

import { BN } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

import { StreamPayV2Client } from "../instructions";
import idlJson from "../idl/streampay.json";
import { deriveContractAddresses, deriveContractEscrowPda, deriveWorkUnitPda } from "../pda";
import { getStreamPayV2Program } from "../program";
import { describeWalletHandoff } from "../send";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  deriveEmployerSourceAta,
  deriveFreelancerDestinationAta,
} from "../tokens";
import type { CreateContractRequest } from "../types";
import { STREAMPAY_PROGRAM_ID } from "../constants";

const EMPLOYER = Keypair.generate().publicKey;
const FREELANCER = Keypair.generate().publicKey;
const RESOLVER = Keypair.generate().publicKey;
const MINT = Keypair.generate().publicKey;
const BLOCKHASH = Keypair.generate().publicKey.toBase58();
const LAST_VALID = 1_234_567;

class Captured extends Error {
  constructor(readonly tx: Transaction) {
    super("captured before wallet signature");
  }
}

type Harness = {
  client: StreamPayV2Client;
  signCalls: number;
  sendCalls: number;
  blockhashCalls: Array<string | undefined>;
};

/** Offline program whose wallet records the exact tx and refuses to sign it. */
function harness(walletKey: PublicKey): Harness {
  const connection = new Connection("http://127.0.0.1:9", "confirmed");
  const h = { signCalls: 0, sendCalls: 0, blockhashCalls: [] as Array<string | undefined> } as Harness;
  Object.assign(connection, {
    getLatestBlockhash: async (commitment?: string) => {
      h.blockhashCalls.push(commitment);
      return { blockhash: BLOCKHASH, lastValidBlockHeight: LAST_VALID };
    },
    sendRawTransaction: async () => {
      h.sendCalls += 1;
      throw new Error("must not send");
    },
  });
  const wallet: AnchorWallet = {
    publicKey: walletKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      h.signCalls += 1;
      throw new Captured(tx as Transaction);
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(): Promise<T[]> {
      throw new Error("signAllTransactions is not part of the V2 send path");
    },
  };
  h.client = new StreamPayV2Client(getStreamPayV2Program(connection, wallet));
  return h;
}

async function capture(h: Harness, run: () => Promise<unknown>): Promise<Transaction> {
  try {
    await run();
  } catch (err) {
    if (err instanceof Captured) {
      assert.equal(h.signCalls, 1, "exactly one wallet signature request");
      assert.equal(h.sendCalls, 0, "nothing is broadcast when the wallet refuses");
      assert.deepEqual(h.blockhashCalls, ["confirmed"], "one fresh confirmed blockhash");
      return err.tx;
    }
    throw err;
  }
  throw new Error("wallet was never asked to sign");
}

function discriminator(name: string): number[] {
  const ix = (idlJson as { instructions: Array<{ name: string; discriminator: number[] }> })
    .instructions.find((i) => i.name === name);
  assert.ok(ix, `IDL instruction ${name}`);
  return ix.discriminator;
}

function assertKeys(
  actual: Transaction["instructions"][number]["keys"],
  expected: Array<[PublicKey, boolean, boolean]>
) {
  assert.deepEqual(
    actual.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]),
    expected.map(([pk, s, w]) => [pk.toBase58(), s, w])
  );
}

function assertHandoffBasics(tx: Transaction, feePayer: PublicKey) {
  assert.equal(tx.feePayer?.toBase58(), feePayer.toBase58());
  assert.equal(tx.recentBlockhash, BLOCKHASH);
  assert.equal(tx.lastValidBlockHeight, LAST_VALID);
  assert.ok(
    tx.instructions.every((ix) => !ix.programId.equals(ComputeBudgetProgram.programId)),
    "no ComputeBudget instructions are injected"
  );
  const view = describeWalletHandoff(tx);
  assert.equal(view.requiredSignatures, 1, "only the connected wallet signs");
  assert.deepEqual(view.accounts[0], { pubkey: feePayer.toBase58(), signer: true, writable: true });
  assert.equal(view.recentBlockhash, BLOCKHASH);
}

function milestoneRequest(): CreateContractRequest {
  return {
    contractId: 42n,
    paymentMode: "Milestone",
    startMode: "OnActivation",
    totalAmount: 1_000_000n,
    acceptanceDeadline: 2_000_000_000,
    scheduledStartTime: 0,
    durationSeconds: 86_400,
    checkpointInterval: 0,
    reviewDuration: 3_600,
    activationReviewDuration: 3_600,
    maxRevisions: 2,
    trialAmount: 0n,
    resolver: RESOLVER,
    metadataUri: "https://premiflow.app/test-metadata",
    metadataHash: new Uint8Array(32),
  };
}

test("createContract hands the wallet one unmodified program instruction with the employer as fee payer", async () => {
  const h = harness(EMPLOYER);
  const tx = await capture(h, () =>
    h.client.createContract({ request: milestoneRequest(), freelancer: FREELANCER, tokenMint: MINT })
  );
  assertHandoffBasics(tx, EMPLOYER);
  assert.equal(tx.instructions.length, 1, "no preInstructions for createContract");
  const [ix] = tx.instructions;
  assert.ok(ix!.programId.equals(STREAMPAY_PROGRAM_ID));
  assert.deepEqual([...ix!.data.subarray(0, 8)], discriminator("create_contract"));

  const pdas = deriveContractAddresses(EMPLOYER, FREELANCER, 42n, STREAMPAY_PROGRAM_ID);
  assertKeys(ix!.keys, [
    [EMPLOYER, true, true],
    [FREELANCER, false, false],
    [MINT, false, false],
    [deriveEmployerSourceAta(EMPLOYER, MINT), false, true],
    [pdas.contract.address, false, true],
    [pdas.escrow.address, false, true],
    // Optional accounts that are None use the program ID placeholder.
    [STREAMPAY_PROGRAM_ID, false, false],
    [STREAMPAY_PROGRAM_ID, false, false],
    [TOKEN_PROGRAM_ID, false, false],
    [SystemProgram.programId, false, false],
  ]);
});

test("finalizeReviewTimeout targets the chosen work unit with the caller as fee payer", async () => {
  const contract = Keypair.generate().publicKey;
  const workUnit = deriveWorkUnitPda(contract, 2, STREAMPAY_PROGRAM_ID).address;
  const h = harness(FREELANCER);
  const tx = await capture(h, () => h.client.finalizeReviewTimeout({ contract, workUnit }));
  assertHandoffBasics(tx, FREELANCER);
  assert.equal(tx.instructions.length, 1);
  const [ix] = tx.instructions;
  assert.ok(ix!.programId.equals(STREAMPAY_PROGRAM_ID));
  assert.deepEqual([...ix!.data], discriminator("finalize_review_timeout"));
  assertKeys(ix!.keys, [
    [FREELANCER, true, false],
    [contract, false, true],
    [workUnit, false, true],
  ]);
});

function rawContract(address: PublicKey) {
  return {
    version: 1,
    employer: EMPLOYER,
    freelancer: FREELANCER,
    tokenMint: MINT,
    contractId: new BN(42),
    paymentMode: { milestone: {} },
    status: { completed: {} },
    startMode: { onActivation: {} },
    totalAmount: new BN(1_000_000),
    trialAmount: new BN(0),
    mainAmount: new BN(1_000_000),
    allocatedAmount: new BN(1_000_000),
    releasedAmount: new BN(1_000_000),
    withdrawnAmount: new BN(0),
    refundedAmount: new BN(0),
    streamReleasedAmount: new BN(0),
    freelancerSettlementAmount: new BN(1_000_000),
    employerRefundableAmount: new BN(0),
    resolver: RESOLVER,
    contestedAmount: new BN(0),
    disputedAt: new BN(0),
    disputeInitiator: { none: {} },
    acceptanceDeadline: new BN(2_000_000_000),
    scheduledStartTime: new BN(0),
    durationSeconds: new BN(86_400),
    checkpointInterval: new BN(0),
    reviewDuration: new BN(3_600),
    activationReviewDuration: new BN(3_600),
    maxRevisions: 2,
    startTime: new BN(1_700_000_000),
    endTime: new BN(1_700_086_400),
    lastPeriodEnd: new BN(0),
    createdAt: new BN(1_699_000_000),
    acceptedAt: new BN(1_699_500_000),
    completedAt: new BN(1_700_100_000),
    terminatedAt: new BN(1_700_100_000),
    workUnitCount: 1,
    releasedUnitCount: 1,
    voidedUnitCount: 0,
    openReviewCount: 0,
    lastMilestoneDueOffset: new BN(0),
    metadataHash: Array.from({ length: 32 }, () => 0),
    bump: 255,
    escrowBump: 254,
    metadataUri: `memory:${address.toBase58()}`,
  };
}

function stubContractFetch(h: Harness) {
  const account = h.client.program.account.contract as unknown as {
    fetch: (address: PublicKey) => Promise<unknown>;
  };
  account.fetch = async (address: PublicKey) => rawContract(address);
}

test("withdrawFreelancer keeps the idempotent ATA preInstruction before the withdraw, paid by the freelancer", async () => {
  const contract = Keypair.generate().publicKey;
  const h = harness(FREELANCER);
  stubContractFetch(h);
  const tx = await capture(h, () => h.client.withdrawFreelancer({ contract }));
  assertHandoffBasics(tx, FREELANCER);
  assert.equal(tx.instructions.length, 2);
  const [ataIx, withdrawIx] = tx.instructions;
  const ata = deriveFreelancerDestinationAta(FREELANCER, MINT);

  assert.ok(ataIx!.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
  assert.equal(ataIx!.data[0], 1, "idempotent create");
  assert.equal(ataIx!.keys[0]!.pubkey.toBase58(), FREELANCER.toBase58());
  assert.equal(ataIx!.keys[1]!.pubkey.toBase58(), ata.toBase58());

  assert.ok(withdrawIx!.programId.equals(STREAMPAY_PROGRAM_ID));
  assert.deepEqual([...withdrawIx!.data], discriminator("withdraw_freelancer"));
  assertKeys(withdrawIx!.keys, [
    [FREELANCER, true, false],
    [contract, false, true],
    [MINT, false, false],
    [deriveContractEscrowPda(contract, STREAMPAY_PROGRAM_ID).address, false, true],
    [ata, false, true],
    [TOKEN_PROGRAM_ID, false, false],
  ]);
});

test("withdrawFreelancer to a custom destination adds no ATA preInstruction", async () => {
  const contract = Keypair.generate().publicKey;
  const custom = Keypair.generate().publicKey;
  const h = harness(FREELANCER);
  stubContractFetch(h);
  const tx = await capture(h, () =>
    h.client.withdrawFreelancer({ contract, freelancerTokenAccount: custom })
  );
  assert.equal(tx.instructions.length, 1);
  assert.ok(tx.instructions[0]!.programId.equals(STREAMPAY_PROGRAM_ID));
  assert.equal(tx.instructions[0]!.keys[4]!.pubkey.toBase58(), custom.toBase58());
});

test("describeWalletHandoff does not mutate the transaction it describes", async () => {
  const contract = Keypair.generate().publicKey;
  const workUnit = deriveWorkUnitPda(contract, 0, STREAMPAY_PROGRAM_ID).address;
  const h = harness(EMPLOYER);
  const tx = await capture(h, () => h.client.finalizeReviewTimeout({ contract, workUnit }));
  const signaturesBefore = tx.signatures.map((s) => [s.publicKey.toBase58(), s.signature]);
  const messageBefore = Buffer.from(tx.compileMessage().serialize()).toString("base64");

  const view = describeWalletHandoff(tx);

  assert.equal(view.messageBase64, messageBefore);
  assert.deepEqual(
    tx.signatures.map((s) => [s.publicKey.toBase58(), s.signature]),
    signaturesBefore
  );
  assert.equal(Buffer.from(tx.compileMessage().serialize()).toString("base64"), messageBefore);
  assert.deepEqual(
    view.instructions.map((i) => i.programId),
    [STREAMPAY_PROGRAM_ID.toBase58()]
  );
});

test("wallet-handoff diagnostic logs only in development and never includes signatures", async () => {
  const env = process.env as { NODE_ENV?: string };
  const previous = env.NODE_ENV;
  const originalInfo = console.info;
  const lines: unknown[][] = [];
  console.info = (...args: unknown[]) => {
    lines.push(args);
  };
  const contract = Keypair.generate().publicKey;
  const workUnit = deriveWorkUnitPda(contract, 0, STREAMPAY_PROGRAM_ID).address;
  try {
    env.NODE_ENV = "production";
    const hp = harness(EMPLOYER);
    await capture(hp, () => hp.client.finalizeReviewTimeout({ contract, workUnit }));
    assert.equal(lines.filter((l) => l[0] === "[streampay-v2:wallet-handoff]").length, 0);

    env.NODE_ENV = "development";
    const hd = harness(EMPLOYER);
    const tx = await capture(hd, () => hd.client.finalizeReviewTimeout({ contract, workUnit }));
    const logged = lines.filter((l) => l[0] === "[streampay-v2:wallet-handoff]");
    assert.equal(logged.length, 1);
    const payload = logged[0]![1] as Record<string, unknown>;
    assert.equal(payload.feePayer, EMPLOYER.toBase58());
    assert.equal(payload.recentBlockhash, BLOCKHASH);
    assert.equal(payload.lastValidBlockHeight, LAST_VALID);
    assert.equal(typeof payload.blockhashAgeMs, "number");
    assert.equal(payload.messageBase64, describeWalletHandoff(tx).messageBase64);
    assert.equal("signatures" in payload, false);
  } finally {
    console.info = originalInfo;
    env.NODE_ENV = previous;
  }
});
