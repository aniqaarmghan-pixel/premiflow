import { NextResponse } from "next/server";

import { handleRouteError, requireSession } from "@/lib/server/api-guard";
import { productionStores } from "@/lib/server/compose";
import { getServerEnv } from "@/lib/server/env";
import { listNotifications } from "@/lib/server/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const env = getServerEnv();
    const stores = productionStores();
    const session = await requireSession(request, stores, env);
    const url = new URL(request.url);
    const result = await listNotifications(stores.notifications, {
      recipientWallet: session.walletAddress,
      cursor: url.searchParams.get("cursor"),
      limit: url.searchParams.get("limit"),
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
