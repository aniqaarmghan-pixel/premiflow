import { NextResponse } from "next/server";

import { createAuthChallenge } from "@/lib/server/auth/service";
import { authConfigFromEnv, productionStores } from "@/lib/server/compose";
import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = requireMutatingOrigin(request);
    const body = await readJsonObject(request);
    const wallet = typeof body.wallet === "string" ? body.wallet : "";
    const result = await createAuthChallenge(
      productionStores(),
      authConfigFromEnv(env),
      wallet
    );
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
