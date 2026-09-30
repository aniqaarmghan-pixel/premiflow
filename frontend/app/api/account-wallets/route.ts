import { NextResponse } from "next/server";

import {
  AccountSessionRequiredError,
  requireAccountSession,
} from "@/lib/server/account-auth/session";
import {
  linkVerifiedWallet,
  listAccountWalletLinks,
  WalletLinkConflictError,
} from "@/lib/server/account-auth/wallet-links";
import { requireSession } from "@/lib/server/api-guard";
import { productionStores } from "@/lib/server/compose";
import { getServerEnv } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(err: unknown) {
  if (err instanceof AccountSessionRequiredError) {
    return NextResponse.json(
      { error: "account_unauthenticated", message: err.message },
      { status: 401 }
    );
  }

  if (err instanceof WalletLinkConflictError) {
    return NextResponse.json(
      { error: "wallet_already_linked", message: err.message },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { error: "internal", message: "Something went wrong." },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    const accountSession = await requireAccountSession(request);

    const wallets = await listAccountWalletLinks(
      accountSession.user.id
    );

    return NextResponse.json({ wallets });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    // Website identity.
    const accountSession = await requireAccountSession(request);

    // Existing Solana challenge/signature identity.
    // The wallet address comes only from this verified server-side session.
    const env = getServerEnv();
    const walletSession = await requireSession(
      request,
      productionStores(),
      env
    );

    const link = await linkVerifiedWallet(
      accountSession.user.id,
      walletSession.walletAddress
    );

    return NextResponse.json({
      wallet: {
        address: link.walletAddress,
        createdAt: link.createdAt,
        verifiedAt: link.verifiedAt,
      },
    });
  } catch (err) {
    if (
      err instanceof AccountSessionRequiredError ||
      err instanceof WalletLinkConflictError
    ) {
      return errorResponse(err);
    }

    // Existing wallet auth errors are intentionally not converted into
    // successful links. No browser-supplied address is used as fallback.
    return NextResponse.json(
      {
        error: "wallet_verification_required",
        message: "Verify the connected wallet before linking it.",
      },
      { status: 401 }
    );
  }
}
