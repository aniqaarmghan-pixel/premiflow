import { NextResponse } from "next/server";

import { requireAppAdmin } from "@/lib/server/admin/auth";
import { handleRouteError, requireMutatingOrigin } from "@/lib/server/api-guard";
import { productionStores, productionSupportStore } from "@/lib/server/compose";
import { readJsonObject } from "@/lib/server/http";
import {
  adminGetSupportTicket,
  adminReplyToSupportTicket,
  adminSetSupportTicketStatus,
} from "@/lib/server/support/service";
import { accountRecipientWallets, supportRouteError } from "@/lib/server/support/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    await requireAppAdmin(request);
    const { id } = await context.params;
    return NextResponse.json(await adminGetSupportTicket(productionSupportStore(), id));
  } catch (err) {
    return handleRouteError(supportRouteError(err));
  }
}

/** Help Desk reply (notifies the requester once per reply). */
export async function POST(request: Request, context: Ctx) {
  try {
    requireMutatingOrigin(request);
    const admin = await requireAppAdmin(request);
    const { id } = await context.params;
    const body = await readJsonObject(request);
    const detail = await adminReplyToSupportTicket(
      { support: productionSupportStore(), notifications: productionStores().notifications },
      { adminUserId: admin.userId, ticketId: id, body: body.body, recipients: accountRecipientWallets }
    );
    return NextResponse.json(detail);
  } catch (err) {
    return handleRouteError(supportRouteError(err));
  }
}

/** Status change: open / in_progress / resolved. Unchanged status never notifies. */
export async function PATCH(request: Request, context: Ctx) {
  try {
    requireMutatingOrigin(request);
    await requireAppAdmin(request);
    const { id } = await context.params;
    const body = await readJsonObject(request);
    const { detail } = await adminSetSupportTicketStatus(
      { support: productionSupportStore(), notifications: productionStores().notifications },
      { ticketId: id, status: body.status, recipients: accountRecipientWallets }
    );
    return NextResponse.json(detail);
  } catch (err) {
    return handleRouteError(supportRouteError(err));
  }
}
