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
import { markAllNotificationsReadForWallets } from "@/lib/server/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireMutatingOrigin(request);

    const wallets = await requireAccountNotificationWallets(request);

    const result = await markAllNotificationsReadForWallets(
      productionStores().notifications,
      wallets
    );

    return NextResponse.json(result);
  } catch (err) {
    return accountNotificationAuthError(err) ?? handleRouteError(err);
  }
}
