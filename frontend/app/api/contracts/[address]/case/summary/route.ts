import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireCaseViewer,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import { generateCaseSummary } from "@/lib/server/cases/ai-summary";
import { getResolutionCase } from "@/lib/server/cases/service";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/server/rate-limit";
import { connectionCaseFactsReader } from "@/lib/server/solana/read-contract-case-facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Neutral, informational AI case summary for the parties and the designated
 * resolver. Input is ONLY deliberately submitted case material (statements,
 * message snapshots, file-evidence metadata, contract facts) - never the
 * private message thread. It never picks a winner, suggests an award, signs,
 * or changes any control.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    requireMutatingOrigin(request);
    const { address } = await context.params;
    const { stores, session, env } = await requireCaseViewer(request, address);
    await consumeRateLimit(
      stores.rates,
      `case-summary:${session.walletAddress}:${address}`,
      RATE_LIMITS.sendMax,
      RATE_LIMITS.sendWindowMs,
      new Date()
    );
    const view = await getResolutionCase(
      stores.cases,
      connectionCaseFactsReader(env.solanaRpcUrl),
      { contractAddress: address, sessionWallet: session.walletAddress },
      new Date(),
      { allowResolver: true }
    );
    const summary = await generateCaseSummary(view);
    return NextResponse.json({ summary });
  } catch (err) {
    return handleRouteError(err);
  }
}
