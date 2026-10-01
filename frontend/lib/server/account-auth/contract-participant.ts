import { productionStores } from "@/lib/server/compose";
import { getServerEnv } from "@/lib/server/env";
import { HttpError } from "@/lib/server/http";
import {
  connectionAccountReader,
  readContractParties,
} from "@/lib/server/solana/read-contract-parties";

import {
  AccountSessionRequiredError,
  requireAccountSession,
} from "./session";
import { listAccountWalletLinks } from "./wallet-links";

/**
 * Account-first authorization for private contract resources.
 *
 * Wallet ownership comes only from verified PREMIFLOW account links.
 * A client may request which linked contract-party wallet to act as,
 * but the server always verifies that selection.
 *
 * This does NOT authorize Solana transactions.
 */
export async function requireAccountContractParticipant(
  request: Request,
  contractAddress: string,
  requestedWallet: string | null = null
) {
  let accountSession: Awaited<ReturnType<typeof requireAccountSession>>;

  try {
    accountSession = await requireAccountSession(request);
  } catch (err) {
    if (err instanceof AccountSessionRequiredError) {
      throw new HttpError(
        401,
        "account_unauthenticated",
        "Sign in to your PREMIFLOW account."
      );
    }
    throw err;
  }

  const links = await listAccountWalletLinks(accountSession.user.id);
  const linkedWallets = new Set(links.map((link) => link.walletAddress));

  const env = getServerEnv();
  const stores = productionStores();

  const parties = await readContractParties(
    connectionAccountReader(env.solanaRpcUrl),
    contractAddress
  );

  const participantWallets = Array.from(
    new Set(
      [parties.employer, parties.freelancer].filter((wallet) =>
        linkedWallets.has(wallet)
      )
    )
  );

  if (participantWallets.length === 0) {
    throw new HttpError(
      403,
      "forbidden",
      "Your PREMIFLOW account is not a participant on this contract."
    );
  }

  let participantWallet = participantWallets[0];

  if (requestedWallet) {
    if (!participantWallets.includes(requestedWallet)) {
      throw new HttpError(
        403,
        "forbidden",
        "That wallet is not an authorized linked participant for this contract."
      );
    }

    participantWallet = requestedWallet;
  }

  return {
    env,
    stores,
    accountSession,
    parties,
    participantWallets,
    participantWallet,
  };
}
