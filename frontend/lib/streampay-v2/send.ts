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
  "Your wallet approval took longer than this transaction's validity window (~60–90s on Solana). Nothing was submitted or charged. Approve promptly when Phantom opens, then try again.";

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
  /** Pre-sign height is not fetched (keeps Phantom open sooner). */
  fetchedBlockHeight: number | null;
  currentBlockHeight: number | null;
  remainingValidBlocks: number | null;
  isFetchedBlockhashValid: boolean | null;
  signWaitMs?: number;
  signedBlockhash?: string;
  signedMatchesFetched?: boolean;
  serializedBlockhash?: string;
  serializedMatchesFetched?: boolean;
  isSignedBlockhashValid?: boolean | null;
};

/** Timing/height fields captured for expire-before-submit diagnosis. */
export type ExpiredBeforeSubmitDiagnostics = {
  signWaitMs: number;
  lastValidBlockHeight: number;
  fetchedBlockHeight: number | null;
  postSignBlockHeight: number | null;
  remainingValidBlocks: number | null;
  isBlockhashValid: boolean | null;
};

/** Progress phases emitted by the shared send pipeline for UI status. */
export type SendPipelinePhase =
  | "preparing"
  | "awaiting_wallet"
  | "submitting"
  | "confirming";

export type SendPipelinePhaseHandler = (
  phase: SendPipelinePhase,
  detail?: { signature?: string }
) => void;

let sendPipelinePhaseHandler: SendPipelinePhaseHandler | undefined;

/** Subscribe to shared send-pipeline progress (cleared by the caller after a run). */
export function setSendPipelinePhaseHandler(
  handler: SendPipelinePhaseHandler | undefined
): void {
  sendPipelinePhaseHandler = handler;
}

function emitSendPipelinePhase(
  phase: SendPipelinePhase,
  detail?: { signature?: string }
): void {
  sendPipelinePhaseHandler?.(phase, detail);
}

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
  /** Override clock for tests. */
  nowMs?: () => number;
};

/** Signed locally, but the blockhash is already dead. Nothing was sent. */
export class TransactionExpiredBeforeSubmitError extends Error {
  readonly fetchedBlockhash: string;
  readonly signedBlockhash: string;
  readonly remainingValidBlocks: number | null;
  readonly signWaitMs: number;
  readonly lastValidBlockHeight: number;
  readonly fetchedBlockHeight: number | null;
  readonly postSignBlockHeight: number | null;
  readonly isBlockhashValid: boolean | null;

  constructor(
    fetchedBlockhash: string,
    signedBlockhash: string,
    remainingValidBlocks: number | null,
    diagnostics: ExpiredBeforeSubmitDiagnostics
  ) {
    super(TRANSACTION_EXPIRED_BEFORE_SUBMIT_MESSAGE);
    this.name = "TransactionExpiredBeforeSubmitError";
    this.fetchedBlockhash = fetchedBlockhash;
    this.signedBlockhash = signedBlockhash;
    this.remainingValidBlocks = remainingValidBlocks;
    this.signWaitMs = diagnostics.signWaitMs;
    this.lastValidBlockHeight = diagnostics.lastValidBlockHeight;
    this.fetchedBlockHeight = diagnostics.fetchedBlockHeight;
    this.postSignBlockHeight = diagnostics.postSignBlockHeight;
    this.isBlockhashValid = diagnostics.isBlockhashValid;
  }
}

/** Compact development-only line for failed-tx UI (never shown in production). */
export function formatExpiredBeforeSubmitDevDiagnostic(
  diagnostics: Pick<
    ExpiredBeforeSubmitDiagnostics,
    "signWaitMs" | "remainingValidBlocks" | "isBlockhashValid"
  >
): string {
  const seconds = (diagnostics.signWaitMs / 1000).toFixed(1);
  const remaining =
    diagnostics.remainingValidBlocks == null
      ? "unknown"
      : `${diagnostics.remainingValidBlocks} blocks`;
  const validity =
    diagnostics.isBlockhashValid === false
      ? "invalid"
      : diagnostics.isBlockhashValid === true
        ? "rpc-valid"
        : "unknown";
  return `Wallet approval: ${seconds}s · Remaining: ${remaining} · Blockhash: ${validity} · Threshold: ≤${BLOCKHASH_NEAR_EXPIRY_REMAINING} refused`;
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

function logDevSendTiming(payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[streampay-v2:send-timing]", payload);
}

/** Public, signature-free view of the exact message handed to the wallet. */
export type WalletHandoffDescription = {
  transactionType: "legacy";
  feePayer: string | null;
  recentBlockhash: string | null;
  requiredSignatures: number;
  accounts: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
  instructions: Array<{
    programId: string;
    accountIndexes: number[];
    dataLength: number;
  }>;
  messageBase64: string;
};

/**
 * Compiles a copy of the message; does not touch the transaction's signature
 * slots, so the wallet receives exactly what it would have without this call.
 */
export function describeWalletHandoff(
  transaction: Transaction
): WalletHandoffDescription {
  const message = transaction.compileMessage();
  return {
    transactionType: "legacy",
    feePayer: transaction.feePayer?.toBase58() ?? null,
    recentBlockhash: transaction.recentBlockhash ?? null,
    requiredSignatures: message.header.numRequiredSignatures,
    accounts: message.accountKeys.map((key, index) => ({
      pubkey: key.toBase58(),
      signer: message.isAccountSigner(index),
      writable: message.isAccountWritable(index),
    })),
    instructions: message.instructions.map((ix) => ({
      programId: message.accountKeys[ix.programIdIndex]!.toBase58(),
      accountIndexes: [...ix.accounts],
      dataLength: ix.data.length,
    })),
    messageBase64: Buffer.from(message.serialize()).toString("base64"),
  };
}

function logDevWalletHandoff(
  transaction: Transaction,
  latest: LatestBlockhash,
  blockhashAgeMs: number
): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[streampay-v2:wallet-handoff]", {
    ...describeWalletHandoff(transaction),
    lastValidBlockHeight: latest.lastValidBlockHeight,
    blockhashAgeMs,
    handoffAt: new Date().toISOString(),
  });
}

