import { AuthError, readSession } from "./auth/service";
import { CaseAccessError, CaseStateError, CaseValidationError } from "./cases/service";
import { CopilotSchemaError } from "@/lib/app/copilot-schemas";
import { CopilotModeError, CopilotValidationError } from "./copilot/service";
import { CopilotProviderError } from "./copilot/provider";
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
import {
  ContractCaseFactsError,
  connectionCaseFactsReader,
  type ContractCaseFacts,
} from "./solana/read-contract-case-facts";
import type { PartyStatementRole, SessionRecord } from "./stores";
import { casePartyRoleFromChain } from "./cases/authorize";

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
  if (err instanceof ContractPartiesError || err instanceof ContractCaseFactsError) {
    if (err.code === "rpc_failure") {
      return jsonError(502, "rpc_unavailable", "Contract parties could not be checked.");
    }
    if (err.code === "invalid_address") {
      return jsonError(400, "invalid_address", "Contract address is invalid.");
    }
    return jsonError(404, "not_found", "Contract was not found.");
  }
  if (err instanceof CaseValidationError) {
    return jsonError(400, "invalid_case", err.message);
  }
  if (err instanceof CaseAccessError) {
    return jsonError(403, "forbidden", err.message);
  }
  if (err instanceof CaseStateError) {
    const status = err.code === "case_not_found" ? 404 : 409;
    return jsonError(status, err.code, err.message);
  }
  if (err instanceof ServerConfigError) {
    return jsonError(503, "backend_unavailable", "Messaging is temporarily unavailable.");
  }
  if (err instanceof CopilotValidationError || err instanceof CopilotSchemaError) {
    return jsonError(400, "invalid_copilot", err.message);
  }
  if (err instanceof CopilotModeError) {
    return jsonError(400, "mode_not_available", err.message);
  }
  if (err instanceof CopilotProviderError) {
    return jsonError(502, "copilot_unavailable", "Copilot is temporarily unavailable.");
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

/**
 * Employer and freelancer party access for Resolution Case APIs.
 * Resolver access is prepared via casePartyRoleFromChain for R4 but is not
 * granted on party case routes in R2.
 */
export async function requireCaseParty(
  request: Request,
  contractAddress: string
): Promise<{
  env: ServerEnv;
  stores: MessagingStores;
  session: SessionRecord;
  facts: ContractCaseFacts;
  partyRole: PartyStatementRole;
}> {
  const env = getServerEnv();
  const stores = productionStores();
  const session = await requireSession(request, stores, env);
  const facts = await connectionCaseFactsReader(env.solanaRpcUrl).read(contractAddress);
  const role = casePartyRoleFromChain(session.walletAddress, facts);
  if (role !== "employer" && role !== "freelancer") {
    throw new HttpError(403, "forbidden", "Not a party on this contract.");
  }
  return { env, stores, session, facts, partyRole: role };
}

export function requireMutatingOrigin(request: Request, env = getServerEnv()): ServerEnv {
  assertOrigin(request, env.appOrigin);
  return env;
}

/**
 * Session if messaging env + cookie are present. Missing/expired session is
 * null so Create Assistant can still return deterministic guidance.
 * Does not weaken Messages/R2 requireSession.
 */
export async function tryOptionalSession(
  request: Request
): Promise<{ sessionWallet: string | null; stores: MessagingStores | null }> {
  try {
    const env = getServerEnv();
    const stores = productionStores();
    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    if (!token) return { sessionWallet: null, stores };
    const session = await readSession(stores.auth, authConfigFromEnv(env), token);
    return { sessionWallet: session.walletAddress, stores };
  } catch (err) {
    if (err instanceof ServerConfigError) {
      return { sessionWallet: null, stores: null };
    }
    if (err instanceof AuthError) {
      return { sessionWallet: null, stores: null };
    }
    throw err;
  }
}
