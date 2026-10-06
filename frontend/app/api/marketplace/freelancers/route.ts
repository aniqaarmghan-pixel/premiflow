import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import { searchFreelancers } from "@/lib/server/marketplace/catalog-service";
import { marketplaceTrustContext } from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public profile listing (safe fields + compact verified reputation). ?q=&skill=&category=&min=&max=&sort=&featured=&limit= */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceTrustContext();
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ freelancers: await searchFreelancers(ctx.market, params, ctx.trust) });
  } catch (err) {
    return handleRouteError(err);
  }
}
