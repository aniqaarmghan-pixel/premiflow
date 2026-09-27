import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SystemProgram } from "@solana/web3.js";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  deriveFreelancerDestinationAta,
  freelancerWithdrawAtaCreateInstruction,
} from "../tokens";
import { MINT, WALLET_A, WALLET_B } from "./fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));
const instructionsSrc = fs.readFileSync(
  path.join(here, "../instructions.ts"),
  "utf8"
);

function withdrawMethodSource(): string {
  const start = instructionsSrc.indexOf("async withdrawFreelancer(");
  assert.notEqual(start, -1, "withdrawFreelancer not found");
  const next = instructionsSrc.indexOf("\n  async ", start + 1);
  return instructionsSrc.slice(start, next === -1 ? undefined : next);
}

function assertIdempotentFreelancerAtaCreate(
  ix: NonNullable<ReturnType<typeof freelancerWithdrawAtaCreateInstruction>>,
  payer: typeof WALLET_B,
  freelancer: typeof WALLET_B
) {
  const ata = deriveFreelancerDestinationAta(freelancer, MINT);
  assert.equal(ix.programId.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
  assert.equal(ix.data[0], 1, "ATA create must be idempotent (ix 1), not create (ix 0)");
  assert.equal(ix.keys[0]?.pubkey.toBase58(), payer.toBase58());
  assert.equal(ix.keys[0]?.isSigner, true);
  assert.equal(ix.keys[1]?.pubkey.toBase58(), ata.toBase58());
  assert.equal(ix.keys[2]?.pubkey.toBase58(), freelancer.toBase58());
  assert.equal(ix.keys[3]?.pubkey.toBase58(), MINT.toBase58());
  assert.equal(ix.keys[4]?.pubkey.toBase58(), SystemProgram.programId.toBase58());
  assert.equal(ix.keys[5]?.pubkey.toBase58(), TOKEN_PROGRAM_ID.toBase58());
}

test("missing freelancer ATA still prepends idempotent create for the derived destination", () => {
  const freelancer = WALLET_B;
  const destination = deriveFreelancerDestinationAta(freelancer, MINT);
  const ix = freelancerWithdrawAtaCreateInstruction({
    payer: freelancer,
    freelancer,
    mint: MINT,
    destination,
  });
  assert.ok(ix, "derived ATA destination must include create-idempotent");
  assertIdempotentFreelancerAtaCreate(ix, freelancer, freelancer);
});

test("existing freelancer ATA uses the same idempotent create, not a skip or non-idempotent create", () => {
  const freelancer = WALLET_B;
  const destination = deriveFreelancerDestinationAta(freelancer, MINT);
  const missing = freelancerWithdrawAtaCreateInstruction({
    payer: freelancer,
    freelancer,
    mint: MINT,
    destination,
  });
  const existing = freelancerWithdrawAtaCreateInstruction({
    payer: freelancer,
    freelancer,
    mint: MINT,
    destination,
  });
  assert.ok(missing);
  assert.ok(existing);
  assert.equal(existing.data[0], 1);
  assert.deepEqual(existing.keys.map((k) => k.pubkey.toBase58()), missing.keys.map((k) => k.pubkey.toBase58()));
  assert.equal(existing.programId.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
  assert.equal(existing.keys[2]?.pubkey.toBase58(), freelancer.toBase58());
  assert.equal(existing.keys[3]?.pubkey.toBase58(), MINT.toBase58());
});

test("custom non-ATA withdraw destination does not invent a freelancer ATA create", () => {
  const ix = freelancerWithdrawAtaCreateInstruction({
    payer: WALLET_B,
    freelancer: WALLET_B,
    mint: MINT,
    destination: WALLET_A,
  });
  assert.equal(ix, null);
});

test("withdrawFreelancer still builds the withdraw instruction and prepends ATA create when needed", () => {
  const src = withdrawMethodSource();
  assert.match(src, /\.withdrawFreelancer\(\)/);
  assert.match(src, /freelancerWithdrawAtaCreateInstruction/);
  assert.match(src, /preInstructions\(\[ataCreate\]\)/);
  assert.match(src, /payer:\s*freelancer/);
  assert.match(src, /withdrawFreelancerAccounts\(/);
});
