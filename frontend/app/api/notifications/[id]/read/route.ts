import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin, requireSession } from "@/lib/server/api-guard";
import { productionStores } from "@/lib/server/compose";
import { markNotificationRead } from "@/lib/server/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const env = requireMutatingOrigin(request);
    const stores = productionStores();
    const session = await requireSession(request, stores, env);
    const { id } = await context.params;
    const result = await markNotificationRead(stores.notifications, {
      id,
      recipientWallet: session.walletAddress,
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
