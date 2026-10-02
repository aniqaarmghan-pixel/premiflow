import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import {
  limitMarketplaceWrites,
  marketplaceSessionWallet,
  marketplaceTrustContext,
  trustDeps,
} from "@/lib/server/marketplace/route-context";
import { getShortlist, setShortlisted } from "@/lib/server/marketplace/trust-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Employer-private shortlist (owner only). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    return NextResponse.json(await getShortlist(trustDeps(ctx), { sessionWallet: wallet, jobId: id }));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Add to shortlist: body { proposalId }. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireMutatingOrigin(request);
    const { id } = await context.params;
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    return NextResponse.json(
      await setShortlisted(trustDeps(ctx), { sessionWallet: wallet, jobId: id, proposalId: body.proposalId, shortlisted: true })
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Remove from shortlist: ?proposalId=<uuid>. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireMutatingOrigin(request);
    const { id } = await context.params;
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const proposalId = new URL(request.url).searchParams.get("proposalId");
    return NextResponse.json(
      await setShortlisted(trustDeps(ctx), { sessionWallet: wallet, jobId: id, proposalId, shortlisted: false })
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
