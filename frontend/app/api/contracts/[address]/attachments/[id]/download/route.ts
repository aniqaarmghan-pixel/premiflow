import {
  AttachmentAccessError,
  AttachmentValidationError,
  authorizeAttachmentDownload,
} from "@/lib/server/attachments/service";
import { handleRouteError } from "@/lib/server/api-guard";
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
  if (err instanceof BlobConfigError) {
    return new HttpError(503, "backend_unavailable", err.message);
  }
  return err;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string; id: string }> }
) {
  try {
    const { address, id } = await context.params;

    const {
      stores,
      parties,
      participantWallets,
      participantWallet,
    } = await requireAccountContractParticipant(request, address);

    const row = await stores.attachments.getById(id);

    // Pending uploads remain private to their uploader. For active
    // attachments, any authorized contract participant may read them.
    const actingWallet =
      row && participantWallets.includes(row.uploaderWallet)
        ? row.uploaderWallet
        : participantWallet;

    const result = await authorizeAttachmentDownload(
      stores,
      productionBlobStorage(),
      {
        contractAddress: address,
        sessionWallet: actingWallet,
        parties,
        attachmentId: id,
      }
    );
    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": result.contentDisposition,
        "Content-Length": String(result.byteSize),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return handleRouteError(validationError(err));
  }
}
