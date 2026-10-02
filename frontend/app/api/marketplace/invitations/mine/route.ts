import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import {
  marketplaceSessionWallet,
  marketplaceTrustContext,
  trustDeps,
} from "@/lib/server/marketplace/route-context";
import { listMyInvitations } from "@/lib/server/marketplace/trust-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Invitations addressed to the signed-in wallet only. */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    return NextResponse.json({ items: await listMyInvitations(trustDeps(ctx), { sessionWallet: wallet }) });
  } catch (err) {
    return handleRouteError(err);
  }
}
