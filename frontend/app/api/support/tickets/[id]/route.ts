import { NextResponse } from "next/server";

import { requireAccountUser } from "@/lib/server/admin/auth";
import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { productionSupportStore } from "@/lib/server/compose";
import { readJsonObject } from "@/lib/server/http";
import { getOwnSupportTicket, replyToOwnSupportTicket } from "@/lib/server/support/service";
import { supportRouteError } from "@/lib/server/support/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const account = await requireAccountUser(request);
    const detail = await getOwnSupportTicket(productionSupportStore(), account.userId, id);
    return NextResponse.json(detail);
  } catch (err) {
    return handleRouteError(supportRouteError(err));
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireMutatingOrigin(request);
    const { id } = await context.params;
    const account = await requireAccountUser(request);
    const body = await readJsonObject(request);
    const detail = await replyToOwnSupportTicket(productionSupportStore(), {
      userId: account.userId,
      ticketId: id,
      body: body.body,
    });
    return NextResponse.json(detail);
  } catch (err) {
    return handleRouteError(supportRouteError(err));
  }
}
