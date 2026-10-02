import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireCaseViewer,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import { recordCaseResolveSignature } from "@/lib/server/cases/resolve-signature";
import { readJsonObject } from "@/lib/server/http";
import { connectionCaseFactsReader } from "@/lib/server/solana/read-contract-case-facts";
import { connectionResolveTxVerifier } from "@/lib/server/solana/verify-resolve-tx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Records the confirmed resolve_dispute signature (resolver only, write-once). */
export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    requireMutatingOrigin(request);
    const { address } = await context.params;
    const { stores, session, env } = await requireCaseViewer(request, address);
    const body = await readJsonObject(request);
    const result = await recordCaseResolveSignature(
      stores.cases,
      connectionCaseFactsReader(env.solanaRpcUrl),
      connectionResolveTxVerifier(env.solanaRpcUrl),
      {
        contractAddress: address,
        sessionWallet: session.walletAddress,
        signature: body.signature,
      }
    );
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
