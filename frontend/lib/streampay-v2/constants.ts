import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import idl from "./idl/streampay.json";

/** Canonical StreamPay program ID from `declare_id!` / generated IDL. */
export const CANONICAL_PROGRAM_ID =
  "EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd";

const idlAddress = (idl as { address: string }).address;

if (idlAddress !== CANONICAL_PROGRAM_ID) {
  throw new Error(
    `StreamPay V2 IDL program ID mismatch: IDL has ${idlAddress}, expected ${CANONICAL_PROGRAM_ID}`
  );
}

export const STREAMPAY_PROGRAM_ID = new PublicKey(idlAddress);

export const SPL_TOKEN_PROGRAM_ID = TOKEN_PROGRAM_ID;

/** Rust `CONTRACT_SEED` = b"contract" */
export const CONTRACT_SEED = new TextEncoder().encode("contract");

/** Rust `CONTRACT_ESCROW_SEED` = b"contract_escrow" */
export const CONTRACT_ESCROW_SEED = new TextEncoder().encode("contract_escrow");

/** Rust `WORK_UNIT_SEED` = b"work_unit" */
export const WORK_UNIT_SEED = new TextEncoder().encode("work_unit");

/** Rust `TRIAL_UNIT_SEED` = b"trial_unit" */
export const TRIAL_UNIT_SEED = new TextEncoder().encode("trial_unit");

export const V2_LAYOUT_VERSION = 1;
export const MAX_URI_LEN = 200;
export const MAX_MILESTONES = 64;
export const MAX_CHECKPOINTS = 1024;
export const MAX_REVISIONS_LIMIT = 5;
export const MAX_ACCEPTANCE_WINDOW = 7_776_000;
export const MIN_DURATION_SECONDS = 60;
export const MAX_DURATION_SECONDS = 157_680_000;
export const MIN_REVIEW_DURATION = 10;
export const MAX_REVIEW_DURATION = 2_592_000;
export const MIN_ACTIVATION_REVIEW = 60;
export const MAX_ACTIVATION_REVIEW = 86_400;

/**
 * Contract account memcmp offsets after the 8-byte Anchor discriminator.
 * Documented as permanently stable in `programs/streampay/src/v2/state/contract.rs`.
 */
export const CONTRACT_ACCOUNT = {
  discriminatorOffset: 0,
  versionOffset: 8,
  employerOffset: 9,
  freelancerOffset: 41,
  tokenMintOffset: 73,
} as const;

/**
 * WorkUnit `contract` field sits at offset 9 (disc 8 + version 1).
 * Documented as permanently stable in `work_unit.rs`.
 */
export const WORK_UNIT_ACCOUNT = {
  discriminatorOffset: 0,
  versionOffset: 8,
  contractOffset: 9,
} as const;
