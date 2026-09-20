import { AuthError, readSession } from "./auth/service";
import { authConfigFromEnv, productionStores, type MessagingStores } from "./compose";
import { getServerEnv, ServerConfigError, type ServerEnv } from "./env";
import { HttpError, SESSION_COOKIE, assertOrigin, jsonError, readCookie } from "./http";
import { isAuthorizedMessageWallet } from "./messages/authorize";
import { RateLimitedError } from "./rate-limit";
import {
  ContractPartiesError,
  connectionAccountReader,
  readContractParties,
  type ContractParties,
} from "./solana/read-contract-parties";
import type { SessionRecord } from "./stores";

export function handleRouteError(err: unknown) {
  if (err instanceof HttpError) return jsonError(err.status, err.code, err.message);
  if (err instanceof RateLimitedError) {
    return jsonError(429, "rate_limited", "Too many requests. Try again shortly.");
  }
  if (err instanceof AuthError) {
    const status =
      err.code === "unauthenticated" ||
      err.code === "expired_session" ||
      err.code === "revoked_session"
        ? 401
        : err.code === "invalid_wallet"
          ? 400
          : err.code === "invalid_signature" ||
              err.code === "invalid_challenge" ||
              err.code === "expired_challenge" ||
              err.code === "consumed_challenge"
            ? 400
            : 401;
    return jsonError(status, err.code, err.message);
  }
  if (err instanceof ContractPartiesError) {
    if (err.code === "rpc_failure") {
      return jsonError(502, "rpc_unavailable", "Contract parties could not be checked.");
    }
    if (err.code === "invalid_address") {
      return jsonError(400, "invalid_address", "Contract address is invalid.");
    }
    return jsonError(404, "not_found", "Contract was not found.");
  }
  if (err instanceof ServerConfigError) {
    return jsonError(503, "backend_unavailable", "Messaging is temporarily unavailable.");
  }
  return jsonError(500, "internal", "Something went wrong.");
}

export async function requireSession(
  request: Request,
  stores: MessagingStores,
  env: ServerEnv
): Promise<SessionRecord> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  return readSession(stores.auth, authConfigFromEnv(env), token);
}

export async function requireMessageParticipant(
  request: Request,
  contractAddress: string
): Promise<{
  env: ServerEnv;
  stores: MessagingStores;
  session: SessionRecord;
  parties: ContractParties;
}> {
  const env = getServerEnv();
  const stores = productionStores();
  const session = await requireSession(request, stores, env);
  const parties = await readContractParties(
    connectionAccountReader(env.solanaRpcUrl),
    contractAddress
  );
  if (!isAuthorizedMessageWallet(session.walletAddress, parties)) {
    throw new HttpError(403, "forbidden", "Not a participant on this contract.");
  }
  return { env, stores, session, parties };
}

export function requireMutatingOrigin(request: Request, env = getServerEnv()): ServerEnv {
  assertOrigin(request, env.appOrigin);
  return env;
}
