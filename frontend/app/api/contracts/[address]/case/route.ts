import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireCaseParty,
  requireCaseViewer,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import {
  createOrRecoverResolutionCase,
  getResolutionCase,
  updateCaseNotes,
} from "@/lib/server/cases/service";
import { readJsonObject } from "@/lib/server/http";
import { connectionCaseFactsReader } from "@/lib/server/solana/read-contract-case-facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await context.params;
    const { stores, session, env, viewerRole } = await requireCaseViewer(request, address);
    const result = await getResolutionCase(
      stores.cases,
      connectionCaseFactsReader(env.solanaRpcUrl),
      { contractAddress: address, sessionWallet: session.walletAddress },
      new Date(),
      { allowResolver: viewerRole === "resolver" }
    );
    return NextResponse.json({ case: result });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    requireMutatingOrigin(request);
    const { address } = await context.params;
    const { stores, session, env } = await requireCaseParty(request, address);
    const body = await readJsonObject(request);
    const result = await createOrRecoverResolutionCase(
      stores,
      connectionCaseFactsReader(env.solanaRpcUrl),
      {
        contractAddress: address,
        sessionWallet: session.walletAddress,
        category: body.category,
        description: body.description,
        openSignature: body.openSignature,
        wallet: body.wallet,
        partyRole: body.partyRole,
        resolverWallet: body.resolverWallet,
        contestedAmount: body.contestedAmount,
        disputeOpener: body.disputeOpener,
        freelancerContestedAward: body.freelancerContestedAward,
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
  try {
    requireMutatingOrigin(request);
    const { address } = await context.params;
    const { stores, session, env } = await requireCaseParty(request, address);
    const body = await readJsonObject(request);
    const result = await updateCaseNotes(
      stores,
      connectionCaseFactsReader(env.solanaRpcUrl),
      {
        contractAddress: address,
        sessionWallet: session.walletAddress,
        ...(Object.prototype.hasOwnProperty.call(body, "category")
          ? { category: body.category }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(body, "description")
          ? { description: body.description }
          : {}),
        wallet: body.wallet,
        partyRole: body.partyRole,
      }
    );
    return NextResponse.json({ case: result });
  } catch (err) {
    return handleRouteError(err);
  }
}
