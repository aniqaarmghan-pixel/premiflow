import { NextResponse } from "next/server";

import { handleRouteError, tryOptionalSession } from "@/lib/server/api-guard";
import {
  CopilotAuthError,
  runCreateAssistant,
  runLiveAssistant,
} from "@/lib/server/copilot/service";
import { getServerEnv, readAppOrigin } from "@/lib/server/env";
import { assertOrigin, readJsonObject } from "@/lib/server/http";
import {
  RATE_LIMITS,
  consumeRateLimit,
  copilotBucket,
} from "@/lib/server/rate-limit";
import { connectionSnapshotReader } from "@/lib/server/solana/read-contract-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const origin = readAppOrigin();
    assertOrigin(request, origin);
    const body = await readJsonObject(request);
    const { sessionWallet, stores } = await tryOptionalSession(request);
    if (sessionWallet && stores) {
      await consumeRateLimit(
        stores.rates,
        copilotBucket(sessionWallet),
        RATE_LIMITS.copilotMax,
        RATE_LIMITS.copilotWindowMs
      );
    }

    const mode = typeof body.mode === "string" ? body.mode : "";
    if (mode === "create") {
      const result = await runCreateAssistant({ body, sessionWallet });
      return NextResponse.json({
        mode: result.mode,
        source: result.source,
        proposal: result.proposal,
        warnings: result.warnings,
      });
    }

    if (!sessionWallet) {
      throw new CopilotAuthError();
    }
    const env = getServerEnv();
    const result = await runLiveAssistant({
      body,
      sessionWallet,
      reader: connectionSnapshotReader(env.solanaRpcUrl),
    });
    return NextResponse.json({
      mode: result.mode,
      source: result.source,
      role: result.role,
      explanation: "explanation" in result ? result.explanation : undefined,
      action: "action" in result ? result.action : undefined,
      summary: "summary" in result ? result.summary : undefined,
      availableActions: "availableActions" in result ? result.availableActions : undefined,
      warnings: result.warnings,
      privateMessagesIncluded: result.privateMessagesIncluded,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}
