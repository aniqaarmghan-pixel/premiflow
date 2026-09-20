import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireCaseParty,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import { upsertOwnStatement } from "@/lib/server/cases/service";
import { readJsonObject } from "@/lib/server/http";
import { connectionCaseFactsReader } from "@/lib/server/solana/read-contract-case-facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    requireMutatingOrigin(request);
    const { address } = await context.params;
    const { stores, session, env } = await requireCaseParty(request, address);
    const body = await readJsonObject(request);
    const result = await upsertOwnStatement(
      stores,
      connectionCaseFactsReader(env.solanaRpcUrl),
      {
        contractAddress: address,
        sessionWallet: session.walletAddress,
        body: body.body,
        wallet: body.wallet,
        partyWallet: body.partyWallet,
        partyRole: body.partyRole,
        targetWallet: body.targetWallet,
      }
    );
    return NextResponse.json({ case: result });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  return PUT(request, context);
}
