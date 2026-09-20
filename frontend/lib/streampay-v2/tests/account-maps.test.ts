import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PublicKey } from "@solana/web3.js";

import { HOURLY_NO_ACTIVE_SESSION, STREAMPAY_PROGRAM_ID } from "../constants";
import {
  cancelActiveContractAccounts,
  claimEmployerRefundAccounts,
  openDisputeAccounts,
  resolveOpenDisputeHourlyOptionals,
  withdrawFreelancerAccounts,
} from "../instructions";
import { deriveHourlySessionPda, deriveHourlyStatePda } from "../pda";
import { TOKEN_PROGRAM_ID } from "../tokens";
import { MINT, WALLET_A, WALLET_B, WALLET_C } from "./fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));
const instructionsSrc = fs.readFileSync(
  path.join(here, "../instructions.ts"),
  "utf8"
);

const ESCROW = new PublicKey("SysvarC1ock11111111111111111111111111111111");
const FREELANCER_ATA = WALLET_B;
const EMPLOYER_ATA = WALLET_A;

test("withdrawFreelancer account map always includes classic tokenProgram", () => {
  const map = withdrawFreelancerAccounts({
    freelancer: WALLET_B,
    contract: WALLET_C,
    tokenMint: MINT,
    contractEscrow: ESCROW,
    freelancerTokenAccount: FREELANCER_ATA,
  });
  assert.equal(map.tokenProgram.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.deepEqual(Object.keys(map).sort(), [
    "contract",
    "contractEscrow",
    "freelancer",
    "freelancerTokenAccount",
    "tokenMint",
    "tokenProgram",
  ]);
  assert.match(instructionsSrc, /withdrawFreelancerAccounts\(/);
  assert.doesNotMatch(
    methodSource("withdrawFreelancer"),
    /\.\.\.\s*\{[^}]*tokenProgram/
  );
});

test("claimEmployerRefund account map always includes classic tokenProgram", () => {
  const map = claimEmployerRefundAccounts({
    employer: WALLET_A,
    contract: WALLET_C,
    tokenMint: MINT,
    contractEscrow: ESCROW,
    employerTokenAccount: EMPLOYER_ATA,
  });
  assert.equal(map.tokenProgram.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.deepEqual(Object.keys(map).sort(), [
    "contract",
    "contractEscrow",
    "employer",
    "employerTokenAccount",
    "tokenMint",
    "tokenProgram",
  ]);
  assert.match(instructionsSrc, /claimEmployerRefundAccounts\(/);
});

test("non-Hourly openDispute keeps Hourly optionals as explicit nulls", () => {
  const optionals = resolveOpenDisputeHourlyOptionals({
    paymentMode: "Fixed",
    contract: WALLET_C,
    programId: STREAMPAY_PROGRAM_ID,
  });
  assert.equal(optionals.hourlyState, null);
  assert.equal(optionals.hourlySession, null);

  const map = openDisputeAccounts({
    party: WALLET_A,
    contract: WALLET_C,
    hourlyState: optionals.hourlyState,
    hourlySession: optionals.hourlySession,
  });
  assert.ok("hourlyState" in map);
  assert.ok("hourlySession" in map);
  assert.equal(map.hourlyState, null);
  assert.equal(map.hourlySession, null);
  assert.deepEqual(Object.keys(map).sort(), [
    "contract",
    "hourlySession",
    "hourlyState",
    "party",
  ]);
});

test("Hourly openDispute without an Open session passes state PDA and null session", () => {
  const optionals = resolveOpenDisputeHourlyOptionals({
    paymentMode: "Hourly",
    contract: WALLET_C,
    programId: STREAMPAY_PROGRAM_ID,
    activeSessionIndex: HOURLY_NO_ACTIVE_SESSION,
  });
  const expectedState = deriveHourlyStatePda(
    WALLET_C,
    STREAMPAY_PROGRAM_ID
  ).address;
  assert.equal(optionals.hourlyState?.toBase58(), expectedState.toBase58());
  assert.equal(optionals.hourlySession, null);

  const map = openDisputeAccounts({
    party: WALLET_B,
    contract: WALLET_C,
    hourlyState: optionals.hourlyState,
    hourlySession: optionals.hourlySession,
  });
  assert.ok("hourlySession" in map);
  assert.equal(map.hourlySession, null);
  assert.equal(map.hourlyState?.toBase58(), expectedState.toBase58());
});

test("Hourly openDispute with an Open session passes both derived PDAs", () => {
  const sessionIndex = 2;
  const optionals = resolveOpenDisputeHourlyOptionals({
    paymentMode: "Hourly",
    contract: WALLET_C,
    programId: STREAMPAY_PROGRAM_ID,
    activeSessionIndex: sessionIndex,
  });
  const expectedState = deriveHourlyStatePda(
    WALLET_C,
    STREAMPAY_PROGRAM_ID
  ).address;
  const expectedSession = deriveHourlySessionPda(
    WALLET_C,
    sessionIndex,
    STREAMPAY_PROGRAM_ID
  ).address;
  assert.equal(optionals.hourlyState?.toBase58(), expectedState.toBase58());
  assert.equal(optionals.hourlySession?.toBase58(), expectedSession.toBase58());

  const map = openDisputeAccounts({
    party: WALLET_A,
    contract: WALLET_C,
    hourlyState: optionals.hourlyState,
    hourlySession: optionals.hourlySession,
  });
  assert.equal(map.hourlyState?.toBase58(), expectedState.toBase58());
  assert.equal(map.hourlySession?.toBase58(), expectedSession.toBase58());
});

test("cancelActiveContract keeps Hourly optional as an explicit key", () => {
  const absent = cancelActiveContractAccounts({
    employer: WALLET_A,
    contract: WALLET_C,
    hourlyState: null,
  });
  assert.ok("hourlyState" in absent);
  assert.equal(absent.hourlyState, null);

  const hourlyState = deriveHourlyStatePda(
    WALLET_C,
    STREAMPAY_PROGRAM_ID
  ).address;
  const present = cancelActiveContractAccounts({
    employer: WALLET_A,
    contract: WALLET_C,
    hourlyState,
  });
  assert.equal(present.hourlyState?.toBase58(), hourlyState.toBase58());
  assert.match(instructionsSrc, /cancelActiveContractAccounts\(/);
});

test("Milestone and Streaming disputes use the same explicit-null Hourly keys", () => {
  for (const paymentMode of ["Milestone", "Streaming"] as const) {
    const map = openDisputeAccounts({
      party: WALLET_A,
      contract: WALLET_C,
      ...resolveOpenDisputeHourlyOptionals({
        paymentMode,
        contract: WALLET_C,
        programId: STREAMPAY_PROGRAM_ID,
      }),
    });
    assert.equal(map.hourlyState, null);
    assert.equal(map.hourlySession, null);
  }
});

function methodSource(name: string): string {
  const start = instructionsSrc.indexOf(`async ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const next = instructionsSrc.indexOf("\n  async ", start + 1);
  return instructionsSrc.slice(start, next === -1 ? undefined : next);
}
