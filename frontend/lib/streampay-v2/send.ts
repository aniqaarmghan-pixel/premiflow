import {
  Transaction,
  VersionedTransaction,
  type Commitment,
  type Connection,
  type PublicKey,
  type SendOptions,
  type TransactionSignature,
} from "@solana/web3.js";

import {
  confirmSignatureOnConnection,
  throwIfNotConfirmed,
  type ConfirmSignatureOutcome,
} from "./confirm";

export const V2_SEND_COMMITMENT: Commitment = "confirmed";

/** Refuse to send a signed tx that has this few (or fewer) valid blocks left. */
export const BLOCKHASH_NEAR_EXPIRY_REMAINING = 10;

export const TRANSACTION_EXPIRED_BEFORE_SUBMIT_MESSAGE =
  "The transaction expired before submission. Please try again.";

export type V2SendWallet = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T>;
};

export type LatestBlockhash = {
  blockhash: string;
  lastValidBlockHeight: number;
};

export type BlockhashBoundarySnapshot = {
  phase: "before_sign" | "after_sign";
  fetchedBlockhash: string;
  lastValidBlockHeight: number;
  currentBlockHeight: number | null;
  remainingValidBlocks: number | null;
  isFetchedBlockhashValid: boolean | null;
  signedBlockhash?: string;
  signedMatchesFetched?: boolean;
  serializedBlockhash?: string;
  serializedMatchesFetched?: boolean;
  isSignedBlockhashValid?: boolean | null;
};

export type V2SendDeps = {
  connection: Connection;
  wallet: V2SendWallet;
  getLatestBlockhash?: (commitment: Commitment) => Promise<LatestBlockhash>;
  getBlockHeight?: (commitment: Commitment) => Promise<number>;
  isBlockhashValid?: (
    blockhash: string,
    commitment: Commitment
  ) => Promise<boolean>;
  sendRawTransaction?: (
    raw: Buffer | Uint8Array | number[],
    options: SendOptions
  ) => Promise<TransactionSignature>;
  confirmSignature?: (
    connection: Connection,
    signature: string
  ) => Promise<ConfirmSignatureOutcome>;
  onBlockhashDiagnostics?: (snapshot: BlockhashBoundarySnapshot) => void;
};

/** Signed locally, but the blockhash is already dead. Nothing was sent. */
export class TransactionExpiredBeforeSubmitError extends Error {
  readonly fetchedBlockhash: string;
  readonly signedBlockhash: string;
  readonly remainingValidBlocks: number | null;

  constructor(
    fetchedBlockhash: string,
    signedBlockhash: string,
    remainingValidBlocks: number | null
  ) {
    super(TRANSACTION_EXPIRED_BEFORE_SUBMIT_MESSAGE);
    this.name = "TransactionExpiredBeforeSubmitError";
    this.fetchedBlockhash = fetchedBlockhash;
    this.signedBlockhash = signedBlockhash;
    this.remainingValidBlocks = remainingValidBlocks;
  }
}

export function isLegacyTransaction(
  tx: Transaction | VersionedTransaction
): tx is Transaction {
  return Array.isArray((tx as Transaction).instructions);
}

export function recentBlockhashFromSerialized(
  raw: Buffer | Uint8Array | number[]
): string {
  const bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
  const parsed = Transaction.from(Buffer.from(bytes));
  if (!parsed.recentBlockhash) {
    throw new Error("serialized transaction has no recentBlockhash");
  }
  return parsed.recentBlockhash;
}

function sendOptions(): SendOptions {
  return {
    preflightCommitment: V2_SEND_COMMITMENT,
  };
}

function remainingBlocks(
  lastValidBlockHeight: number,
  currentBlockHeight: number | null
): number | null {
  if (currentBlockHeight == null) return null;
  return lastValidBlockHeight - currentBlockHeight;
}

async function readBlockHeight(
  getBlockHeight: (commitment: Commitment) => Promise<number>
): Promise<number | null> {
  try {
    return await getBlockHeight(V2_SEND_COMMITMENT);
  } catch {
    return null;
  }
}

async function readIsValid(
  isBlockhashValid: (blockhash: string, commitment: Commitment) => Promise<boolean>,
  blockhash: string
): Promise<boolean | null> {
  try {
    return await isBlockhashValid(blockhash, V2_SEND_COMMITMENT);
  } catch {
    return null;
  }
}

function emitDiagnostics(
  onBlockhashDiagnostics: ((snapshot: BlockhashBoundarySnapshot) => void) | undefined,
  snapshot: BlockhashBoundarySnapshot
): void {
  onBlockhashDiagnostics?.(snapshot);
  console.info("[streampay-v2:blockhash]", snapshot);
}

