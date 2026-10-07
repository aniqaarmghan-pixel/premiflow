import { NextResponse } from "next/server";

import { requireAccountUser } from "@/lib/server/admin/auth";
import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { productionSupportStore } from "@/lib/server/compose";
import { readJsonObject } from "@/lib/server/http";
import { createSupportTicket, listOwnSupportTickets } from "@/lib/server/support/service";
import { supportRouteError } from "@/lib/server/support/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in account's own tickets only. */
export async function GET(request: Request) {
  try {
    const account = await requireAccountUser(request);
    const tickets = await listOwnSupportTickets(productionSupportStore(), account.userId);
    return NextResponse.json({ tickets });
  } catch (err) {
    return handleRouteError(supportRouteError(err));
  }
}

export async function POST(request: Request) {
  try {
    requireMutatingOrigin(request);
    const account = await requireAccountUser(request);
    const body = await readJsonObject(request);
    const detail = await createSupportTicket(productionSupportStore(), {
      userId: account.userId,
      requesterEmail: account.email,
      body,
    });
    return NextResponse.json(detail, { status: 201 });
  } catch (err) {
    return handleRouteError(supportRouteError(err));
  }
}
