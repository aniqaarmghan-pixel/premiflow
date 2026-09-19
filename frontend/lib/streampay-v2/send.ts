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

export type V2SendDeps = {
  connection: Connection;
  wallet: V2SendWallet;
  getLatestBlockhash?: (commitment: Commitment) => Promise<LatestBlockhash>;
  sendRawTransaction?: (
    raw: Buffer | Uint8Array | number[],
    options: SendOptions
  ) => Promise<TransactionSignature>;
  confirmSignature?: (
    connection: Connection,
    signature: string
  ) => Promise<ConfirmSignatureOutcome>;
};

export function isLegacyTransaction(
  tx: Transaction | VersionedTransaction
): tx is Transaction {
  return Array.isArray((tx as Transaction).instructions);
}

function sendOptions(): SendOptions {
  return {
    preflightCommitment: V2_SEND_COMMITMENT,
  };
}

/**
 * Fresh confirmed blockhash immediately before the one wallet signature,
 * then one HTTP send + HTTP confirmation. Never resends. Never skipPreflight.
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

  const signed = await deps.wallet.signTransaction(transaction);

  let signature: TransactionSignature;
  try {
    signature = await sendRawTransaction(signed.serialize(), sendOptions());
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
