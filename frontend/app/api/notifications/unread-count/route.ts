import { NextResponse } from "next/server";

import { handleRouteError, requireSession } from "@/lib/server/api-guard";
import { productionStores } from "@/lib/server/compose";
import { getServerEnv } from "@/lib/server/env";
import { unreadNotificationCount } from "@/lib/server/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const env = getServerEnv();
    const stores = productionStores();
    const session = await requireSession(request, stores, env);
    const result = await unreadNotificationCount(
      stores.notifications,
      session.walletAddress
    );
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
