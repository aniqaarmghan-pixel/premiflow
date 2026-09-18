import { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import type { Connection, PublicKey } from "@solana/web3.js";

import { STREAMPAY_PROGRAM_ID } from "./constants";
import type { Streampay } from "./idl/streampay";
import idlJson from "./idl/streampay.json";

export type StreamPayV2Program = Program<Streampay>;
export type StreamPayV2Idl = Streampay;

export const streampayIdl = idlJson as Streampay;

export function getStreamPayV2Provider(
  connection: Connection,
  wallet: AnchorWallet
): AnchorProvider {
  return new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
}

export function getStreamPayV2Program(
  connection: Connection,
  wallet: AnchorWallet
): StreamPayV2Program {
  return getStreamPayV2ProgramFromProvider(
    getStreamPayV2Provider(connection, wallet)
  );
}

export function getStreamPayV2ProgramFromProvider(
  provider: AnchorProvider
): StreamPayV2Program {
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
