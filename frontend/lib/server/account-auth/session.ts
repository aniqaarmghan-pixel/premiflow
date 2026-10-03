import { getAccountAuth } from "./auth";

export class AccountSessionRequiredError extends Error {
  constructor() {
    super("Sign in to your PREMIFLOW account.");
    this.name = "AccountSessionRequiredError";
  }
}

/**
 * The session store (Neon) could not be reached. Routes answer 503 so the
 * client keeps the user signed in and retries, instead of treating a database
 * hiccup as "no session".
 */
export class AccountSessionUnavailableError extends Error {
  constructor() {
    super("PREMIFLOW accounts are temporarily unavailable. Try again in a moment.");
    this.name = "AccountSessionUnavailableError";
  }
}

/** A Better Auth APIError carrying 401 means "no valid session". */
export function isUnauthorizedSessionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { statusCode?: unknown; status?: unknown };
  return e.statusCode === 401 || e.status === 401 || e.status === "UNAUTHORIZED";
}

export async function readAccountSession(request: Request) {
  try {
    return await getAccountAuth().api.getSession({
      headers: request.headers,
    });
  } catch (err) {
    if (isUnauthorizedSessionError(err)) return null;
    throw new AccountSessionUnavailableError();
  }
}

export async function requireAccountSession(request: Request) {
  const session = await readAccountSession(request);

  if (!session?.user?.id) {
    throw new AccountSessionRequiredError();
  }

  return session;
}
