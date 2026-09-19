import assert from "node:assert/strict";
import test from "node:test";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";

import {
  TransactionConfirmationUnknownError,
  TransactionFailedOnChainError,
} from "../confirm";
import {
  sendV2Transaction,
  V2_SEND_COMMITMENT,
  TransactionExpiredBeforeSubmitError,
  recentBlockhashFromSerialized,
  type BlockhashBoundarySnapshot,
  type V2SendDeps,
} from "../send";

const SIG =
  "xu1VLVJ6sQJKFpPhJHS6M6d91M1AgEHXqpAFPXFbC6fAPM3SPQZFNBKruZZtk3kELVW1pppPMyf1eAcM8hDZ6DT";
const FRESH_HASH = Keypair.generate().publicKey.toBase58();

function unsignedTransfer(feePayer: PublicKey): Transaction {
  const tx = new Transaction();
  tx.add(
    new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [{ pubkey: feePayer, isSigner: true, isWritable: true }],
      data: Buffer.alloc(0),
    })
  );
  return tx;
}

function signPayer(payer: Keypair) {
  return async <T extends Transaction | VersionedTransaction>(signed: T): Promise<T> => {
    if (signed instanceof Transaction) signed.partialSign(payer);
    return signed;
  };
}

function liveHashDeps(overrides: Partial<V2SendDeps> = {}): Pick<
  V2SendDeps,
  "getBlockHeight" | "isBlockhashValid"
> {
  return {
    getBlockHeight: async () => 1_000,
    isBlockhashValid: async () => true,
    ...overrides,
  };
}

test("fresh confirmed blockhash is obtained and attached before one signature", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let hashCalls = 0;
  let signCalls = 0;
  let sendCalls = 0;
  let seenOptions: { skipPreflight?: boolean; preflightCommitment?: string } | undefined;
  let confirmCalls = 0;
  const snapshots: BlockhashBoundarySnapshot[] = [];
  let sentHash = "";

  const signature = await sendV2Transaction(tx, {
    connection: {} as never,
    wallet: {
      publicKey: payer.publicKey,
      signTransaction: async (signed) => {
        signCalls += 1;
        assert.ok(signed instanceof Transaction);
        assert.equal(signed.recentBlockhash, FRESH_HASH);
        assert.ok(signed.feePayer?.equals(payer.publicKey));
        signed.partialSign(payer);
        return signed;
      },
    },
    getLatestBlockhash: async (commitment) => {
      hashCalls += 1;
      assert.equal(commitment, V2_SEND_COMMITMENT);
      assert.equal(commitment, "confirmed");
      return { blockhash: FRESH_HASH, lastValidBlockHeight: 1_150 };
    },
    ...liveHashDeps(),
    sendRawTransaction: async (raw, options) => {
      sendCalls += 1;
      seenOptions = options;
      sentHash = recentBlockhashFromSerialized(raw);
      return SIG;
    },
    confirmSignature: async (_connection, signature) => {
      confirmCalls += 1;
      assert.equal(signature, SIG);
      return { outcome: "confirmed", signature, confirmationStatus: "confirmed" };
    },
    onBlockhashDiagnostics: (snapshot) => snapshots.push(snapshot),
  });

  assert.equal(signature, SIG);
  assert.equal(hashCalls, 1);
  assert.equal(signCalls, 1);
  assert.equal(sendCalls, 1);
  assert.equal(confirmCalls, 1);
  assert.notEqual(seenOptions?.skipPreflight, true);
  assert.equal(seenOptions?.preflightCommitment, "confirmed");
  assert.equal(sentHash, FRESH_HASH);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0]?.phase, "before_sign");
  assert.equal(snapshots[0]?.fetchedBlockhash, FRESH_HASH);
  assert.equal(snapshots[0]?.isFetchedBlockhashValid, true);
  assert.equal(snapshots[0]?.remainingValidBlocks, 150);
  assert.equal(snapshots[1]?.phase, "after_sign");
  assert.equal(snapshots[1]?.signedBlockhash, FRESH_HASH);
  assert.equal(snapshots[1]?.signedMatchesFetched, true);
  assert.equal(snapshots[1]?.serializedBlockhash, FRESH_HASH);
  assert.equal(snapshots[1]?.serializedMatchesFetched, true);
});

test("serialized signed transaction contains the fetched blockhash", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let serialized = "";

  await sendV2Transaction(tx, {
    connection: {} as never,
    wallet: {
      publicKey: payer.publicKey,
      signTransaction: signPayer(payer),
    },
    getLatestBlockhash: async () => ({
      blockhash: FRESH_HASH,
      lastValidBlockHeight: 1_150,
    }),
    ...liveHashDeps(),
    sendRawTransaction: async (raw) => {
      serialized = recentBlockhashFromSerialized(raw);
      return SIG;
    },
    confirmSignature: async () => ({
      outcome: "confirmed",
      signature: SIG,
      confirmationStatus: "confirmed",
    }),
  });

  assert.equal(serialized, FRESH_HASH);
});

