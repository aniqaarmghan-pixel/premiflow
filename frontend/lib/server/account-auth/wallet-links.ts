import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getAccountAuthDb } from "./db";
import { walletLink } from "./schema";

export class WalletLinkConflictError extends Error {
  constructor() {
    super("This wallet is already linked to another PREMIFLOW account.");
    this.name = "WalletLinkConflictError";
  }
}

export async function listAccountWalletLinks(userId: string) {
  const db = getAccountAuthDb();

  return db
    .select({
      id: walletLink.id,
      walletAddress: walletLink.walletAddress,
      createdAt: walletLink.createdAt,
      verifiedAt: walletLink.verifiedAt,
    })
    .from(walletLink)
    .where(eq(walletLink.userId, userId))
    .orderBy(walletLink.createdAt);
}

export async function linkVerifiedWallet(
  userId: string,
  walletAddress: string
) {
  const db = getAccountAuthDb();

  const existing = await db
    .select({
      id: walletLink.id,
      userId: walletLink.userId,
      walletAddress: walletLink.walletAddress,
      createdAt: walletLink.createdAt,
      verifiedAt: walletLink.verifiedAt,
    })
    .from(walletLink)
    .where(eq(walletLink.walletAddress, walletAddress))
    .limit(1);

  const found = existing[0];

  if (found) {
    if (found.userId !== userId) {
      throw new WalletLinkConflictError();
    }

    return found;
  }

  const rows = await db
    .insert(walletLink)
    .values({
      id: randomUUID(),
      userId,
      walletAddress,
    })
    .returning({
      id: walletLink.id,
      userId: walletLink.userId,
      walletAddress: walletLink.walletAddress,
      createdAt: walletLink.createdAt,
      verifiedAt: walletLink.verifiedAt,
    });

  return rows[0];
}
