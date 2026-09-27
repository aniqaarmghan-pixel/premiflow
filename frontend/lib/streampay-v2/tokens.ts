import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";

import { STREAMPAY_PROGRAM_ID } from "./constants";
import { deriveContractEscrowPda } from "./pda";

export type TokenAccounts = {
  mint: PublicKey;
  employerSource: PublicKey;
  freelancerDestination: PublicKey;
  employerRefundDestination: PublicKey;
  escrow: PublicKey;
};

/**
 * Classic SPL Token ATA. Token-2022 is intentionally unsupported.
 */
export function deriveAta(
  owner: PublicKey,
  mint: PublicKey,
  allowOwnerOffCurve = false
): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

export function deriveEmployerSourceAta(
  employer: PublicKey,
  mint: PublicKey
): PublicKey {
  return deriveAta(employer, mint, false);
}

export function deriveFreelancerDestinationAta(
  freelancer: PublicKey,
  mint: PublicKey
): PublicKey {
  return deriveAta(freelancer, mint, false);
}

/**
 * Idempotent ATA create for the default freelancer withdraw destination.
 * Returns null when withdraw targets a caller-supplied non-ATA account.
 * Same instruction is used whether the ATA already exists or not.
 */
export function freelancerWithdrawAtaCreateInstruction(input: {
  payer: PublicKey;
  freelancer: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
}): TransactionInstruction | null {
  const ata = deriveFreelancerDestinationAta(input.freelancer, input.mint);
  if (!ata.equals(input.destination)) return null;
  return createAssociatedTokenAccountIdempotentInstruction(
    input.payer,
    ata,
    input.freelancer,
    input.mint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

export function deriveEmployerRefundAta(
  employer: PublicKey,
  mint: PublicKey
): PublicKey {
  return deriveAta(employer, mint, false);
}

export function deriveEscrowTokenAccount(
  contract: PublicKey,
  programId: PublicKey = STREAMPAY_PROGRAM_ID
): PublicKey {
  return deriveContractEscrowPda(contract, programId).address;
}

/**
 * Default token accounts for a contract. The program accepts any classic SPL
 * token account of the mint owned by the party; ATAs are the UI default.
 * Callers may override source/destination accounts.
 */
export function defaultTokenAccounts(params: {
  mint: PublicKey;
  employer: PublicKey;
  freelancer: PublicKey;
  contract: PublicKey;
  employerSource?: PublicKey;
  freelancerDestination?: PublicKey;
  employerRefundDestination?: PublicKey;
  programId?: PublicKey;
}): TokenAccounts {
  return {
    mint: params.mint,
    employerSource:
      params.employerSource ?? deriveEmployerSourceAta(params.employer, params.mint),
    freelancerDestination:
      params.freelancerDestination ??
      deriveFreelancerDestinationAta(params.freelancer, params.mint),
    employerRefundDestination:
      params.employerRefundDestination ??
      deriveEmployerRefundAta(params.employer, params.mint),
    escrow: deriveEscrowTokenAccount(
      params.contract,
      params.programId ?? STREAMPAY_PROGRAM_ID
    ),
  };
}

export { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };
