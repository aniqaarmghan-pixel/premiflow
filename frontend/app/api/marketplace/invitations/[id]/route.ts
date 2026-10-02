import { NextResponse } from "next/server";

import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { readJsonObject } from "@/lib/server/http";
import {
  limitMarketplaceWrites,
  marketplaceSessionWallet,
  marketplaceTrustContext,
  trustDeps,
} from "@/lib/server/marketplace/route-context";
import { respondToInvitation } from "@/lib/server/marketplace/trust-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Invited freelancer answers: body { action: "accept" | "decline" }. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireMutatingOrigin(request);
    const { id } = await context.params;
    const ctx = marketplaceTrustContext();
    const wallet = await marketplaceSessionWallet(request, ctx);
    await limitMarketplaceWrites(ctx, wallet);
    const body = await readJsonObject(request);
    const invitation = await respondToInvitation(trustDeps(ctx), {
      sessionWallet: wallet,
      invitationId: id,
      action: body.action,
    });
    return NextResponse.json({ invitation });
  } catch (err) {
    return handleRouteError(err);
  }
}
