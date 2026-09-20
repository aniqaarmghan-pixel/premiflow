import { NextResponse } from "next/server";

import { handleRouteError, requireMessageParticipant, requireMutatingOrigin } from "@/lib/server/api-guard";
import { HttpError, readJsonObject } from "@/lib/server/http";
import { MessageValidationError, markThreadRead } from "@/lib/server/messages/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    requireMutatingOrigin(request);
    const { address } = await context.params;
    const { stores, session } = await requireMessageParticipant(request, address);
    const body = await readJsonObject(request);
    const lastReadMessageId =
      typeof body.lastReadMessageId === "string" ? body.lastReadMessageId : "";
    const result = await markThreadRead(stores.messages, {
      contractAddress: address,
      wallet: session.walletAddress,
      lastReadMessageId,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MessageValidationError) {
      return handleRouteError(new HttpError(400, "invalid_message", err.message));
    }
    return handleRouteError(err);
  }
}
