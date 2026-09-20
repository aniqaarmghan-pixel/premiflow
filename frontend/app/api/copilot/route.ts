import { NextResponse } from "next/server";

import { handleRouteError, tryOptionalSession } from "@/lib/server/api-guard";
import { runCreateAssistant } from "@/lib/server/copilot/service";
import { readAppOrigin } from "@/lib/server/env";
import { assertOrigin, readJsonObject } from "@/lib/server/http";
import {
  RATE_LIMITS,
  consumeRateLimit,
  copilotBucket,
} from "@/lib/server/rate-limit";

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
    const result = await runCreateAssistant({ body, sessionWallet });
    return NextResponse.json({
      mode: result.mode,
      source: result.source,
      proposal: result.proposal,
      warnings: result.warnings,
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
