import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import {
  accountNotificationAuthError,
  requireAccountNotificationWallets,
} from "@/lib/server/account-auth/notification-wallets";
import { productionStores } from "@/lib/server/compose";
import { markNotificationReadForWallets } from "@/lib/server/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireMutatingOrigin(request);

    const wallets = await requireAccountNotificationWallets(request);
    const { id } = await context.params;

    const result = await markNotificationReadForWallets(
      productionStores().notifications,
      {
        id,
        recipientWallets: wallets,
      }
    );

    return NextResponse.json(result);
  } catch (err) {
    return accountNotificationAuthError(err) ?? handleRouteError(err);
  }
}
