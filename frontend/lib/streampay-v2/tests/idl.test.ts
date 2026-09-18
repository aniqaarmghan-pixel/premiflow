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
