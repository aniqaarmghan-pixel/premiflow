import { createHash } from "node:crypto";

import { Connection, PublicKey } from "@solana/web3.js";

import { CANONICAL_PROGRAM_ID, CONTRACT_ACCOUNT } from "@/lib/streampay-v2/constants";

export const CONTRACT_DISCRIMINATOR = new Uint8Array(
  createHash("sha256").update("account:Contract").digest().subarray(0, 8)
);

export const CONTRACT_MIN_LEN = CONTRACT_ACCOUNT.freelancerOffset + 32;

export type ContractParties = {
  employer: string;
  freelancer: string;
};

export type PartiesReadError =
  | "invalid_address"
  | "not_found"
  | "wrong_owner"
  | "bad_discriminator"
  | "too_short"
  | "rpc_failure";

export class ContractPartiesError extends Error {
  constructor(readonly code: PartiesReadError) {
    super(code);
    this.name = "ContractPartiesError";
  }
}

export type AccountSnapshot = {
  owner: string;
  data: Uint8Array;
};

export type AccountReader = {
  getAccountInfo(address: PublicKey): Promise<AccountSnapshot | null>;
};

export function decodeContractParties(account: AccountSnapshot): ContractParties {
  if (account.owner !== CANONICAL_PROGRAM_ID) {
    throw new ContractPartiesError("wrong_owner");
  }
  if (account.data.length < CONTRACT_MIN_LEN) {
    throw new ContractPartiesError("too_short");
  }
  const disc = account.data.subarray(0, 8);
  if (!CONTRACT_DISCRIMINATOR.every((byte, i) => disc[i] === byte)) {
    throw new ContractPartiesError("bad_discriminator");
  }
  const employer = new PublicKey(
    account.data.subarray(
      CONTRACT_ACCOUNT.employerOffset,
      CONTRACT_ACCOUNT.employerOffset + 32
    )
  ).toBase58();
  const freelancer = new PublicKey(
    account.data.subarray(
      CONTRACT_ACCOUNT.freelancerOffset,
      CONTRACT_ACCOUNT.freelancerOffset + 32
    )
  ).toBase58();
  return { employer, freelancer };
}

export async function readContractParties(
  reader: AccountReader,
  contractAddress: string
): Promise<ContractParties> {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(contractAddress);
  } catch {
    throw new ContractPartiesError("invalid_address");
  }
  let account: AccountSnapshot | null;
  try {
    account = await reader.getAccountInfo(pubkey);
  } catch {
    throw new ContractPartiesError("rpc_failure");
  }
  if (!account) throw new ContractPartiesError("not_found");
  return decodeContractParties(account);
}

export function connectionAccountReader(rpcUrl: string): AccountReader {
  const connection = new Connection(rpcUrl, "confirmed");
  return {
    async getAccountInfo(address) {
      const info = await connection.getAccountInfo(address, "confirmed");
      if (!info) return null;
      return {
        owner: info.owner.toBase58(),
        data: new Uint8Array(info.data),
      };
    },
  };
}
