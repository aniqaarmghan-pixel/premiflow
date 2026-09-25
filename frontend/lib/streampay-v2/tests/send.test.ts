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
  setSendPipelinePhaseHandler,
  V2_SEND_COMMITMENT,
  TRANSACTION_EXPIRED_BEFORE_SUBMIT_MESSAGE,
  TransactionExpiredBeforeSubmitError,
  formatExpiredBeforeSubmitDevDiagnostic,
  recentBlockhashFromSerialized,
  type BlockhashBoundarySnapshot,
  type ExpiredBeforeSubmitDiagnostics,
  type SendPipelinePhase,
  type V2SendDeps,
} from "../send";
import { parseClientError } from "../errors";

const SIG =
  "xu1VLVJ6sQJKFpPhJHS6M6d91M1AgEHXqpAFPXFbC6fAPM3SPQZFNBKruZZtk3kELVW1pppPMyf1eAcM8hDZ6DT";
const FRESH_HASH = Keypair.generate().publicKey.toBase58();

function expiredDiagnostics(
  overrides: Partial<ExpiredBeforeSubmitDiagnostics> = {}
): ExpiredBeforeSubmitDiagnostics {
  return {
    signWaitMs: 0,
    lastValidBlockHeight: 1_150,
    fetchedBlockHeight: null,
    postSignBlockHeight: 1_000,
    remainingValidBlocks: 0,
    isBlockhashValid: false,
    ...overrides,
  };
}

function expiredError(
  remainingValidBlocks: number | null = 0,
  overrides: Partial<ExpiredBeforeSubmitDiagnostics> = {}
): TransactionExpiredBeforeSubmitError {
  return new TransactionExpiredBeforeSubmitError(
    FRESH_HASH,
    FRESH_HASH,
    remainingValidBlocks,
    expiredDiagnostics({ remainingValidBlocks, ...overrides })
  );
}

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
  assert.equal(snapshots[0]?.isFetchedBlockhashValid, null);
  assert.equal(snapshots[0]?.remainingValidBlocks, null);
  assert.equal(snapshots[0]?.currentBlockHeight, null);
  assert.equal(snapshots[1]?.phase, "after_sign");
  assert.equal(snapshots[1]?.signedBlockhash, FRESH_HASH);
  assert.equal(snapshots[1]?.signedMatchesFetched, true);
  assert.equal(snapshots[1]?.serializedBlockhash, FRESH_HASH);
  assert.equal(snapshots[1]?.serializedMatchesFetched, true);
  assert.equal(snapshots[1]?.remainingValidBlocks, 150);
});

test("fresh blockhash opens wallet without redundant pre-sign validity RPCs", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let signed = false;
  let heightCalls = 0;
  let validCalls = 0;
  const phases: SendPipelinePhase[] = [];

  setSendPipelinePhaseHandler((phase) => {
    phases.push(phase);
  });

  try {
    await sendV2Transaction(tx, {
      connection: {} as never,
      wallet: {
        publicKey: payer.publicKey,
        signTransaction: async (signedTx) => {
          assert.equal(heightCalls, 0);
          assert.equal(validCalls, 0);
          signed = true;
          if (signedTx instanceof Transaction) signedTx.partialSign(payer);
          return signedTx;
        },
      },
      getLatestBlockhash: async () => ({
        blockhash: FRESH_HASH,
        lastValidBlockHeight: 1_150,
      }),
      getBlockHeight: async () => {
        heightCalls += 1;
        assert.equal(signed, true);
        return 1_000;
      },
      isBlockhashValid: async () => {
        validCalls += 1;
        assert.equal(signed, true);
        return true;
      },
      sendRawTransaction: async () => SIG,
      confirmSignature: async () => ({
        outcome: "confirmed",
        signature: SIG,
        confirmationStatus: "confirmed",
      }),
    });
  } finally {
    setSendPipelinePhaseHandler(undefined);
  }

  assert.equal(heightCalls, 1);
  assert.equal(validCalls, 1);
  assert.deepEqual(phases, ["awaiting_wallet", "submitting", "confirming"]);
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
      err.message === TRANSACTION_EXPIRED_BEFORE_SUBMIT_MESSAGE
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

test("healthy remaining validity after sign is broadcast once", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let sendCalls = 0;
  let signCalls = 0;

  const signature = await sendV2Transaction(tx, {
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
  });

  assert.equal(signature, SIG);
  assert.equal(signCalls, 1);
  assert.equal(sendCalls, 1);
});

