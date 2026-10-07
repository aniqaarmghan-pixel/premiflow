import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireCaseParty,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import { addFileEvidence } from "@/lib/server/cases/file-evidence";
import { readJsonObject } from "@/lib/server/http";
import { connectionCaseFactsReader } from "@/lib/server/solana/read-contract-case-facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Party-only: submit one already-uploaded private `case_evidence` file as an
 * immutable Resolution Case evidence record. The resolver can read it through
 * the case download route but can never alter or remove it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    requireMutatingOrigin(request);
    const { address } = await context.params;
    const { stores, session, env } = await requireCaseParty(request, address);
    const body = await readJsonObject(request);
    const result = await addFileEvidence(stores, connectionCaseFactsReader(env.solanaRpcUrl), {
      contractAddress: address,
      sessionWallet: session.walletAddress,
      attachmentId: body.attachmentId,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return handleRouteError(err);
  }
}
