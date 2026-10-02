import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import { listSavedIds } from "@/lib/server/marketplace/favorites-service";
import { marketplaceContext, marketplaceSessionWallet } from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ids-only saved status for the signed-in wallet (one fetch shared by every Save button). */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    return NextResponse.json(await listSavedIds(ctx.market, { sessionWallet: wallet }));
  } catch (err) {
    return handleRouteError(err);
  }
}
