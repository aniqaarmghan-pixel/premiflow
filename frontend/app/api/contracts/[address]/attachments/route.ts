import { NextResponse } from "next/server";

import {
  AttachmentAccessError,
  AttachmentStorageError,
  AttachmentValidationError,
  uploadPendingAttachment,
} from "@/lib/server/attachments/service";
import {
  handleRouteError,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import { requireAccountContractParticipant } from "@/lib/server/account-auth/contract-participant";
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
    const form = await request.formData();
    const file = form.get("file");
    const contextField = form.get("context");

    const participantWalletField = form.get("participantWallet");
    const requestedWallet =
      typeof participantWalletField === "string" &&
      participantWalletField.length > 0
        ? participantWalletField
        : null;

    const {
      stores,
      parties,
      participantWallets,
      participantWallet,
    } = await requireAccountContractParticipant(
      request,
      address,
      requestedWallet
    );

    // Work-submission files always belong to the freelancer side.
    // Message files use the requested verified participant, or the
    // account-first default when no side was explicitly requested.
    const actingWallet =
      contextField === "work_submission" &&
      participantWallets.includes(parties.freelancer)
        ? parties.freelancer
        : participantWallet;

    const authMs = Date.now() - authStartedAt;
    if (!(file instanceof File)) {
      throw new AttachmentValidationError("A file is required.");
    }
    const attachment = await uploadPendingAttachment(
      stores,
      productionBlobStorage(),
      {
        contractAddress: address,
        sessionWallet: actingWallet,
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
