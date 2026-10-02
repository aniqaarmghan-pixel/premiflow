import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import { marketplaceContext, marketplaceSessionWallet } from "@/lib/server/marketplace/route-context";
import { listMyProposals } from "@/lib/server/marketplace/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    return NextResponse.json({ items: await listMyProposals(ctx.market, { sessionWallet: wallet }) });
  } catch (err) {
    return handleRouteError(err);
  }
}
