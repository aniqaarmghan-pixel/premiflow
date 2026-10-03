import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import {
  limitMarketplaceWrites,
  marketplaceSessionWallet,
  marketplaceTrustContext,
  trustDeps,
} from "@/lib/server/marketplace/route-context";
import { linkContract, listContractLinks } from "@/lib/server/marketplace/trust-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Linked contracts for ?jobId= or ?gigId=, visible only to the contract parties. */
export async function GET(request: Request) {
  try {
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    const url = new URL(request.url);
    return NextResponse.json({
      links: await listContractLinks(trustDeps(ctx), {
        sessionWallet: wallet,
        jobId: url.searchParams.get("jobId"),
        gigId: url.searchParams.get("gigId"),
      }),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Link an existing PREMIFLOW contract to a listing:
 * body { contractAddress, source: "job" | "gig", jobId?, proposalId?, gigId? }.
 * Parties are read from chain and must match the listing.
 */
export async function POST(request: Request) {
  try {
    requireMutatingOrigin(request);
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    const result = await linkContract(trustDeps(ctx), {
      sessionWallet: wallet,
      contractAddress: body.contractAddress,
      source: body.source,
      jobId: body.jobId,
      proposalId: body.proposalId,
      gigId: body.gigId,
      packageTier: body.packageTier,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return handleRouteError(err);
  }
}
