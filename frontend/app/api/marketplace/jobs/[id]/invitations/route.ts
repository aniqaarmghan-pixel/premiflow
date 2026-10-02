import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import {
  limitMarketplaceWrites,
  marketplaceSessionWallet,
  marketplaceTrustContext,
  trustDeps,
} from "@/lib/server/marketplace/route-context";
import { inviteFreelancer, listJobInvitations } from "@/lib/server/marketplace/trust-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only list of invitations sent for this job. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    return NextResponse.json({ invitations: await listJobInvitations(trustDeps(ctx), { sessionWallet: wallet, jobId: id }) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Owner invites a freelancer: body { invitee, message }. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireMutatingOrigin(request);
    const { id } = await context.params;
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    const invitation = await inviteFreelancer(trustDeps(ctx), {
      sessionWallet: wallet,
      jobId: id,
      invitee: body.invitee,
      message: body.message,
    });
    return NextResponse.json({ invitation }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
