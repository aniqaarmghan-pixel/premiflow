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
import { createJob, listOpenJobs } from "@/lib/server/marketplace/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: open jobs only. */
export async function GET() {
  try {
    const ctx = marketplaceContext();
    return NextResponse.json({ jobs: await listOpenJobs(ctx.market) });
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
      // Token comes from trusted config, never from the client.
      tokenMint: new PublicKey(lockedCreatePayment().mint).toBase58(),
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
