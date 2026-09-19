import { PublicKey } from "@solana/web3.js";

import { u32ToLeBytes, u64ToLeBytes } from "./bytes";
import {
  CONTRACT_ESCROW_SEED,
  CONTRACT_SEED,
  HOURLY_SESSION_SEED,
  HOURLY_STATE_SEED,
  STREAMPAY_PROGRAM_ID,
  TRIAL_UNIT_SEED,
  WORK_UNIT_SEED,
} from "./constants";

export type Pda = {
  address: PublicKey;
  bump: number;
};

function findPda(seeds: Array<Buffer | Uint8Array>, programId: PublicKey): Pda {
  const [address, bump] = PublicKey.findProgramAddressSync(seeds, programId);
  return { address, bump };
}

export function deriveContractPda(
  employer: PublicKey,
  freelancer: PublicKey,
  contractId: bigint,
  programId: PublicKey = STREAMPAY_PROGRAM_ID
): Pda {
  return findPda(
    [
      CONTRACT_SEED,
      employer.toBuffer(),
      freelancer.toBuffer(),
      u64ToLeBytes(contractId),
    ],
    programId
  );
}

export function deriveContractEscrowPda(
  contract: PublicKey,
  programId: PublicKey = STREAMPAY_PROGRAM_ID
): Pda {
  return findPda([CONTRACT_ESCROW_SEED, contract.toBuffer()], programId);
}

export function deriveWorkUnitPda(
  contract: PublicKey,
  index: number,
  programId: PublicKey = STREAMPAY_PROGRAM_ID
): Pda {
  return findPda(
    [WORK_UNIT_SEED, contract.toBuffer(), u32ToLeBytes(index)],
    programId
  );
}

/** Fixed-price main deliverable lives at work-unit index 0. */
export function deriveFixedWorkUnitPda(
  contract: PublicKey,
  programId: PublicKey = STREAMPAY_PROGRAM_ID
): Pda {
  return deriveWorkUnitPda(contract, 0, programId);
}

/** Milestone WorkUnit at the given index (0-based, assigned by the program). */
export function deriveMilestoneWorkUnitPda(
  contract: PublicKey,
  index: number,
  programId: PublicKey = STREAMPAY_PROGRAM_ID
): Pda {
  return deriveWorkUnitPda(contract, index, programId);
}

export function deriveTrialWorkUnitPda(
  contract: PublicKey,
  programId: PublicKey = STREAMPAY_PROGRAM_ID
): Pda {
  return findPda([TRIAL_UNIT_SEED, contract.toBuffer()], programId);
}

/** Hourly labor-clock PDA: `[hourly_state, contract]`. */
export function deriveHourlyStatePda(
  contract: PublicKey,
  programId: PublicKey = STREAMPAY_PROGRAM_ID
): Pda {
  return findPda([HOURLY_STATE_SEED, contract.toBuffer()], programId);
}

/** Hourly session PDA: `[hourly_session, contract, index_le]`. */
export function deriveHourlySessionPda(
  contract: PublicKey,
  sessionIndex: number,
  programId: PublicKey = STREAMPAY_PROGRAM_ID
): Pda {
  return findPda(
    [HOURLY_SESSION_SEED, contract.toBuffer(), u32ToLeBytes(sessionIndex)],
    programId
  );
}

export function deriveContractAddresses(
  employer: PublicKey,
  freelancer: PublicKey,
  contractId: bigint,
  programId: PublicKey = STREAMPAY_PROGRAM_ID
): {
  contract: Pda;
  escrow: Pda;
  trialWorkUnit: Pda;
  fixedWorkUnit: Pda;
} {
  const contract = deriveContractPda(
    employer,
    freelancer,
    contractId,
    programId
  );
  return {
    contract,
    escrow: deriveContractEscrowPda(contract.address, programId),
    trialWorkUnit: deriveTrialWorkUnitPda(contract.address, programId),
    fixedWorkUnit: deriveFixedWorkUnitPda(contract.address, programId),
  };
}
