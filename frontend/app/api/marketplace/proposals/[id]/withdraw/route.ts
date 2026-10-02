import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import {
  limitMarketplaceWrites,
  marketplaceContext,
  marketplaceSessionWallet,
} from "@/lib/server/marketplace/route-context";
import { withdrawProposal } from "@/lib/server/marketplace/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireMutatingOrigin(request);
    const { id } = await context.params;
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const proposal = await withdrawProposal(ctx.market, { sessionWallet: wallet, proposalId: id });
    return NextResponse.json({ proposal });
  } catch (err) {
    return handleRouteError(err);
  }
}
