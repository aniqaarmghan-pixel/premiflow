import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import {
  limitMarketplaceWrites,
  marketplaceContext,
  marketplaceSessionWallet,
} from "@/lib/server/marketplace/route-context";
import { notifyProposalSelected } from "@/lib/server/marketplace/proposal-notices";
import { selectProposal } from "@/lib/server/marketplace/service";

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
    const detail = await selectProposal(ctx.market, {
      sessionWallet: wallet,
      jobId: id,
      proposalId: body.proposalId,
    });
    await notifyProposalSelected(ctx.market, ctx.stores.notifications, detail.job.id);
    return NextResponse.json(detail);
  } catch (err) {
    return handleRouteError(err);
  }
}
