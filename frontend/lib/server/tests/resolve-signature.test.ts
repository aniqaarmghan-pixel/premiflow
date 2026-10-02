import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import { PREMIFLOW_RESOLVER } from "@/lib/app/premiflow";
import { createOrRecoverResolutionCase, getResolutionCase } from "../cases/service";
import {
  recordCaseResolveSignature,
  type ResolveTxVerdict,
  type ResolveTxVerifier,
} from "../cases/resolve-signature";
import { createMemoryCaseStore } from "../memory-stores";
import type { ContractCaseFacts, ContractFactsReader } from "../solana/read-contract-case-facts";
import { resolveTxVerdict } from "../solana/verify-resolve-tx";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const UNRELATED = WALLET_C.toBase58();
const RESOLVER_WALLET = PREMIFLOW_RESOLVER.address.toBase58();
const SIG = "5".repeat(88);
const OTHER_SIG = "4".repeat(88);

function facts(overrides: Partial<ContractCaseFacts> = {}): ContractCaseFacts {
  return {
    employer: EMPLOYER,
    freelancer: FREELANCER,
    resolver: RESOLVER_WALLET,
    status: "Disputed",
    paymentMode: "Fixed",
    disputeInitiator: "Employer",
    disputedAt: 1_700_000_100,
    terminatedAt: 0,
    contestedAmount: "90",
    freelancerSettlementAmount: "0",
    employerRefundableAmount: "0",
    releasedAmount: "10",
    withdrawnAmount: "0",
    refundedAmount: "0",
    ...overrides,
  };
}

function readerOf(value: ContractCaseFacts): ContractFactsReader {
  return { async read() { return value; } };
}

const RESOLVED = facts({
  status: "Resolved",
  terminatedAt: 1_700_000_500,
  freelancerSettlementAmount: "60",
  employerRefundableAmount: "30",
});

function verifier(verdict: ResolveTxVerdict = "ok") {
  const calls: string[] = [];
  const verify: ResolveTxVerifier = async (signature, expect) => {
    calls.push(`${signature}:${expect.contract}:${expect.resolver}`);
    return verdict;
  };
  return { verify, calls };
}

async function caseStore() {
  const cases = createMemoryCaseStore();
  await createOrRecoverResolutionCase({ cases }, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
  });
  return cases;
}

test("resolve signature: the on-chain resolver records a verified signature once", async () => {
  const cases = await caseStore();
  const { verify, calls } = verifier();
  const first = await recordCaseResolveSignature(cases, readerOf(RESOLVED), verify, {
    contractAddress: CONTRACT,
    sessionWallet: RESOLVER_WALLET,
    signature: SIG,
  });
  assert.deepEqual(first, { resolveSignature: SIG, recorded: true });
  assert.deepEqual(calls, [`${SIG}:${CONTRACT}:${RESOLVER_WALLET}`]);
  // Idempotent: the same signature again is a no-op without another RPC check.
  const again = await recordCaseResolveSignature(cases, readerOf(RESOLVED), verify, {
    contractAddress: CONTRACT,
    sessionWallet: RESOLVER_WALLET,
    signature: SIG,
  });
  assert.deepEqual(again, { resolveSignature: SIG, recorded: false });
  assert.equal(calls.length, 1);
  // Write-once: a different signature is rejected.
  await assert.rejects(
    recordCaseResolveSignature(cases, readerOf(RESOLVED), verify, {
      contractAddress: CONTRACT,
      sessionWallet: RESOLVER_WALLET,
      signature: OTHER_SIG,
    }),
    (err: { code?: string }) => err.code === "signature_already_recorded"
  );
  assert.equal((await cases.getCaseByContract(CONTRACT))?.resolveSignature, SIG);
});

test("resolve signature: employer, freelancer and unrelated wallets are rejected", async () => {
  const cases = await caseStore();
  for (const wallet of [EMPLOYER, FREELANCER, UNRELATED]) {
    const { verify, calls } = verifier();
    await assert.rejects(
      recordCaseResolveSignature(cases, readerOf(RESOLVED), verify, {
        contractAddress: CONTRACT,
        sessionWallet: wallet,
        signature: SIG,
      }),
      (err: Error) => err.name === "CaseAccessError"
    );
    assert.equal(calls.length, 0);
  }
  assert.equal((await cases.getCaseByContract(CONTRACT))?.resolveSignature, null);
});

test("resolve signature: rejected unless on-chain status is Resolved", async () => {
  const cases = await caseStore();
  for (const status of ["Disputed", "Active", "Completed", "Cancelled"] as const) {
    const { verify } = verifier();
    await assert.rejects(
      recordCaseResolveSignature(cases, readerOf(facts({ status })), verify, {
        contractAddress: CONTRACT,
        sessionWallet: RESOLVER_WALLET,
        signature: SIG,
      }),
      (err: { code?: string }) => err.code === "not_resolved"
    );
  }
  assert.equal((await cases.getCaseByContract(CONTRACT))?.resolveSignature, null);
});

