import { NextResponse } from "next/server";

import { requireAccountContractParticipant } from "@/lib/server/account-auth/contract-participant";
import {
  handleRouteError,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import { HttpError, readJsonObject } from "@/lib/server/http";
import {
  MessageValidationError,
  markThreadRead,
} from "@/lib/server/messages/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    requireMutatingOrigin(request);

    const { address } = await context.params;
    const body = await readJsonObject(request);

    const requestedWallet =
      typeof body.participantWallet === "string"
        ? body.participantWallet
        : null;

    const { stores, participantWallet } =
      await requireAccountContractParticipant(
        request,
        address,
        requestedWallet
      );

    const lastReadMessageId =
      typeof body.lastReadMessageId === "string"
        ? body.lastReadMessageId
        : "";

    const result = await markThreadRead(stores.messages, {
      contractAddress: address,
      wallet: participantWallet,
      lastReadMessageId,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MessageValidationError) {
      return handleRouteError(
        new HttpError(400, "invalid_message", err.message)
      );
    }

    return handleRouteError(err);
  }
}
