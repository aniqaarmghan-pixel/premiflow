import { NextResponse } from "next/server";

import {
  AccountSessionRequiredError,
  requireAccountSession,
} from "@/lib/server/account-auth/session";
import { listAccountWalletLinks } from "@/lib/server/account-auth/wallet-links";

export async function requireAccountNotificationWallets(
  request: Request
): Promise<string[]> {
  const session = await requireAccountSession(request);
  const links = await listAccountWalletLinks(session.user.id);

  return links.map((item) => item.walletAddress);
}

export function accountNotificationAuthError(
  err: unknown
): Response | null {
  if (!(err instanceof AccountSessionRequiredError)) return null;

  return NextResponse.json(
    {
      error: {
        code: "account_unauthenticated",
        message: err.message,
      },
    },
    { status: 401 }
  );
}
