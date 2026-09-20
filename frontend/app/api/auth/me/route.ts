import { NextResponse } from "next/server";

import { handleRouteError, requireSession } from "@/lib/server/api-guard";
import { productionStores } from "@/lib/server/compose";
import { getServerEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const env = getServerEnv();
    const session = await requireSession(request, productionStores(), env);
    return NextResponse.json({
      wallet: session.walletAddress,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
