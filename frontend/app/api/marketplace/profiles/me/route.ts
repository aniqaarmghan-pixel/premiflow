import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import { getMyProfile, saveMyProfile } from "@/lib/server/marketplace/catalog-service";
import {
  limitMarketplaceWrites,
  marketplaceContext,
  marketplaceSessionWallet,
} from "@/lib/server/marketplace/route-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    return NextResponse.json({
      wallet,
      profile: await getMyProfile(ctx.market, { sessionWallet: wallet }),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Owner only: the profile key is the signed session wallet, never the body. */
export async function PUT(request: Request) {
  try {
    requireMutatingOrigin(request);
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    return NextResponse.json({
      profile: await saveMyProfile(ctx.market, { sessionWallet: wallet, body }),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
