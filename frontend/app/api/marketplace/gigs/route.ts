import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

import { lockedCreatePayment } from "@/lib/app/premiflow";
import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import { createGig, searchGigs } from "@/lib/server/marketplace/catalog-service";
import {
  limitMarketplaceWrites,
  marketplaceContext,
  marketplaceSessionWallet,
} from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: active gigs only. Optional ?q=&skill=&mode=&min=&max=&limit=. */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceContext();
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ gigs: await searchGigs(ctx.market, params) });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    requireMutatingOrigin(request);
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    const gig = await createGig(ctx.market, {
      sessionWallet: wallet,
      body,
      // Token comes from trusted config, never from the client.
      tokenMint: new PublicKey(lockedCreatePayment().mint).toBase58(),
    });
    return NextResponse.json({ gig }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