test("no mutation after signing and one send only", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let hashAtSign = "";

  await sendV2Transaction(tx, {
    connection: {} as never,
    wallet: {
      publicKey: payer.publicKey,
      signTransaction: async (signed) => {
        assert.ok(signed instanceof Transaction);
        hashAtSign = signed.recentBlockhash ?? "";
        signed.partialSign(payer);
        return signed;
      },
    },
    getLatestBlockhash: async () => ({
      blockhash: FRESH_HASH,
      lastValidBlockHeight: 1_150,
    }),
    ...liveHashDeps(),
    sendRawTransaction: async (raw) => {
      assert.equal(recentBlockhashFromSerialized(raw), hashAtSign);
      assert.equal(hashAtSign, FRESH_HASH);
      return SIG;
    },
    confirmSignature: async () => ({
      outcome: "confirmed",
      signature: SIG,
      confirmationStatus: "confirmed",
    }),
  });
});

test("blockhash-not-found from preflight does not retry or resign", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let signCalls = 0;
  let sendCalls = 0;
  let confirmCalls = 0;

  await assert.rejects(
    () =>
      sendV2Transaction(tx, {
        connection: {} as never,
        wallet: {
          publicKey: payer.publicKey,
          signTransaction: async (signed) => {
            signCalls += 1;
            if (signed instanceof Transaction) signed.partialSign(payer);
            return signed;
          },
        },
        getLatestBlockhash: async () => ({
          blockhash: FRESH_HASH,
          lastValidBlockHeight: 1_150,
        }),
        ...liveHashDeps(),
        sendRawTransaction: async () => {
          sendCalls += 1;
          const err = new Error(
            "Simulation failed.\nMessage: Transaction simulation failed: Blockhash not found.\nLogs: []."
          );
          (err as Error & { transactionMessage?: string }).transactionMessage =
            "Transaction simulation failed: Blockhash not found";
          throw err;
        },
        confirmSignature: async () => {
          confirmCalls += 1;
          return { outcome: "confirmed", signature: SIG, confirmationStatus: "confirmed" };
        },
      }),
    /Blockhash not found/
  );

  assert.equal(signCalls, 1);
  assert.equal(sendCalls, 1);
  assert.equal(confirmCalls, 0);
});

test("already-invalid signed blockhash is not sent", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let sendCalls = 0;
  let signCalls = 0;

  await assert.rejects(
    () =>
      sendV2Transaction(tx, {
        connection: {} as never,
        wallet: {
          publicKey: payer.publicKey,
          signTransaction: async (signed) => {
            signCalls += 1;
            if (signed instanceof Transaction) signed.partialSign(payer);
            return signed;
          },
        },
        getLatestBlockhash: async () => ({
          blockhash: FRESH_HASH,
          lastValidBlockHeight: 1_150,
        }),
        ...liveHashDeps({
          isBlockhashValid: async () => false,
        }),
        sendRawTransaction: async () => {
          sendCalls += 1;
          return SIG;
        },
        confirmSignature: async () => ({
          outcome: "confirmed",
          signature: SIG,
          confirmationStatus: "confirmed",
        }),
      }),
    (err: unknown) =>
      err instanceof TransactionExpiredBeforeSubmitError &&
      /expired before submission/i.test(err.message)
  );

  assert.equal(signCalls, 1);
  assert.equal(sendCalls, 0);
});

test("near-expiry signed blockhash is not sent", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let sendCalls = 0;

  await assert.rejects(
    () =>
      sendV2Transaction(tx, {
        connection: {} as never,
        wallet: {
          publicKey: payer.publicKey,
          signTransaction: signPayer(payer),
        },
        getLatestBlockhash: async () => ({
          blockhash: FRESH_HASH,
          lastValidBlockHeight: 1_005,
        }),
        ...liveHashDeps({
          getBlockHeight: async () => 1_000,
        }),
        sendRawTransaction: async () => {
          sendCalls += 1;
          return SIG;
        },
        confirmSignature: async () => ({
          outcome: "confirmed",
          signature: SIG,
          confirmationStatus: "confirmed",
        }),
      }),
    (err: unknown) => err instanceof TransactionExpiredBeforeSubmitError
  );

  assert.equal(sendCalls, 0);
});

test("HTTP confirmation timeout keeps the signature as unknown/pending", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);

  await assert.rejects(
    () =>
      sendV2Transaction(tx, {
        connection: {} as never,
        wallet: {
          publicKey: payer.publicKey,
          signTransaction: signPayer(payer),
        },
        getLatestBlockhash: async () => ({
          blockhash: FRESH_HASH,
          lastValidBlockHeight: 1_150,
        }),
        ...liveHashDeps(),
        sendRawTransaction: async () => SIG,
        confirmSignature: async () => ({
          outcome: "unknown",
          signature: SIG,
          reason: "timeout",
        }),
      }),
    (err: unknown) =>
      err instanceof TransactionConfirmationUnknownError && err.signature === SIG
  );
});

test("explicit on-chain err is treated as failed", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  const onChainErr = { InstructionError: [0, { Custom: 6111 }] };

  await assert.rejects(
    () =>
      sendV2Transaction(tx, {
        connection: {} as never,
        wallet: {
          publicKey: payer.publicKey,
          signTransaction: signPayer(payer),
        },
        getLatestBlockhash: async () => ({
          blockhash: FRESH_HASH,
          lastValidBlockHeight: 1_150,
        }),
        ...liveHashDeps(),
        sendRawTransaction: async () => SIG,
        confirmSignature: async () => ({
          outcome: "failed",
          signature: SIG,
          err: onChainErr,
        }),
      }),
    (err: unknown) =>
      err instanceof TransactionFailedOnChainError && err.signature === SIG
  );
});
