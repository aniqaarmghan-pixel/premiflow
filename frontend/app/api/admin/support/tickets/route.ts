import { NextResponse } from "next/server";

import { requireAppAdmin } from "@/lib/server/admin/auth";
import { handleRouteError } from "@/lib/server/api-guard";
import { productionSupportStore } from "@/lib/server/compose";
import { adminListSupportTickets, parseStatusFilter } from "@/lib/server/support/service";
import { supportRouteError } from "@/lib/server/support/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAppAdmin(request);
    const status = parseStatusFilter(new URL(request.url).searchParams.get("status"));
    const tickets = await adminListSupportTickets(productionSupportStore(), { status });
    return NextResponse.json({ tickets });
  } catch (err) {
    return handleRouteError(supportRouteError(err));
  }
}
