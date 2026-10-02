import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import { searchMarketplace } from "@/lib/server/marketplace/catalog-service";
import { marketplaceContext } from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public unified search: open jobs, active gigs and public profiles, each bounded. */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceContext();
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await searchMarketplace(ctx.market, params));
  } catch (err) {
    return handleRouteError(err);
  }
}