test("BeforeSubmitError proves no sendRawTransaction occurred", async () => {
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
    TransactionExpiredBeforeSubmitError
  );

  assert.equal(sendCalls, 0);
  const parsed = parseClientError(expiredError(0));
  assert.equal(parsed.kind, "expired_before_submit");
  assert.match(parsed.uiMessage, /nothing was submitted/i);
});

test("confirmation timeout remains distinguishable from before-submit expiry", async () => {
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
          lastValidBlockHeight: 1_150,
        }),
        ...liveHashDeps(),
        sendRawTransaction: async () => {
          sendCalls += 1;
          return SIG;
        },
        confirmSignature: async () => ({
          outcome: "unknown",
          signature: SIG,
          reason: "timeout",
        }),
      }),
    (err: unknown) =>
      err instanceof TransactionConfirmationUnknownError && err.signature === SIG
  );

  assert.equal(sendCalls, 1);

  const pending = parseClientError(
    new TransactionConfirmationUnknownError(SIG, "timeout")
  );
  const expired = parseClientError(expiredError(0));
  assert.equal(pending.kind, "pending_confirmation");
  assert.equal(expired.kind, "expired_before_submit");
  assert.notEqual(pending.kind, expired.kind);
  assert.match(pending.uiMessage, /do not retry yet/i);
  assert.match(expired.uiMessage, /nothing was submitted/i);
  assert.equal(pending.signature, SIG);
});

test("awaiting_wallet remains until signTransaction resolves", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  const phases: SendPipelinePhase[] = [];
  let releaseSign!: () => void;
  let signStarted = false;

  setSendPipelinePhaseHandler((phase) => {
    phases.push(phase);
  });

  try {
    const gate = new Promise<void>((resolve) => {
      releaseSign = resolve;
    });

    const sendPromise = sendV2Transaction(tx, {
      connection: {} as never,
      wallet: {
        publicKey: payer.publicKey,
        signTransaction: async <T extends Transaction | VersionedTransaction>(
          signed: T
        ): Promise<T> => {
          signStarted = true;
          await gate;
          if (signed instanceof Transaction) signed.partialSign(payer);
          return signed;
        },
      },
      getLatestBlockhash: async () => ({
        blockhash: FRESH_HASH,
        lastValidBlockHeight: 1_150,
      }),
      ...liveHashDeps(),
      sendRawTransaction: async () => SIG,
      confirmSignature: async () => ({
        outcome: "confirmed",
        signature: SIG,
        confirmationStatus: "confirmed",
      }),
    });

    await new Promise((r) => setTimeout(r, 10));
    assert.equal(signStarted, true);
    assert.deepEqual(phases, ["awaiting_wallet"]);
    assert.ok(!phases.includes("submitting"));
    assert.ok(!phases.includes("confirming"));

    releaseSign();
    await sendPromise;

    assert.deepEqual(phases, ["awaiting_wallet", "submitting", "confirming"]);
  } finally {
    setSendPipelinePhaseHandler(undefined);
  }
});

test("wallet rejection remains distinct from before-submit expiry", () => {
  const rejected = parseClientError(
    Object.assign(new Error("User rejected the request"), {
      name: "WalletSignTransactionError",
      code: 4001,
    })
  );
  const expired = parseClientError(expiredError(0));
  assert.equal(rejected.kind, "wallet_rejected");
  assert.equal(expired.kind, "expired_before_submit");
  assert.notEqual(rejected.kind, expired.kind);
  assert.doesNotMatch(rejected.uiMessage, /nothing was submitted/i);
});

