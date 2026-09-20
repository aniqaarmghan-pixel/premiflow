import { NextResponse } from "next/server";

import { handleRouteError, requireMessageParticipant, requireMutatingOrigin } from "@/lib/server/api-guard";
import { HttpError, readJsonObject } from "@/lib/server/http";
import {
  MessageValidationError,
  createContractMessage,
  listContractMessages,
} from "@/lib/server/messages/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validationError(err: unknown) {
  if (err instanceof MessageValidationError) {
    return new HttpError(400, "invalid_message", err.message);
  }
  return err;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await context.params;
    const { stores, session } = await requireMessageParticipant(request, address);
    const url = new URL(request.url);
    const result = await listContractMessages(stores.messages, {
      contractAddress: address,
      cursor: url.searchParams.get("cursor"),
      limit: url.searchParams.get("limit"),
      wallet: session.walletAddress,
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(validationError(err));
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    requireMutatingOrigin(request);
    const { address } = await context.params;
    const { stores, session } = await requireMessageParticipant(request, address);
    const body = await readJsonObject(request);
    const message = await createContractMessage(stores, {
      contractAddress: address,
      wallet: session.walletAddress,
      body: body.body,
    });
    return NextResponse.json({ message });
  } catch (err) {
    return handleRouteError(validationError(err));
  }
}
