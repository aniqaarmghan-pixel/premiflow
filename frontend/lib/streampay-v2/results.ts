import { PublicKey } from "@solana/web3.js";

export type TransactionResult = {
  signature: string;
  contract?: PublicKey;
  workUnit?: PublicKey;
  trialWorkUnit?: PublicKey;
  escrow?: PublicKey;
  accounts: Record<string, PublicKey>;
};

export function txResult(params: {
  signature: string;
  contract?: PublicKey;
  workUnit?: PublicKey;
  trialWorkUnit?: PublicKey;
  escrow?: PublicKey;
  extra?: Record<string, PublicKey>;
}): TransactionResult {
  const accounts: Record<string, PublicKey> = { ...(params.extra ?? {}) };
  if (params.contract) accounts.contract = params.contract;
  if (params.workUnit) accounts.workUnit = params.workUnit;
  if (params.trialWorkUnit) accounts.trialWorkUnit = params.trialWorkUnit;
  if (params.escrow) accounts.escrow = params.escrow;
  return {
    signature: params.signature,
    contract: params.contract,
    workUnit: params.workUnit,
    trialWorkUnit: params.trialWorkUnit,
    escrow: params.escrow,
    accounts,
  };
}
