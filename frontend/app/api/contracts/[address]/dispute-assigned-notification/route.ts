import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireMutatingOrigin,
  requireSession,
} from "@/lib/server/api-guard";
import { parseContractAddress } from "@/lib/server/cases/service";
import { productionStores } from "@/lib/server/compose";
import { HttpError } from "@/lib/server/http";
import {
  DisputeAssignedError,
  notifyDisputeAssigned,
} from "@/lib/server/notifications/dispute-assigned";
import { connectionCaseFactsReader } from "@/lib/server/solana/read-contract-case-facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Idempotent resolver "New dispute assigned" notification. Authenticated by
 * the session cookie; status, resolver and disputed_at are re-read from chain
 * so a stale client or unrelated wallet can never create or spam rows.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const env = requireMutatingOrigin(request);
    const { address } = await context.params;
    const contractAddress = parseContractAddress(address);
    const stores = productionStores();
    const session = await requireSession(request, stores, env);
    const facts = await connectionCaseFactsReader(env.solanaRpcUrl).read(contractAddress);
    const result = await notifyDisputeAssigned(stores.notifications, {
      contractAddress,
      callerWallet: session.walletAddress,
      facts,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof DisputeAssignedError) {
      return handleRouteError(
        new HttpError(err.code === "forbidden" ? 403 : 409, err.code, err.message)
      );
    }
    return handleRouteError(err);
  }
}
