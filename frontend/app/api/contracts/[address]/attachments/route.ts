import { NextResponse } from "next/server";

import {
  AttachmentAccessError,
  AttachmentStorageError,
  AttachmentValidationError,
  uploadPendingAttachment,
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
  if (err instanceof AttachmentStorageError) {
    return new HttpError(503, "backend_unavailable", err.message);
  }
  if (err instanceof BlobConfigError) {
    return new HttpError(
      503,
      "backend_unavailable",
      "Attachment storage is temporarily unavailable."
    );
  }
  return err;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const requestStartedAt = Date.now();
  try {
    requireMutatingOrigin(request);
    const { address } = await context.params;
    const authStartedAt = Date.now();
    const { stores, session, parties } = await requireMessageParticipant(
      request,
      address
    );
    const authMs = Date.now() - authStartedAt;
    const form = await request.formData();
    const file = form.get("file");
    const contextField = form.get("context");
    if (!(file instanceof File)) {
      throw new AttachmentValidationError("A file is required.");
    }
    const attachment = await uploadPendingAttachment(
      stores,
      productionBlobStorage(),
      {
        contractAddress: address,
        sessionWallet: session.walletAddress,
        parties,
        context: contextField,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        byteSize: file.size,
        body: file,
      }
    );
    if (
      process.env.NODE_ENV === "development" ||
      process.env.ATTACHMENT_UPLOAD_TIMING === "1"
    ) {
      console.info("[premiflow:attachment-upload-route]", {
        attachmentContext:
          typeof contextField === "string" ? contextField : "unknown",
        contentType: file.type || "application/octet-stream",
        byteSize: file.size,
        authMs,
        totalRequestMs: Date.now() - requestStartedAt,
      });
    }
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (err) {
    return handleRouteError(validationError(err));
  }
}
