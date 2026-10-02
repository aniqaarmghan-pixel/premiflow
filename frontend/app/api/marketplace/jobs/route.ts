import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

import { lockedCreatePayment } from "@/lib/app/premiflow";
import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import {
  limitMarketplaceWrites,
  marketplaceContext,
  marketplaceSessionWallet,
} from "@/lib/server/marketplace/route-context";
import { searchJobs } from "@/lib/server/marketplace/catalog-service";
import { createJob } from "@/lib/server/marketplace/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: open jobs only. Optional ?q=&skill=&mode=&min=&max=&limit= (bounded, parameterized). */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceContext();
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ jobs: await searchJobs(ctx.market, params) });
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
    const job = await createJob(ctx.market, {
      sessionWallet: wallet,
      title: body.title,
      description: body.description,
      paymentMode: body.paymentMode,
      budgetAmount: body.budgetAmount,
      skills: body.skills,
      category: body.category,
      // Token comes from trusted config, never from the client.
      tokenMint: new PublicKey(lockedCreatePayment().mint).toBase58(),
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
