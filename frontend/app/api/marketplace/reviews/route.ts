import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import {
  limitMarketplaceWrites,
  marketplaceSessionWallet,
  marketplaceTrustContext,
  trustDeps,
} from "@/lib/server/marketplace/route-context";
import { getReviewEligibility, submitReview } from "@/lib/server/marketplace/trust-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Review eligibility for ?contract=<address>, re-read from chain for the session wallet. */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    const contract = new URL(request.url).searchParams.get("contract");
    return NextResponse.json(await getReviewEligibility(trustDeps(ctx), { sessionWallet: wallet, contractAddress: contract }));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Verified review: body { contractAddress, score, body }. Reviewer/reviewee come from chain + session. */
export async function POST(request: Request) {
  try {
    requireMutatingOrigin(request);
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    const review = await submitReview(trustDeps(ctx), {
      sessionWallet: wallet,
      contractAddress: body.contractAddress,
      score: body.score,
      body: body.body,
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
