import { listAccountWalletLinks } from "../account-auth/wallet-links";
import { HttpError } from "../http";
import { SupportNotFoundError, SupportValidationError } from "./service";

export function supportRouteError(err: unknown): unknown {
  if (err instanceof SupportValidationError) {
    return new HttpError(400, "invalid_request", err.message);
  }
  if (err instanceof SupportNotFoundError) {
    return new HttpError(404, "not_found", err.message);
  }
  return err;
}

/** Wallet inboxes linked to the ticket owner's account (notifications are wallet-scoped). */
export async function accountRecipientWallets(userId: string): Promise<string[]> {
  const links = await listAccountWalletLinks(userId);
  return links.map((item) => item.walletAddress);
}
