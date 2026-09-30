import { AnchorProvider, Program, type Provider } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import {
  Transaction,
  VersionedTransaction,
  type ConfirmOptions,
  type Connection,
  type PublicKey,
  type Signer,
  type TransactionSignature,
} from "@solana/web3.js";

import { STREAMPAY_PROGRAM_ID } from "./constants";
import { sendV2Transaction } from "./send";
import type { Streampay } from "./idl/streampay";
import idlJson from "./idl/streampay.json";

export type StreamPayV2Program = Program<Streampay>;
export type StreamPayV2Idl = Streampay;

export const streampayIdl = idlJson as Streampay;

const V2_PROVIDER_OPTIONS = {
  commitment: "confirmed" as const,
  preflightCommitment: "confirmed" as const,
};

function isVersionedTransaction(
  tx: Transaction | VersionedTransaction
): tx is VersionedTransaction {
  return "version" in tx;
}

/**
 * Keep leftover `.rpc()` calls on the same HTTP send + HTTP confirm path.
 * Instruction builders should prefer `sendV2Method` so blockhash is attached
 * immediately before the one wallet signature.
 */
export function bindHttpSendAndConfirm(provider: AnchorProvider): AnchorProvider {
  provider.sendAndConfirm = async (
    tx: Transaction | VersionedTransaction,
    signers?: Signer[],
    _opts?: ConfirmOptions
  ): Promise<TransactionSignature> => {
    if (isVersionedTransaction(tx)) {
      if (signers?.length) tx.sign(signers);
    } else if (signers) {
      for (const signer of signers) {
        tx.partialSign(signer);
      }
    }
    return sendV2Transaction(tx, {
      connection: provider.connection,
      wallet: provider.wallet,
    });
  };
  return provider;
}

export function getStreamPayV2Provider(
  connection: Connection,
  wallet: AnchorWallet
): AnchorProvider {
  return bindHttpSendAndConfirm(
    new AnchorProvider(connection, wallet, V2_PROVIDER_OPTIONS)
  );
}

export function getStreamPayV2Program(
  connection: Connection,
  wallet: AnchorWallet
): StreamPayV2Program {
  return getStreamPayV2ProgramFromProvider(
    getStreamPayV2Provider(connection, wallet)
  );
}

/**
 * Read-only PREMIFLOW program client.
 *
 * This client deliberately has no wallet and no transaction-sending methods.
 * It is safe for account discovery such as loading contracts for a verified
 * linked wallet while Phantom is disconnected.
 */
export function getStreamPayV2ReadOnlyProgram(
  connection: Connection
): StreamPayV2Program {
  const provider: Provider = { connection };
  const program = new Program(
    streampayIdl,
    provider
  ) as StreamPayV2Program;

  assertProgramId(program.programId);
  return program;
}

export function getStreamPayV2ProgramFromProvider(
  provider: AnchorProvider
): StreamPayV2Program {
  bindHttpSendAndConfirm(provider);
  const program = new Program(streampayIdl, provider) as StreamPayV2Program;
  if (!program.programId.equals(STREAMPAY_PROGRAM_ID)) {
    throw new Error(
      `Program client ID ${program.programId.toBase58()} does not match ${STREAMPAY_PROGRAM_ID.toBase58()}`
    );
  }
  return program;
}

export function assertProgramId(programId: PublicKey): void {
  if (!programId.equals(STREAMPAY_PROGRAM_ID)) {
    throw new Error(
      `Unexpected StreamPay program ID ${programId.toBase58()}`
    );
  }
}
