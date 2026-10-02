import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireCaseParty,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import { addMessageEvidence } from "@/lib/server/cases/service";
import { readJsonObject } from "@/lib/server/http";
import { connectionCaseFactsReader } from "@/lib/server/solana/read-contract-case-facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Explicit party-only submission of one selected contract-message snapshot.
 *
 * The resolver never receives general contract-message access. Once this
 * snapshot is stored, the Resolution Case GET may expose the immutable copy
 * to the designated resolver through the existing read-only case permission.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    requireMutatingOrigin(request);

    const { address } = await context.params;
    const { stores, session, env } = await requireCaseParty(
      request,
      address
    );

    const body = await readJsonObject(request);

    const result = await addMessageEvidence(
      stores,
      connectionCaseFactsReader(env.solanaRpcUrl),
      {
        contractAddress: address,
        sessionWallet: session.walletAddress,
        messageId: body.messageId,
      }
    );

    return NextResponse.json({ case: result });
  } catch (err) {
    return handleRouteError(err);
  }
}
