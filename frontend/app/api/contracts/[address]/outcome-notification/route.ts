import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import {
  handleRouteError,
  requireMutatingOrigin,
  requireSession,
} from "@/lib/server/api-guard";
import { productionStores } from "@/lib/server/compose";
import { HttpError, readJsonObject } from "@/lib/server/http";
import {
  ContractOutcomeError,
  isContractOutcomeKind,
  notifyContractOutcome,
} from "@/lib/server/notifications/contract-outcome";
import { connectionCaseFactsReader } from "@/lib/server/solana/read-contract-case-facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Idempotent confirmed-outcome notification (contract ended/cancelled,
 * settlement recorded). Session-authenticated; status, parties and settlement
 * amounts are re-read from chain so a stale client cannot spam or spoof.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const env = requireMutatingOrigin(request);
    const { address } = await context.params;
    let contractAddress: string;
    try {
      contractAddress = new PublicKey(address).toBase58();
    } catch {
      throw new HttpError(400, "invalid_address", "Invalid contract address.");
    }
    const stores = productionStores();
    const session = await requireSession(request, stores, env);
    const body = await readJsonObject(request);
    if (!isContractOutcomeKind(body.kind)) {
      throw new HttpError(400, "invalid_kind", "Unsupported outcome notification.");
    }
    const facts = await connectionCaseFactsReader(env.solanaRpcUrl).read(contractAddress);
    const result = await notifyContractOutcome(stores.notifications, {
      kind: body.kind,
      contractAddress,
      callerWallet: session.walletAddress,
      facts,
    });
    return NextResponse.json({ created: result.created }, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof ContractOutcomeError) {
      return handleRouteError(
        new HttpError(err.code === "forbidden" ? 403 : 409, err.code, err.message)
      );
    }
    return handleRouteError(err);
  }
}
