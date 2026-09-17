import { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { Connection } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";

import { idl } from "./streampay";

export function getStreamPayProgram(
  connection: Connection,
  wallet: AnchorWallet
) {
  const provider = new AnchorProvider(
    connection,
    wallet,
    AnchorProvider.defaultOptions()
  );

  return new Program(idl, provider);
}
