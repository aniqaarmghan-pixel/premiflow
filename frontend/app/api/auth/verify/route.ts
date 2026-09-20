import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { verifyAuthChallenge } from "@/lib/server/auth/service";
import { authConfigFromEnv, productionStores } from "@/lib/server/compose";
import { SESSION_COOKIE, readJsonObject, sessionCookieOptions } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = requireMutatingOrigin(request);
    const body = await readJsonObject(request);
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    const result = await verifyAuthChallenge(
      productionStores(),
      authConfigFromEnv(env),
      { challengeId, signature }
    );
    const response = NextResponse.json({
      wallet: result.wallet,
      expiresAt: result.expiresAt.toISOString(),
    });
    response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions(env));
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
