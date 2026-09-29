import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireMutatingOrigin,
  requireSession,
} from "@/lib/server/api-guard";
import { productionStores } from "@/lib/server/compose";
import { HttpError, readJsonObject } from "@/lib/server/http";
import {
  OfferLifecycleError,
  isOfferLifecycleKind,
  notifyOfferLifecycle,
} from "@/lib/server/notifications/offer-lifecycle";
import {
  connectionSnapshotReader,
  readContractSnapshot,
} from "@/lib/server/solana/read-contract-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Idempotent offer lifecycle notification. Authenticated by the session cookie;
 * the contract status and parties are re-read from chain so a retry, a stale
 * client, or a wrong caller can never create or spam notifications.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const env = requireMutatingOrigin(request);
    const { address } = await context.params;
    const stores = productionStores();
    const session = await requireSession(request, stores, env);
    const body = await readJsonObject(request);
    if (!isOfferLifecycleKind(body.kind)) {
      throw new HttpError(400, "invalid_kind", "Unsupported lifecycle notification.");
    }
    const snapshot = await readContractSnapshot(
      connectionSnapshotReader(env.solanaRpcUrl),
      address
    );
    const result = await notifyOfferLifecycle(stores.notifications, {
      kind: body.kind,
      contractAddress: snapshot.address,
      callerWallet: session.walletAddress,
      facts: snapshot.facts,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof OfferLifecycleError) {
      return handleRouteError(
        new HttpError(err.code === "forbidden" ? 403 : 409, err.code, err.message)
      );
    }
    return handleRouteError(err);
  }
}