test("signed blockhash mismatch still refuses send when replacement hash is invalid", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  const OTHER_HASH = Keypair.generate().publicKey.toBase58();
  let sendCalls = 0;

  await assert.rejects(
    () =>
      sendV2Transaction(tx, {
        connection: {} as never,
        wallet: {
          publicKey: payer.publicKey,
          signTransaction: async (signed) => {
            assert.ok(signed instanceof Transaction);
            signed.recentBlockhash = OTHER_HASH;
            signed.partialSign(payer);
            return signed;
          },
        },
        getLatestBlockhash: async () => ({
          blockhash: FRESH_HASH,
          lastValidBlockHeight: 1_150,
        }),
        ...liveHashDeps({
          isBlockhashValid: async (blockhash) => blockhash === FRESH_HASH,
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
    TransactionExpiredBeforeSubmitError
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

test("instrumentation records signWaitMs and heights without changing refusal", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let sendCalls = 0;
  let clock = 1_000;
  const snapshots: BlockhashBoundarySnapshot[] = [];

  await assert.rejects(
    () =>
      sendV2Transaction(tx, {
        connection: {} as never,
        wallet: {
          publicKey: payer.publicKey,
          signTransaction: async (signed) => {
            clock += 54_200;
            if (signed instanceof Transaction) signed.partialSign(payer);
            return signed;
          },
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
        onBlockhashDiagnostics: (snapshot) => snapshots.push(snapshot),
        nowMs: () => clock,
      }),
    (err: unknown) => {
      assert.ok(err instanceof TransactionExpiredBeforeSubmitError);
      assert.equal(err.signWaitMs, 54_200);
      assert.equal(err.lastValidBlockHeight, 1_005);
      assert.equal(err.fetchedBlockHeight, null);
      assert.equal(err.postSignBlockHeight, 1_000);
      assert.equal(err.remainingValidBlocks, 5);
      assert.equal(err.isBlockhashValid, true);
      assert.equal(err.message, TRANSACTION_EXPIRED_BEFORE_SUBMIT_MESSAGE);
      return true;
    }
  );

  assert.equal(sendCalls, 0);
  const after = snapshots.find((s) => s.phase === "after_sign");
  assert.ok(after);
  assert.equal(after.signWaitMs, 54_200);
  assert.equal(after.remainingValidBlocks, 5);
  assert.equal(
    formatExpiredBeforeSubmitDevDiagnostic({
      signWaitMs: 54_200,
      remainingValidBlocks: 5,
      isBlockhashValid: true,
    }),
    "Wallet approval: 54.2s · Remaining: 5 blocks · Blockhash: rpc-valid · Threshold: ≤10 refused"
  );
});

test("slow wallet approval still sends when blockhash remains comfortably valid", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let sendCalls = 0;
  let clock = 0;

  const signature = await sendV2Transaction(tx, {
    connection: {} as never,
    wallet: {
      publicKey: payer.publicKey,
      signTransaction: async (signed) => {
        clock += 29_000;
        if (signed instanceof Transaction) signed.partialSign(payer);
        return signed;
      },
    },
    getLatestBlockhash: async () => ({
      blockhash: FRESH_HASH,
      lastValidBlockHeight: 1_150,
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
    nowMs: () => clock,
  });

  assert.equal(signature, SIG);
  assert.equal(sendCalls, 1);
});

test("instrumentation does not alter healthy send path", async () => {
  const payer = Keypair.generate();
  const tx = unsignedTransfer(payer.publicKey);
  let sendCalls = 0;
  let clock = 0;

  const signature = await sendV2Transaction(tx, {
    connection: {} as never,
    wallet: {
      publicKey: payer.publicKey,
      signTransaction: async (signed) => {
        clock += 1_500;
        if (signed instanceof Transaction) signed.partialSign(payer);
        return signed;
      },
    },
    getLatestBlockhash: async () => ({
      blockhash: FRESH_HASH,
      lastValidBlockHeight: 1_150,
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
    nowMs: () => clock,
  });

  assert.equal(signature, SIG);
  assert.equal(sendCalls, 1);
});

test("expired_before_submit diagnostic is development-only in parseClientError", () => {
  const err = expiredError(7, { signWaitMs: 54_200 });
  const env = process.env as { NODE_ENV?: string };
  const previous = env.NODE_ENV;
  try {
    env.NODE_ENV = "development";
    const dev = parseClientError(err);
    assert.equal(dev.kind, "expired_before_submit");
    assert.equal(
      dev.diagnostic,
      "Wallet approval: 54.2s · Remaining: 7 blocks · Blockhash: invalid · Threshold: ≤10 refused"
    );
    assert.match(dev.uiMessage, /nothing was submitted/i);

    env.NODE_ENV = "production";
    const prod = parseClientError(err);
    assert.equal(prod.kind, "expired_before_submit");
    assert.equal(prod.diagnostic, undefined);
    assert.equal(prod.uiMessage, TRANSACTION_EXPIRED_BEFORE_SUBMIT_MESSAGE);
  } finally {
    env.NODE_ENV = previous;
  }
});
