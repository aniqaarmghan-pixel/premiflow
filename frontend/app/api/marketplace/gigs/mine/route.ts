import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import { listMyGigs } from "@/lib/server/marketplace/catalog-service";
import { marketplaceContext, marketplaceSessionWallet } from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner: every own gig, including paused ones. */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    return NextResponse.json({ gigs: await listMyGigs(ctx.market, { sessionWallet: wallet }) });
  } catch (err) {
    return handleRouteError(err);
  }
}
