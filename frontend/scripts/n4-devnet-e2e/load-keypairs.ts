/**
 * Load disposable N4 keypairs without logging secrets.
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { Keypair } from "@solana/web3.js";

import {
  EXPECTED_EMPLOYER,
  EXPECTED_FREELANCER,
  employerKeypairPath,
  freelancerKeypairPath,
  repoRootFromScript,
} from "./config";

export type N4E2eKeypairs = {
  employer: Keypair;
  freelancer: Keypair;
  employerPath: string;
  freelancerPath: string;
};

function readKeypairFile(filePath: string): Keypair {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (
    !Array.isArray(raw) ||
    !(raw.length === 64 || raw.length === 32) ||
    !raw.every((n) => typeof n === "number" && n >= 0 && n <= 255)
  ) {
    throw new Error(`Keypair file is not a valid secret byte array: ${filePath}`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

/** Returns true when `git check-ignore` reports the path as ignored. */
export function pathIsGitignored(filePath: string, repoRoot: string): boolean {
  const result = spawnSync("git", ["check-ignore", "-q", "--", filePath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0;
}

/**
 * Load employer/freelancer keypairs and assert pubkeys + gitignore.
 * Never logs secret key material.
 */
export function loadN4E2eKeypairs(root = repoRootFromScript()): N4E2eKeypairs {
  const employerPath = employerKeypairPath(root);
  const freelancerPath = freelancerKeypairPath(root);

  if (!pathIsGitignored(employerPath, root)) {
    throw new Error(`Employer keypair path is not gitignored: ${employerPath}`);
  }
  if (!pathIsGitignored(freelancerPath, root)) {
    throw new Error(
      `Freelancer keypair path is not gitignored: ${freelancerPath}`
    );
  }

  const employer = readKeypairFile(employerPath);
  const freelancer = readKeypairFile(freelancerPath);

  const employerPub = employer.publicKey.toBase58();
  const freelancerPub = freelancer.publicKey.toBase58();

  if (employerPub !== EXPECTED_EMPLOYER) {
    throw new Error(
      `Employer pubkey mismatch: got ${employerPub}, expected ${EXPECTED_EMPLOYER}`
    );
  }
  if (freelancerPub !== EXPECTED_FREELANCER) {
    throw new Error(
      `Freelancer pubkey mismatch: got ${freelancerPub}, expected ${EXPECTED_FREELANCER}`
    );
  }

  return { employer, freelancer, employerPath, freelancerPath };
}
