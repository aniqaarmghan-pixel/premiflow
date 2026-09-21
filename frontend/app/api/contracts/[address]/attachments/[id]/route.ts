import { NextResponse } from "next/server";

import {
  AttachmentAccessError,
  AttachmentValidationError,
  deletePendingAttachment,
} from "@/lib/server/attachments/service";
import {
  handleRouteError,
  requireMessageParticipant,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import { productionBlobStorage } from "@/lib/server/compose";
import { BlobConfigError } from "@/lib/server/blob/env";
import { HttpError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validationError(err: unknown) {
  if (err instanceof AttachmentValidationError) {
    return new HttpError(400, "invalid_attachment", err.message);
  }
  if (err instanceof AttachmentAccessError) {
    return new HttpError(403, "forbidden", err.message);
  }
  if (err instanceof BlobConfigError) {
    return new HttpError(503, "backend_unavailable", err.message);
  }
  return err;
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ address: string; id: string }> }
) {
  try {
    requireMutatingOrigin(request);
    const { address, id } = await context.params;
    const { stores, session } = await requireMessageParticipant(request, address);
    const result = await deletePendingAttachment(
      stores,
      productionBlobStorage(),
      {
        contractAddress: address,
        sessionWallet: session.walletAddress,
        attachmentId: id,
      }
    );
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(validationError(err));
  }
}
