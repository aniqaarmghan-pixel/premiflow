import { handleRouteError, requireCaseViewer } from "@/lib/server/api-guard";
import { authorizeCaseFileEvidenceDownload } from "@/lib/server/cases/file-evidence";
import { productionBlobStorage } from "@/lib/server/compose";
import { BlobConfigError } from "@/lib/server/blob/env";
import { HttpError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Employer, freelancer, or designated resolver: one submitted evidence file only. */
export async function GET(
  request: Request,
  context: { params: Promise<{ address: string; id: string }> }
) {
  try {
    const { address, id } = await context.params;
    const { stores, session, facts } = await requireCaseViewer(request, address);
    const result = await authorizeCaseFileEvidenceDownload(stores, productionBlobStorage(), {
      contractAddress: address,
      viewerWallet: session.walletAddress,
      facts,
      evidenceId: id,
    });
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
    if (err instanceof BlobConfigError) {
      return handleRouteError(new HttpError(503, "backend_unavailable", err.message));
    }
    return handleRouteError(err);
  }
}
