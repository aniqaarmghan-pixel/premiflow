import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import { deleteGig, getGigDetail, updateGig } from "@/lib/server/marketplace/catalog-service";
import {
  limitMarketplaceWrites,
  marketplaceContext,
  marketplaceSessionWallet,
  optionalMarketplaceSessionWallet,
} from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Public for active gigs; paused gigs are visible to their owner only. */
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const ctx = marketplaceContext();
    const wallet = await optionalMarketplaceSessionWallet(request, ctx);
    return NextResponse.json(await getGigDetail(ctx.market, { sessionWallet: wallet, gigId: id }));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Owner only: edit fields, or { action: "pause" | "resume" }. */
export async function PATCH(request: Request, context: Context) {
  try {
    requireMutatingOrigin(request);
    const { id } = await context.params;
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    const gig = await updateGig(ctx.market, { sessionWallet: wallet, gigId: id, body });
    return NextResponse.json({ gig });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Owner only. */
export async function DELETE(request: Request, context: Context) {
  try {
    requireMutatingOrigin(request);
    const { id } = await context.params;
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    return NextResponse.json(await deleteGig(ctx.market, { sessionWallet: wallet, gigId: id }));
  } catch (err) {
    return handleRouteError(err);
  }
}