function shouldRefuseExpiredSend(
  isValid: boolean | null,
  remaining: number | null
): boolean {
  if (isValid === false) return true;
  if (remaining != null && remaining <= BLOCKHASH_NEAR_EXPIRY_REMAINING) {
    return true;
  }
  return false;
}

/**
 * Fresh confirmed blockhash immediately before the one wallet signature,
 * then one HTTP send + HTTP confirmation. Never resends. Never skipPreflight.
 * Does not send a signed transaction whose blockhash is already dead.
 */
export async function sendV2Transaction(
  transaction: Transaction | VersionedTransaction,
  deps: V2SendDeps
): Promise<TransactionSignature> {
  if (!isLegacyTransaction(transaction)) {
    throw new Error("V2 send helper expects a legacy Transaction");
  }

  const getLatestBlockhash =
    deps.getLatestBlockhash ??
    ((commitment: Commitment) => deps.connection.getLatestBlockhash(commitment));
  const getBlockHeight =
    deps.getBlockHeight ??
    ((commitment: Commitment) => deps.connection.getBlockHeight(commitment));
  const isBlockhashValid =
    deps.isBlockhashValid ??
    (async (blockhash: string, commitment: Commitment) => {
      const result = await deps.connection.isBlockhashValid(blockhash, {
        commitment,
      });
      return result.value;
    });
  const sendRawTransaction =
    deps.sendRawTransaction ??
    ((raw: Buffer | Uint8Array | number[], options: SendOptions) =>
      deps.connection.sendRawTransaction(raw, options));
  const confirmSignature =
    deps.confirmSignature ?? confirmSignatureOnConnection;

  transaction.feePayer = deps.wallet.publicKey;
  const latest = await getLatestBlockhash(V2_SEND_COMMITMENT);
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;

  const heightBefore = await readBlockHeight(getBlockHeight);
  const validBefore = await readIsValid(isBlockhashValid, latest.blockhash);
  emitDiagnostics(deps.onBlockhashDiagnostics, {
    phase: "before_sign",
    fetchedBlockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    currentBlockHeight: heightBefore,
    remainingValidBlocks: remainingBlocks(
      latest.lastValidBlockHeight,
      heightBefore
    ),
    isFetchedBlockhashValid: validBefore,
  });

  const signed = await deps.wallet.signTransaction(transaction);
  if (!isLegacyTransaction(signed)) {
    throw new Error("V2 send helper expects a legacy Transaction");
  }

  const signedBlockhash = signed.recentBlockhash ?? "";
  const raw = signed.serialize();
  const serializedBlockhash = recentBlockhashFromSerialized(raw);
  const heightAfter = await readBlockHeight(getBlockHeight);
  const validFetchedAfter = await readIsValid(isBlockhashValid, latest.blockhash);
  const signedMatchesFetched = signedBlockhash === latest.blockhash;
  const serializedMatchesFetched = serializedBlockhash === latest.blockhash;
  const validSignedAfter = signedMatchesFetched
    ? validFetchedAfter
    : await readIsValid(isBlockhashValid, signedBlockhash);
  const remainingAfter = remainingBlocks(
    latest.lastValidBlockHeight,
    heightAfter
  );

  emitDiagnostics(deps.onBlockhashDiagnostics, {
    phase: "after_sign",
    fetchedBlockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    currentBlockHeight: heightAfter,
    remainingValidBlocks: remainingAfter,
    isFetchedBlockhashValid: validFetchedAfter,
    signedBlockhash,
    signedMatchesFetched,
    serializedBlockhash,
    serializedMatchesFetched,
    isSignedBlockhashValid: validSignedAfter,
  });

  const validityForSend = signedMatchesFetched
    ? validFetchedAfter
    : validSignedAfter;
  const remainingForSend = signedMatchesFetched ? remainingAfter : null;
  if (shouldRefuseExpiredSend(validityForSend, remainingForSend)) {
    throw new TransactionExpiredBeforeSubmitError(
      latest.blockhash,
      signedBlockhash,
      remainingForSend
    );
  }

  let signature: TransactionSignature;
  try {
    signature = await sendRawTransaction(raw, sendOptions());
  } catch (err) {
    throw err;
  }

  const confirmation = await confirmSignature(deps.connection, signature);
  throwIfNotConfirmed(confirmation);
  return signature;
}

export async function sendV2Method(
  program: {
    provider: {
      connection: Connection;
      wallet?: V2SendWallet | null;
    };
  },
  builder: { transaction: () => Promise<Transaction> }
): Promise<TransactionSignature> {
  const wallet = program.provider.wallet;
  if (!wallet) {
    throw new Error("wallet is not connected");
  }
  const transaction = await builder.transaction();
  return sendV2Transaction(transaction, {
    connection: program.provider.connection,
    wallet,
  });
}
