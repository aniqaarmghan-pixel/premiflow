import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import {
  limitMarketplaceWrites,
  marketplaceContext,
  marketplaceSessionWallet,
} from "@/lib/server/marketplace/route-context";
import { submitProposal } from "@/lib/server/marketplace/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireMutatingOrigin(request);
    const { id } = await context.params;
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    const proposal = await submitProposal(ctx.market, {
      sessionWallet: wallet,
      jobId: id,
      message: body.message,
      proposedAmount: body.proposedAmount,
    });
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
