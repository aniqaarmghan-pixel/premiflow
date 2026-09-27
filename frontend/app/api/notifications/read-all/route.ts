import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin, requireSession } from "@/lib/server/api-guard";
import { productionStores } from "@/lib/server/compose";
import { getServerEnv } from "@/lib/server/env";
import { markAllNotificationsRead } from "@/lib/server/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = requireMutatingOrigin(request);
    const stores = productionStores();
    const session = await requireSession(request, stores, env);
    const result = await markAllNotificationsRead(
      stores.notifications,
      session.walletAddress
    );
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
