import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import { getGigHandoff } from "@/lib/server/marketplace/catalog-service";
import { marketplaceContext, marketplaceSessionWallet } from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Employer hiring an active gig (not their own): prefill data for Create. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    return NextResponse.json({
      handoff: await getGigHandoff(ctx.market, { sessionWallet: wallet, gigId: id }),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