/**
 * Refuse to broadcast a signed transaction whose blockhash is dead or nearly dead.
 * Block-height arithmetic (lastValidBlockHeight - current height) is authoritative
 * when known: a lone isBlockhashValid=false from a lagging, load-balanced RPC node
 * must not discard a signature with plenty of validity left (preflight still
 * rejects a truly dead blockhash, with nothing charged). Only when the height is
 * unknown does the validity check decide.
 */
export function shouldRefuseExpiredSend(
  isValid: boolean | null,
  remaining: number | null
): boolean {
  if (remaining != null) return remaining <= BLOCKHASH_NEAR_EXPIRY_REMAINING;
  return isValid === false;
}

/**
 * Fresh confirmed blockhash immediately before the one wallet signature,
 * then one HTTP send + HTTP confirmation. Never resends. Never skipPreflight.
 * Does not send a signed transaction whose blockhash is already dead.
 *
 * Pre-sign height/validity RPCs are intentionally skipped: getLatestBlockhash
 * just returned the authoritative values, and those checks would only shrink
 * the user's Phantom approval window. Post-sign checks still refuse stale txs.
 */
export async function sendV2Transaction(
  transaction: Transaction | VersionedTransaction,
  deps: V2SendDeps
): Promise<TransactionSignature> {
  if (!isLegacyTransaction(transaction)) {
    throw new Error("V2 send helper expects a legacy Transaction");
  }

  const nowMs = deps.nowMs ?? Date.now;
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
  const blockhashFetchedAt = nowMs();
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;

  emitDiagnostics(deps.onBlockhashDiagnostics, {
    phase: "before_sign",
    fetchedBlockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    fetchedBlockHeight: null,
    currentBlockHeight: null,
    remainingValidBlocks: null,
    isFetchedBlockhashValid: null,
  });
  logDevWalletHandoff(transaction, latest, Math.max(0, nowMs() - blockhashFetchedAt));

  emitSendPipelinePhase("awaiting_wallet");
  const signStartedAt = nowMs();
  const signed = await deps.wallet.signTransaction(transaction);
  const signWaitMs = Math.max(0, nowMs() - signStartedAt);
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
    fetchedBlockHeight: null,
    currentBlockHeight: heightAfter,
    remainingValidBlocks: remainingAfter,
    isFetchedBlockhashValid: validFetchedAfter,
    signWaitMs,
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

  logDevSendTiming({
    signWaitMs,
    fetchedBlockHeight: null,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    postSignBlockHeight: heightAfter,
    remainingValidBlocks: remainingAfter,
    isBlockhashValid: validityForSend,
  });

  if (shouldRefuseExpiredSend(validityForSend, remainingForSend)) {
    throw new TransactionExpiredBeforeSubmitError(
      latest.blockhash,
      signedBlockhash,
      remainingForSend,
      {
        signWaitMs,
        lastValidBlockHeight: latest.lastValidBlockHeight,
        fetchedBlockHeight: null,
        postSignBlockHeight: heightAfter,
        remainingValidBlocks: remainingForSend,
        isBlockhashValid: validityForSend,
      }
    );
  }

  emitSendPipelinePhase("submitting");
  let signature: TransactionSignature;
  try {
    signature = await sendRawTransaction(raw, sendOptions());
  } catch (err) {
    throw err;
  }

  emitSendPipelinePhase("confirming", { signature });
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
  emitSendPipelinePhase("preparing");
  const transaction = await builder.transaction();
  return sendV2Transaction(transaction, {
    connection: program.provider.connection,
    wallet,
  });
}
