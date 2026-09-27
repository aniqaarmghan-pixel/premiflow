/**
 * Keypair → AnchorWallet adapter for StreamPayV2Client / sendV2Method.
 * Matches app architecture: signTransaction → sendRawTransaction (no Phantom).
 */

import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  Keypair,
  Transaction,
  VersionedTransaction,
  type PublicKey,
} from "@solana/web3.js";

function isVersioned(
  tx: Transaction | VersionedTransaction
): tx is VersionedTransaction {
  return "version" in tx;
}

export type KeypairWallet = AnchorWallet & {
  /** ed25519 message sign for production /api/auth/challenge verify (base64 later). */
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  payer: Keypair;
};

export function keypairToAnchorWallet(keypair: Keypair): KeypairWallet {
  const wallet: KeypairWallet = {
    payer: keypair,
    get publicKey(): PublicKey {
      return keypair.publicKey;
    },
    async signTransaction<T extends Transaction | VersionedTransaction>(
      tx: T
    ): Promise<T> {
      if (isVersioned(tx)) {
        tx.sign([keypair]);
        return tx;
      }
      tx.partialSign(keypair);
      return tx;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(
      txs: T[]
    ): Promise<T[]> {
      const out: T[] = [];
      for (const tx of txs) {
        out.push(await wallet.signTransaction(tx));
      }
      return out;
    },
    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      // Solana Keypair secretKey is 64 bytes (seed || pubkey); noble wants 32-byte seed.
      const seed = keypair.secretKey.slice(0, 32);
      return ed25519.sign(message, seed);
    },
  };
  return wallet;
}
