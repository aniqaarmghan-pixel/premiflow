import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api-guard";
import { marketplaceTrustContext } from "@/lib/server/marketplace/route-context";
import { getTrustSummary } from "@/lib/server/marketplace/trust-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, computed trust summary (verified reviews only; nothing self-entered). */
export async function GET(_request: Request, context: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet } = await context.params;
    const ctx = marketplaceTrustContext();
    return NextResponse.json({ summary: await getTrustSummary({ trust: ctx.trust }, { wallet }) });
  } catch (err) {
    return handleRouteError(err);
  }
}
