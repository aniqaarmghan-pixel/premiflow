import { Connection, PublicKey } from "@solana/web3.js";

import { CANONICAL_PROGRAM_ID } from "@/lib/streampay-v2/constants";

import type { ResolveTxVerdict, ResolveTxVerifier } from "../cases/resolve-signature";

export type ResolveTxFacts = {
  err: unknown;
  accountKeys: readonly string[];
  numRequiredSignatures: number;
};

/** Pure check: succeeded, resolver is a signer, contract and program are referenced. */
export function resolveTxVerdict(
  tx: ResolveTxFacts | null,
  expect: { contract: string; resolver: string; programId?: string }
): ResolveTxVerdict {
  if (!tx) return "not_found";
  if (tx.err != null) return "failed";
  const signerIndex = tx.accountKeys.indexOf(expect.resolver);
  if (signerIndex < 0 || signerIndex >= tx.numRequiredSignatures) return "mismatch";
  if (!tx.accountKeys.includes(expect.contract)) return "mismatch";
  if (expect.programId && !tx.accountKeys.includes(expect.programId)) return "mismatch";
  return "ok";
}

export function connectionResolveTxVerifier(rpcUrl: string): ResolveTxVerifier {
  return async (signature, expect) => {
    const connection = new Connection(rpcUrl, "confirmed");
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return "not_found";
    const message = tx.transaction.message;
    return resolveTxVerdict(
      {
        err: tx.meta?.err ?? null,
        accountKeys: message.staticAccountKeys.map((key) => key.toBase58()),
        numRequiredSignatures: message.header.numRequiredSignatures,
      },
      { ...expect, programId: new PublicKey(CANONICAL_PROGRAM_ID).toBase58() }
    );
  };
}
