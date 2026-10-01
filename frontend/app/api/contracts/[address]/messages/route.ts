import { NextResponse } from "next/server";

import { requireAccountContractParticipant } from "@/lib/server/account-auth/contract-participant";
import {
  handleRouteError,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
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
    const url = new URL(request.url);

    const { stores, participantWallet } =
      await requireAccountContractParticipant(
        request,
        address,
        url.searchParams.get("participantWallet")
      );

    const result = await listContractMessages(
      stores.messages,
      {
        contractAddress: address,
        cursor: url.searchParams.get("cursor"),
        limit: url.searchParams.get("limit"),
        wallet: participantWallet,
      },
      stores.attachments
    );

    return NextResponse.json({
      ...result,
      participantWallet,
    });
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
    const body = await readJsonObject(request);

    const requestedWallet =
      typeof body.participantWallet === "string"
        ? body.participantWallet
        : null;

    const { stores, parties, participantWallet } =
      await requireAccountContractParticipant(
        request,
        address,
        requestedWallet
      );

    const message = await createContractMessage(stores, {
      contractAddress: address,
      wallet: participantWallet,
      body: body.body,
      attachmentIds: body.attachmentIds,
    });

    try {
      await notifyOtherPartyOfMessage(stores.notifications, {
        contractAddress: message.contractAddress,
        messageId: message.id,
        senderWallet: participantWallet,
        parties,
      });
    } catch (notifyErr) {
      console.error("[notifications] message_received emit failed", {
        messageId: message.id,
        contractAddress: message.contractAddress,
        error:
          notifyErr instanceof Error ? notifyErr.message : "unknown",
      });
    }

    return NextResponse.json({ message });
  } catch (err) {
    return handleRouteError(validationError(err));
  }
}
