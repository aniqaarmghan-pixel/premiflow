import {
  AttachmentAccessError,
  AttachmentValidationError,
  authorizeAttachmentDownload,
} from "@/lib/server/attachments/service";
import {
  handleRouteError,
  requireMessageParticipant,
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

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string; id: string }> }
) {
  try {
    const { address, id } = await context.params;
    const { stores, session, parties } = await requireMessageParticipant(
      request,
      address
    );
    const result = await authorizeAttachmentDownload(
      stores,
      productionBlobStorage(),
      {
        contractAddress: address,
        sessionWallet: session.walletAddress,
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
