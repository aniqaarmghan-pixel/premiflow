import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import {
  accountNotificationAuthError,
  requireAccountNotificationWallets,
} from "@/lib/server/account-auth/notification-wallets";
import { productionStores } from "@/lib/server/compose";
import { listNotificationsForWallets } from "@/lib/server/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const wallets = await requireAccountNotificationWallets(request);
    const url = new URL(request.url);

    const result = await listNotificationsForWallets(
      productionStores().notifications,
      {
        recipientWallets: wallets,
        cursor: url.searchParams.get("cursor"),
        limit: url.searchParams.get("limit"),
      }
    );

    return NextResponse.json(result);
  } catch (err) {
    return accountNotificationAuthError(err) ?? handleRouteError(err);
  }
}
