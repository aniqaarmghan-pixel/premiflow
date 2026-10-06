import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import { searchMarketplace } from "@/lib/server/marketplace/catalog-service";
import { marketplaceTrustContext } from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public unified search: open jobs, active gigs and public profiles (with compact verified reputation). */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceTrustContext();
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await searchMarketplace(ctx.market, params, ctx.trust));
  } catch (err) {
    return handleRouteError(err);
  }
}
