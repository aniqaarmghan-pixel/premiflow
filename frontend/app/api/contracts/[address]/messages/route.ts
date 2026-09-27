import { NextResponse } from "next/server";

import { handleRouteError, requireMessageParticipant, requireMutatingOrigin } from "@/lib/server/api-guard";
import { HttpError, readJsonObject } from "@/lib/server/http";
import {
  MessageValidationError,
  createContractMessage,
  listContractMessages,
} from "@/lib/server/messages/service";
import { notifyOtherPartyOfMessage } from "@/lib/server/notifications/message-received";

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
    const result = await listContractMessages(
      stores.messages,
      {
        contractAddress: address,
        cursor: url.searchParams.get("cursor"),
        limit: url.searchParams.get("limit"),
        wallet: session.walletAddress,
      },
      stores.attachments
    );
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
    const { stores, session, parties } = await requireMessageParticipant(request, address);
    const body = await readJsonObject(request);
    const message = await createContractMessage(stores, {
      contractAddress: address,
      wallet: session.walletAddress,
      body: body.body,
      attachmentIds: body.attachmentIds,
    });
    // Message is authoritative once persisted. Notification is best-effort so a
    // Neon inbox write failure never undoes chat delivery.
    try {
      await notifyOtherPartyOfMessage(stores.notifications, {
        contractAddress: message.contractAddress,
        messageId: message.id,
        senderWallet: session.walletAddress,
        parties,
      });
    } catch (notifyErr) {
      console.error("[notifications] message_received emit failed", {
        messageId: message.id,
        contractAddress: message.contractAddress,
        error: notifyErr instanceof Error ? notifyErr.message : "unknown",
      });
    }
    return NextResponse.json({ message });
  } catch (err) {
    return handleRouteError(validationError(err));
  }
}