test("resolve signature: invalid format and failed RPC verification are never stored", async () => {
  const cases = await caseStore();
  for (const bad of ["", "not-a-signature", "0".repeat(88), 42, null, "5".repeat(200)]) {
    await assert.rejects(
      recordCaseResolveSignature(cases, readerOf(RESOLVED), verifier().verify, {
        contractAddress: CONTRACT,
        sessionWallet: RESOLVER_WALLET,
        signature: bad,
      }),
      (err: Error) => err.name === "CaseValidationError"
    );
  }
  for (const verdict of ["not_found", "failed", "mismatch"] as const) {
    await assert.rejects(
      recordCaseResolveSignature(cases, readerOf(RESOLVED), verifier(verdict).verify, {
        contractAddress: CONTRACT,
        sessionWallet: RESOLVER_WALLET,
        signature: SIG,
      }),
      (err: { code?: string }) => err.code === `signature_${verdict}`
    );
  }
  assert.equal((await cases.getCaseByContract(CONTRACT))?.resolveSignature, null);
});

test("resolve signature: missing case reports case_not_found (local fallback stays)", async () => {
  await assert.rejects(
    recordCaseResolveSignature(createMemoryCaseStore(), readerOf(RESOLVED), verifier().verify, {
      contractAddress: CONTRACT,
      sessionWallet: RESOLVER_WALLET,
      signature: SIG,
    }),
    (err: { code?: string }) => err.code === "case_not_found"
  );
});

test("resolve signature: recorded value is visible to employer, freelancer and resolver", async () => {
  const cases = await caseStore();
  await recordCaseResolveSignature(cases, readerOf(RESOLVED), verifier().verify, {
    contractAddress: CONTRACT,
    sessionWallet: RESOLVER_WALLET,
    signature: SIG,
  });
  for (const wallet of [EMPLOYER, FREELANCER, RESOLVER_WALLET]) {
    const view = await getResolutionCase(
      cases,
      readerOf(RESOLVED),
      { contractAddress: CONTRACT, sessionWallet: wallet },
      new Date(),
      { allowResolver: true }
    );
    assert.equal(view.resolveSignature, SIG);
  }
});

test("resolve tx verdict: success, resolver signer, contract and program required", () => {
  const program = "Prog1111111111111111111111111111111111111111";
  const expect = { contract: CONTRACT, resolver: RESOLVER_WALLET, programId: program };
  const ok = { err: null, accountKeys: [RESOLVER_WALLET, CONTRACT, program], numRequiredSignatures: 1 };
  assert.equal(resolveTxVerdict(ok, expect), "ok");
  assert.equal(resolveTxVerdict(null, expect), "not_found");
  assert.equal(resolveTxVerdict({ ...ok, err: { InstructionError: [0, "Custom"] } }, expect), "failed");
  // Resolver present but not a signer.
  assert.equal(
    resolveTxVerdict({ ...ok, accountKeys: [EMPLOYER, RESOLVER_WALLET, CONTRACT, program] }, expect),
    "mismatch"
  );
  assert.equal(resolveTxVerdict({ ...ok, accountKeys: [RESOLVER_WALLET, program] }, expect), "mismatch");
  assert.equal(resolveTxVerdict({ ...ok, accountKeys: [RESOLVER_WALLET, CONTRACT] }, expect), "mismatch");
});

test("resolution center wiring: shared signature shown to all roles, resolver-only sync, local fallback", () => {
  const rc = readFileSync("components/contracts/ResolutionCenter.tsx", "utf8");
  assert.match(rc, /shownResolveSignature = caseResolveSignature \?\? serverResolveSignature \?\? resolveSignature/);
  assert.match(rc, /role !== "resolver" \|\| !resolved \|\| !resolveSignature/);
  assert.match(rc, /!resolverView && shownResolveSignature \?/);
  assert.match(rc, /href=\{explorerTxUrl\(shownResolveSignature\)\}/);
  const route = readFileSync("app/api/contracts/[address]/case/resolve-signature/route.ts", "utf8");
  assert.match(route, /requireMutatingOrigin\(request\)/);
  assert.match(route, /connectionResolveTxVerifier\(env\.solanaRpcUrl\)/);
  assert.doesNotMatch(route, /resolveDispute|resolve_dispute\(/);
});

test("responsive pass: wrap/stack classes, no zoom or scale hacks", () => {
  const files = {
    detail: readFileSync("components/contracts/ContractDetail.tsx", "utf8"),
    shell: readFileSync("components/shell/AppShell.tsx", "utf8"),
    messages: readFileSync("components/contracts/ContractMessages.tsx", "utf8"),
    rc: readFileSync("components/contracts/ResolutionCenter.tsx", "utf8"),
  };
  assert.match(files.detail, /mt-4 flex flex-wrap gap-2 max-sm:flex-col max-sm:items-stretch/);
  assert.match(files.shell, /<span className="min-w-0 truncate">/);
  assert.match(files.messages, /min-w-0 rounded-\[24px\]/);
  assert.match(files.rc, /min-w-0 break-words text-right/);
  for (const source of Object.values(files)) {
    assert.doesNotMatch(source, /zoom:|\bscale-\[|transform: scale/);
  }
});
