import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import { getProfilePage } from "@/lib/server/marketplace/catalog-service";
import { marketplaceContext } from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public profile: profile (if any), active gigs and open jobs for a wallet. */
export async function GET(_request: Request, context: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet } = await context.params;
    const ctx = marketplaceContext();
    return NextResponse.json(await getProfilePage(ctx.market, { wallet }));
  } catch (err) {
    return handleRouteError(err);
  }
}
