/**
 * N4 Devnet E2E safety gates — read-only. Never sends PREMIFLOW instructions.
 */

import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

import { STREAMPAY_PROGRAM_ID } from "@/lib/streampay-v2/constants";

import {
  EXPECTED_DEVNET_GENESIS,
  EXPECTED_EMPLOYER,
  EXPECTED_FREELANCER,
  EXPECTED_MINT,
  EXPECTED_MINT_DECIMALS,
  EXPECTED_PROGRAM,
  MIN_EMPLOYER_PFT_RAW,
  assertDevnetClusterBundle,
  expectedResolver,
  employerKeypairPath,
  freelancerKeypairPath,
  repoRootFromScript,
} from "./config";
import { loadN4E2eKeypairs, pathIsGitignored } from "./load-keypairs";

export type SafetyGateReport = {
  ok: true;
  mode: "dry-run";
  premiflowTransactionCount: 0;
  genesis: string;
  programId: string;
  mint: string;
  mintDecimals: number;
  resolver: string;
  employer: string;
  freelancer: string;
  employerSolLamports: number;
  freelancerSolLamports: number;
  employerPftRaw: string;
  freelancerPftRaw: string;
  employerKeypairPath: string;
  freelancerKeypairPath: string;
  employerKeypairGitignored: true;
  freelancerKeypairGitignored: true;
  rpcHost: string;
  clientProgramId: string;
};

export class SafetyGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafetyGateError";
  }
}

function rpcHost(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "(invalid-url)";
  }
}

function refuseMainnet(rpcUrl: string, genesis: string): void {
  const lower = rpcUrl.toLowerCase();
  if (lower.includes("mainnet")) {
    throw new SafetyGateError("Refusing mainnet RPC URL.");
  }
  if (genesis !== EXPECTED_DEVNET_GENESIS) {
    throw new SafetyGateError(
      `Genesis mismatch (refusing non-devnet): got ${genesis}, expected ${EXPECTED_DEVNET_GENESIS}`
    );
  }
  // Extra belt: never allow the public mainnet-beta URL even if genesis were spoofed in tests.
  if (rpcUrl === clusterApiUrl("mainnet-beta")) {
    throw new SafetyGateError("Refusing clusterApiUrl(mainnet-beta).");
  }
}

async function tokenRawBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey
): Promise<bigint> {
  const accounts = await connection.getTokenAccountsByOwner(owner, { mint });
  let total = 0n;
  for (const { pubkey } of accounts.value) {
    const bal = await connection.getTokenAccountBalance(pubkey);
    total += BigInt(bal.value.amount);
  }
  return total;
}

/**
 * Hard-fail safety gate. Read-only RPC + local keypair pubkey checks.
 * Does not construct or send any PREMIFLOW program transaction.
 */
export async function runSafetyGates(input: {
  rpcUrl: string;
}): Promise<SafetyGateReport> {
  assertDevnetClusterBundle();
  const resolver = expectedResolver();
  const root = repoRootFromScript();
  const empPath = employerKeypairPath(root);
  const frePath = freelancerKeypairPath(root);

  if (!pathIsGitignored(empPath, root) || !pathIsGitignored(frePath, root)) {
    throw new SafetyGateError("Keypair paths must be gitignored before E2E.");
  }

  const { employer, freelancer, employerPath, freelancerPath } =
    loadN4E2eKeypairs(root);

  if (employer.publicKey.toBase58() !== EXPECTED_EMPLOYER) {
    throw new SafetyGateError("Employer signer pubkey mismatch.");
  }
  if (freelancer.publicKey.toBase58() !== EXPECTED_FREELANCER) {
    throw new SafetyGateError("Freelancer signer pubkey mismatch.");
  }

  if (STREAMPAY_PROGRAM_ID.toBase58() !== EXPECTED_PROGRAM) {
    throw new SafetyGateError(
      `Client STREAMPAY_PROGRAM_ID mismatch: ${STREAMPAY_PROGRAM_ID.toBase58()}`
    );
  }

  const connection = new Connection(input.rpcUrl, "confirmed");
  const genesis = await connection.getGenesisHash();
  refuseMainnet(input.rpcUrl, genesis);

  const mintPk = new PublicKey(EXPECTED_MINT);
  const mintInfo = await connection.getParsedAccountInfo(mintPk);
  if (!mintInfo.value) {
    throw new SafetyGateError(`Mint account missing: ${EXPECTED_MINT}`);
  }
  const parsed = mintInfo.value.data;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("parsed" in parsed) ||
    typeof parsed.parsed !== "object" ||
    parsed.parsed === null ||
    !("info" in parsed.parsed)
  ) {
    throw new SafetyGateError("Mint account is not jsonParsed.");
  }
  const info = (parsed.parsed as { info: { decimals: number } }).info;
  if (info.decimals !== EXPECTED_MINT_DECIMALS) {
    throw new SafetyGateError(
      `Mint decimals mismatch: got ${info.decimals}, expected ${EXPECTED_MINT_DECIMALS}`
    );
  }

  const programInfo = await connection.getAccountInfo(
    new PublicKey(EXPECTED_PROGRAM)
  );
  if (!programInfo) {
    throw new SafetyGateError(`Program account missing: ${EXPECTED_PROGRAM}`);
  }

  const employerSol = await connection.getBalance(employer.publicKey);
  const freelancerSol = await connection.getBalance(freelancer.publicKey);
  const employerPft = await tokenRawBalance(
    connection,
    employer.publicKey,
    mintPk
  );
  const freelancerPft = await tokenRawBalance(
    connection,
    freelancer.publicKey,
    mintPk
  );

  // Authorized execute gate: employer >= 0.02 SOL and >= 1 PFT.
  const MIN_EMPLOYER_SOL = 20_000_000; // 0.02 SOL
  const MIN_FREELANCER_SOL = 5_000_000; // 0.005 SOL (fees for accept + submit)
  if (employerSol < MIN_EMPLOYER_SOL) {
    throw new SafetyGateError(
      `Employer SOL insufficient: ${employerSol} lamports (need >= ${MIN_EMPLOYER_SOL})`
    );
  }
  if (freelancerSol < MIN_FREELANCER_SOL) {
    throw new SafetyGateError(
      `Freelancer SOL insufficient: ${freelancerSol} lamports (need >= ${MIN_FREELANCER_SOL})`
    );
  }
  if (employerPft < MIN_EMPLOYER_PFT_RAW) {
    throw new SafetyGateError(
      `Employer PFT insufficient: ${employerPft} raw (need >= ${MIN_EMPLOYER_PFT_RAW})`
    );
  }

  return {
    ok: true,
    mode: "dry-run",
    premiflowTransactionCount: 0,
    genesis,
    programId: EXPECTED_PROGRAM,
    mint: EXPECTED_MINT,
    mintDecimals: EXPECTED_MINT_DECIMALS,
    resolver,
    employer: employer.publicKey.toBase58(),
    freelancer: freelancer.publicKey.toBase58(),
    employerSolLamports: employerSol,
    freelancerSolLamports: freelancerSol,
    employerPftRaw: employerPft.toString(),
    freelancerPftRaw: freelancerPft.toString(),
    employerKeypairPath: employerPath,
    freelancerKeypairPath: freelancerPath,
    employerKeypairGitignored: true,
    freelancerKeypairGitignored: true,
    rpcHost: rpcHost(input.rpcUrl),
    clientProgramId: STREAMPAY_PROGRAM_ID.toBase58(),
  };
}
