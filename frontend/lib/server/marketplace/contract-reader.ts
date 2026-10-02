import type { ContractStatus } from "@/lib/streampay-v2";

import { HttpError } from "../http";
import {
  ContractSnapshotError,
  connectionSnapshotReader,
  readContractSnapshot,
} from "../solana/read-contract-snapshot";

/** Minimal on-chain facts the marketplace trusts (never browser-supplied). */
export type ContractFacts = {
  address: string;
  employer: string;
  freelancer: string;
  status: ContractStatus;
};

export type ContractFactsReader = (contractAddress: string) => Promise<ContractFacts>;

export function contractReadError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof ContractSnapshotError) {
    if (err.code === "invalid_address") {
      return new HttpError(400, "invalid_marketplace_input", "Contract address is invalid.");
    }
    if (err.code === "rpc_failure") {
      return new HttpError(503, "contract_unavailable", "Could not read the contract right now. Try again.");
    }
    return new HttpError(404, "contract_not_found", "No PREMIFLOW contract exists at that address.");
  }
  return new HttpError(503, "contract_unavailable", "Could not read the contract right now. Try again.");
}

/** Read-only RPC reader built on the existing contract snapshot decoder. */
export function snapshotFactsReader(rpcUrl: string): ContractFactsReader {
  const reader = connectionSnapshotReader(rpcUrl);
  return async (contractAddress) => {
    try {
      const snapshot = await readContractSnapshot(reader, contractAddress);
      return {
        address: snapshot.address,
        employer: snapshot.facts.employer,
        freelancer: snapshot.facts.freelancer,
        status: snapshot.facts.status,
      };
    } catch (err) {
      throw contractReadError(err);
    }
  };
}
