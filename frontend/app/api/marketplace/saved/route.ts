import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import { listSaved, saveListing, unsaveListing } from "@/lib/server/marketplace/favorites-service";
import {
  limitMarketplaceWrites,
  marketplaceContext,
  marketplaceSessionWallet,
} from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in wallet's saved jobs and gigs. */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    return NextResponse.json({ items: await listSaved(ctx.market, { sessionWallet: wallet }) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Save a listing: body { type: "job" | "gig", id }. Owner is the session wallet. */
export async function POST(request: Request) {
  try {
    requireMutatingOrigin(request);
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    return NextResponse.json(
      await saveListing(ctx.market, { sessionWallet: wallet, targetType: body.type, targetId: body.id })
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Unsave: ?type=job|gig&id=<uuid>. */
export async function DELETE(request: Request) {
  try {
    requireMutatingOrigin(request);
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const url = new URL(request.url);
    return NextResponse.json(
      await unsaveListing(ctx.market, {
        sessionWallet: wallet,
        targetType: url.searchParams.get("type"),
        targetId: url.searchParams.get("id"),
      })
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
