import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import {
  limitMarketplaceWrites,
  marketplaceContext,
  marketplaceSessionWallet,
  optionalMarketplaceSessionWallet,
} from "@/lib/server/marketplace/route-context";
import { closeJob, getJobDetail, updateJob } from "@/lib/server/marketplace/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const ctx = marketplaceContext();
    const wallet = await optionalMarketplaceSessionWallet(request, ctx);
    return NextResponse.json(await getJobDetail(ctx.market, { sessionWallet: wallet, jobId: id }));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Owner only: edit an open job, or close it with { action: "close" }. */
export async function PATCH(request: Request, context: Context) {
  try {
    requireMutatingOrigin(request);
    const { id } = await context.params;
    const ctx = marketplaceContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    const job =
      body.action === "close"
        ? await closeJob(ctx.market, { sessionWallet: wallet, jobId: id })
        : await updateJob(ctx.market, {
            sessionWallet: wallet,
            jobId: id,
            title: body.title,
            description: body.description,
            paymentMode: body.paymentMode,
            budgetAmount: body.budgetAmount,
            skills: body.skills,
            category: body.category,
          });
    return NextResponse.json({ job });
  } catch (err) {
    return handleRouteError(err);
  }
}
