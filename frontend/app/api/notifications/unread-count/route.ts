import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import {
  accountNotificationAuthError,
  requireAccountNotificationWallets,
} from "@/lib/server/account-auth/notification-wallets";
import { productionStores } from "@/lib/server/compose";
import { unreadNotificationCountForWallets } from "@/lib/server/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const wallets = await requireAccountNotificationWallets(request);

    const result = await unreadNotificationCountForWallets(
      productionStores().notifications,
      wallets
    );

    return NextResponse.json(result);
  } catch (err) {
    return accountNotificationAuthError(err) ?? handleRouteError(err);
  }
}
