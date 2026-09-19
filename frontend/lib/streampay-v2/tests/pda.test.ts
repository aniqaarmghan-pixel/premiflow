import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";

import { u32ToLeBytes, u64ToLeBytes } from "../bytes";
import {
  CANONICAL_PROGRAM_ID,
  CONTRACT_ESCROW_SEED,
  CONTRACT_SEED,
  HOURLY_SESSION_SEED,
  HOURLY_STATE_SEED,
  MAX_HOURLY_SESSION_SECONDS,
  MAX_HOURLY_SESSIONS,
  MIN_HOURLY_SESSION_SECONDS,
  STREAMPAY_PROGRAM_ID,
  TRIAL_UNIT_SEED,
  WORK_UNIT_SEED,
} from "../constants";
import {
  deriveContractEscrowPda,
  deriveContractPda,
  deriveFixedWorkUnitPda,
  deriveHourlySessionPda,
  deriveHourlyStatePda,
  deriveMilestoneWorkUnitPda,
  deriveTrialWorkUnitPda,
  deriveWorkUnitPda,
} from "../pda";

const EMPLOYER = new PublicKey("11111111111111111111111111111111");
const FREELANCER = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const OTHER_FREELANCER = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

function rustPda(
  seeds: Array<Buffer | Uint8Array>
): { address: PublicKey; bump: number } {
  const [address, bump] = PublicKey.findProgramAddressSync(
    seeds,
    STREAMPAY_PROGRAM_ID
  );
  return { address, bump };
}

test("program ID matches the canonical declare_id identity", () => {
  assert.equal(STREAMPAY_PROGRAM_ID.toBase58(), CANONICAL_PROGRAM_ID);
});

test("Contract PDA matches Rust seed layout [contract, employer, freelancer, id_le]", () => {
  const expected = rustPda([
    CONTRACT_SEED,
    EMPLOYER.toBuffer(),
    FREELANCER.toBuffer(),
    u64ToLeBytes(1n),
  ]);
  const actual = deriveContractPda(EMPLOYER, FREELANCER, 1n);
  assert.equal(actual.address.toBase58(), expected.address.toBase58());
  assert.equal(actual.bump, expected.bump);
});

test("trial PDA matches Rust seed layout [trial_unit, contract]", () => {
  const contract = deriveContractPda(EMPLOYER, FREELANCER, 7n).address;
  const expected = rustPda([TRIAL_UNIT_SEED, contract.toBuffer()]);
  const actual = deriveTrialWorkUnitPda(contract);
  assert.equal(actual.address.toBase58(), expected.address.toBase58());
  assert.equal(actual.bump, expected.bump);
});

test("Fixed WorkUnit PDA matches [work_unit, contract, index 0 le]", () => {
  const contract = deriveContractPda(EMPLOYER, FREELANCER, 2n).address;
  const expected = rustPda([
    WORK_UNIT_SEED,
    contract.toBuffer(),
    u32ToLeBytes(0),
  ]);
  const actual = deriveFixedWorkUnitPda(contract);
  assert.equal(actual.address.toBase58(), expected.address.toBase58());
  assert.deepEqual(actual, deriveWorkUnitPda(contract, 0));
});

test("milestone PDA matches [work_unit, contract, index le]", () => {
  const contract = deriveContractPda(EMPLOYER, FREELANCER, 3n).address;
  const expected = rustPda([
    WORK_UNIT_SEED,
    contract.toBuffer(),
    u32ToLeBytes(4),
  ]);
  const actual = deriveMilestoneWorkUnitPda(contract, 4);
  assert.equal(actual.address.toBase58(), expected.address.toBase58());
  assert.notEqual(
    deriveMilestoneWorkUnitPda(contract, 0).address.toBase58(),
    actual.address.toBase58()
  );
});

test("escrow PDA matches [contract_escrow, contract]", () => {
  const contract = deriveContractPda(EMPLOYER, FREELANCER, 9n).address;
  const expected = rustPda([CONTRACT_ESCROW_SEED, contract.toBuffer()]);
  const actual = deriveContractEscrowPda(contract);
  assert.equal(actual.address.toBase58(), expected.address.toBase58());
});

test("same contract ID for different employer/freelancer pair derives differently", () => {
  const a = deriveContractPda(EMPLOYER, FREELANCER, 42n);
  const b = deriveContractPda(EMPLOYER, OTHER_FREELANCER, 42n);
  const c = deriveContractPda(FREELANCER, EMPLOYER, 42n);
  assert.notEqual(a.address.toBase58(), b.address.toBase58());
  assert.notEqual(a.address.toBase58(), c.address.toBase58());
  assert.notEqual(b.address.toBase58(), c.address.toBase58());
});

test("HourlyState PDA matches Rust seed layout [hourly_state, contract]", () => {
  const contract = deriveContractPda(EMPLOYER, FREELANCER, 11n).address;
  const expected = rustPda([HOURLY_STATE_SEED, contract.toBuffer()]);
  const actual = deriveHourlyStatePda(contract);
  assert.equal(actual.address.toBase58(), expected.address.toBase58());
  assert.equal(actual.bump, expected.bump);
  assert.notEqual(actual.address.toBase58(), deriveTrialWorkUnitPda(contract).address.toBase58());
});

test("HourlySession PDA differs by little-endian session index", () => {
  const contract = deriveContractPda(EMPLOYER, FREELANCER, 12n).address;
  const zero = rustPda([
    HOURLY_SESSION_SEED,
    contract.toBuffer(),
    u32ToLeBytes(0),
  ]);
  const one = rustPda([
    HOURLY_SESSION_SEED,
    contract.toBuffer(),
    u32ToLeBytes(1),
  ]);
  assert.equal(deriveHourlySessionPda(contract, 0).address.toBase58(), zero.address.toBase58());
  assert.equal(deriveHourlySessionPda(contract, 1).address.toBase58(), one.address.toBase58());
  assert.notEqual(zero.address.toBase58(), one.address.toBase58());
  assert.notEqual(
    deriveHourlyStatePda(contract).address.toBase58(),
    zero.address.toBase58()
  );
});

test("Hourly architecture constants match the V1 protocol bounds", () => {
  assert.equal(MAX_HOURLY_SESSIONS, 64);
  assert.equal(MIN_HOURLY_SESSION_SECONDS, 60);
  assert.equal(MAX_HOURLY_SESSION_SECONDS, 28_800);
});

test("hardcoded Rust/web3 test vector for contract id 1", () => {
  const actual = deriveContractPda(EMPLOYER, FREELANCER, 1n);
  const expected = PublicKey.findProgramAddressSync(
    [
      Buffer.from("contract"),
      EMPLOYER.toBuffer(),
      FREELANCER.toBuffer(),
      Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]),
    ],
    new PublicKey("EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd")
  );
  assert.equal(actual.address.toBase58(), expected[0].toBase58());
  assert.equal(actual.bump, expected[1]);
});
