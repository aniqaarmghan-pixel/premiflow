import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import { marketplaceContext, marketplaceSessionWallet } from "@/lib/server/marketplace/route-context";
import { getCreateHandoff } from "@/lib/server/marketplace/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner only, after selection: prefill data for the existing Create wizard. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    return NextResponse.json({
      handoff: await getCreateHandoff(ctx.market, { sessionWallet: wallet, jobId: id }),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
