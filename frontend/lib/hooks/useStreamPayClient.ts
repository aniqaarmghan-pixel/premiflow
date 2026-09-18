"use client";

import { useMemo } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";

import { getStreamPayV2Program, StreamPayV2Client } from "@/lib/streampay-v2";

export function useStreamPayClient() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const program = getStreamPayV2Program(connection, wallet);
    return new StreamPayV2Client(program);
  }, [connection, wallet]);
}
