import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { logoutSession } from "@/lib/server/auth/service";
import { authConfigFromEnv, productionStores } from "@/lib/server/compose";
import { SESSION_COOKIE, readCookie, sessionCookieOptions } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = requireMutatingOrigin(request);
    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    await logoutSession(productionStores().auth, authConfigFromEnv(env), token);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(env), maxAge: 0 });
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
