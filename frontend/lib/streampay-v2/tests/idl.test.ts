import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CANONICAL_PROGRAM_ID } from "../constants";
import { REQUIRED_V2_INSTRUCTIONS } from "../idl-required";
import idl from "../idl/streampay.json";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");

test("generated IDL contains every required V2 instruction", () => {
  const names = new Set(
    (idl as { instructions: Array<{ name: string }> }).instructions.map(
      (ix) => ix.name
    )
  );
  const missing = REQUIRED_V2_INSTRUCTIONS.filter((name) => !names.has(name));
  assert.deepEqual(
    missing,
    [],
    `IDL is missing V2 instructions (possible stale V1 IDL): ${missing.join(", ")}`
  );
});

test("IDL is not the V1-only stream program surface", () => {
  const names = (idl as { instructions: Array<{ name: string }> }).instructions.map(
    (ix) => ix.name
  );
  assert.ok(names.includes("create_contract"));
  assert.ok(names.includes("complete_contract"));
  assert.ok(names.includes("create_stream"), "V1 instructions remain additive");
  assert.ok(
    names.length > 5,
    `IDL only has ${names.length} instructions; expected full V1+V2 set`
  );
});

test("program ID agrees across declare_id, Anchor.toml, IDL, and client", () => {
  const idlAddress = (idl as { address: string }).address;
  assert.equal(idlAddress, CANONICAL_PROGRAM_ID);

  const libRs = fs.readFileSync(
    path.join(repoRoot, "programs/streampay/src/lib.rs"),
    "utf8"
  );
  const declare = libRs.match(/declare_id!\("([^"]+)"\)/);
  assert.ok(declare, "declare_id! not found");
  assert.equal(declare[1], CANONICAL_PROGRAM_ID);

  const anchorToml = fs.readFileSync(
    path.join(repoRoot, "Anchor.toml"),
    "utf8"
  );
  assert.match(
    anchorToml,
    new RegExp(`streampay\\s*=\\s*"${CANONICAL_PROGRAM_ID}"`)
  );

  const frontendV1 = fs.readFileSync(
    path.join(repoRoot, "frontend/lib/streampay.ts"),
    "utf8"
  );
  assert.ok(frontendV1.includes(CANONICAL_PROGRAM_ID));
});

type IdlAccount = { name: string; optional?: boolean; signer?: boolean };
type IdlInstruction = { name: string; accounts: IdlAccount[] };

function instructionAccounts(name: string): IdlAccount[] {
  const ix = (idl as { instructions: IdlInstruction[] }).instructions.find(
    (item) => item.name === name
  );
  assert.ok(ix, `IDL missing instruction ${name}`);
  return ix.accounts;
}

test("withdraw_freelancer and claim_employer_refund require token_program", () => {
  for (const name of ["withdraw_freelancer", "claim_employer_refund"] as const) {
    const tokenProgram = instructionAccounts(name).find(
      (account) => account.name === "token_program"
    );
    assert.ok(tokenProgram, `${name} missing token_program`);
    assert.notEqual(tokenProgram.optional, true);
  }
});

test("open_dispute Hourly accounts are optional in the IDL", () => {
  const accounts = instructionAccounts("open_dispute");
  const hourlyState = accounts.find((account) => account.name === "hourly_state");
  const hourlySession = accounts.find(
    (account) => account.name === "hourly_session"
  );
  assert.equal(hourlyState?.optional, true);
  assert.equal(hourlySession?.optional, true);
});

test("cancel_active_contract Hourly state is optional in the IDL", () => {
  const hourlyState = instructionAccounts("cancel_active_contract").find(
    (account) => account.name === "hourly_state"
  );
  assert.equal(hourlyState?.optional, true);
});

test("finalize_trial_review_timeout is permissionless and has no token accounts", () => {
  const accounts = instructionAccounts("finalize_trial_review_timeout");
  assert.deepEqual(
    accounts.map((account) => account.name),
    ["caller", "contract", "trial_work_unit"]
  );
  assert.equal(accounts[0]?.signer, true);
  assert.ok(!accounts.some((account) => account.name.includes("token")));
  const names = new Set(
    (idl as { instructions: Array<{ name: string }> }).instructions.map((ix) => ix.name)
  );
  assert.ok(names.has("settle_trial_and_end"));
  assert.ok(names.has("finalize_review_timeout"));
});
