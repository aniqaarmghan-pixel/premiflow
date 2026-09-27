/**
 * PREMIFLOW N4 Devnet E2E runner (test-only).
 *
 *   npx tsx scripts/n4-devnet-e2e/run.ts --dry-run
 *   npx tsx scripts/n4-devnet-e2e/run.ts --execute
 *
 * --execute requires a local app at APP_ORIGIN (default http://localhost:3000)
 * serving production auth/submissions/notifications routes.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { LifecycleTxError, runApprovedLifecycle } from "./lifecycle";
import { loadN4E2eKeypairs } from "./load-keypairs";
import {
  RevisionWindowExpiredError,
  runRevisedSubmissionE2e,
} from "./revise-existing";
import { runSafetyGates, SafetyGateError } from "./safety";
import { repoRootFromScript } from "./config";

function loadEnvLocal(repoRoot: string): Record<string, string> {
  const envPath = path.join(repoRoot, "frontend", ".env.local");
  const out: Record<string, string> = {};
  if (!existsSync(envPath)) return out;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parseArgs(argv: string[]): {
  mode: "dry-run" | "execute" | "revise-existing";
} {
  if (argv.includes("--revise-existing")) return { mode: "revise-existing" };
  if (argv.includes("--execute")) return { mode: "execute" };
  return { mode: "dry-run" };
}

async function requireApi(apiBaseUrl: string): Promise<void> {
  try {
    const health = await fetch(apiBaseUrl, { method: "GET" });
    if (!health.ok && health.status >= 500) {
      throw new Error(`API base unhealthy: ${apiBaseUrl} status ${health.status}`);
    }
  } catch (err) {
    throw new Error(
      `Cannot reach API at ${apiBaseUrl}. Start the Next.js app first. (${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }
}

async function main(): Promise<void> {
  const { mode } = parseArgs(process.argv.slice(2));
  const root = repoRootFromScript();
  const env = loadEnvLocal(root);
  const rpcUrl = process.env.SOLANA_RPC_URL ?? env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required (env or frontend/.env.local).");
  }

  console.log("=== N4 E2E safety gates (mandatory before any PREMIFLOW tx) ===");
  const gate = await runSafetyGates({ rpcUrl });
  console.log(JSON.stringify(gate, null, 2));

  if (mode === "dry-run") {
    console.log(
      "PREMIFLOW N4 E2E DRY GATE: ok — premiflowTransactionCount=0 — lifecycle not started"
    );
    return;
  }

  const appOrigin = process.env.APP_ORIGIN ?? env.APP_ORIGIN;
  if (!appOrigin) {
    throw new Error("APP_ORIGIN is required for --execute (auth Origin check).");
  }
  const apiBaseUrl = process.env.N4_E2E_API_BASE ?? appOrigin;
  await requireApi(apiBaseUrl);

  if (mode === "revise-existing") {
    console.log(
      "=== N4 revised_work_submitted E2E (max 2 txs on preserved contract) ==="
    );
    const result = await runRevisedSubmissionE2e({
      rpcUrl,
      appOrigin,
      apiBaseUrl,
      keys: loadN4E2eKeypairs(root),
    });
    console.log(JSON.stringify(result, null, 2));
    console.log(
      "PREMIFLOW N4 REVISED_WORK_SUBMITTED DEVNET E2E PASSED — N4 COMPLETE"
    );
    return;
  }

  console.log("=== N4 E2E lifecycle EXECUTE (one Milestone contract) ===");
  const result = await runApprovedLifecycle({
    rpcUrl,
    appOrigin,
    apiBaseUrl,
    keys: loadN4E2eKeypairs(root),
  });
  console.log(JSON.stringify(result, null, 2));
  console.log("PREMIFLOW N4 DEVNET E2E PASSED — WORK_SUBMITTED VERIFIED END-TO-END");
}

main().catch((err) => {
  if (err instanceof RevisionWindowExpiredError) {
    console.error(err.message);
    console.error(
      "PREMIFLOW N4 REVISION E2E BLOCKED — REVIEW WINDOW EXPIRED — NO TRANSACTION SENT"
    );
  } else if (err instanceof SafetyGateError) {
    console.error(`SAFETY_GATE_FAIL: ${err.message}`);
    console.error("PREMIFLOW N4 REVISION E2E STOPPED — FAILURE REQUIRES REVIEW");
  } else if (err instanceof LifecycleTxError) {
    console.error(
      JSON.stringify(
        {
          failedStep: err.step,
          signature: err.signature,
          detail: err.detail,
          logs: err.logs ?? null,
        },
        null,
        2
      )
    );
    console.error("PREMIFLOW N4 REVISION E2E STOPPED — FAILURE REQUIRES REVIEW");
  } else if (err instanceof Error) {
    console.error(err.message);
    console.error("PREMIFLOW N4 REVISION E2E STOPPED — FAILURE REQUIRES REVIEW");
  } else {
    console.error(err);
    console.error("PREMIFLOW N4 REVISION E2E STOPPED — FAILURE REQUIRES REVIEW");
  }
  process.exitCode = 1;
});
