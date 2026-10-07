import { HttpError } from "../http";
import {
  AccountSessionUnavailableError,
  readAccountSession,
} from "../account-auth/session";

/**
 * PREMIFLOW app-admin authorization (Help Desk + Admin Center data).
 *
 * Server-side only: the allowlist lives in server env and is checked against
 * the Better Auth session user. A browser-supplied flag is never trusted.
 * Admin grants NO on-chain authority: resolve_dispute still requires the
 * contract's designated resolver wallet signature, enforced by the program.
 */
export const ADMIN_AUTHORITY = {
  helpDesk: true,
  adminCenter: true,
  settlement: false,
  privateContractMessages: false,
} as const;

export type AppAdminIdentity = { userId: string; email: string | null };

/** Reads PREMIFLOW_ADMIN_USER_IDS / PREMIFLOW_ADMIN_EMAILS (server env only). */
type AdminEnv = Record<string, string | undefined>;

type SessionUserLike = {
  id?: unknown;
  email?: unknown;
  emailVerified?: unknown;
} | null | undefined;

function parseList(raw: string | undefined, lower: boolean): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const value = part.trim();
    if (value) out.add(lower ? value.toLowerCase() : value);
  }
  return out;
}

/** True only for allowlisted account ids, or verified allowlisted emails. */
export function isAppAdminUser(user: SessionUserLike, env: AdminEnv = process.env): boolean {
  if (!user || typeof user.id !== "string" || !user.id) return false;
  if (parseList(env.PREMIFLOW_ADMIN_USER_IDS, false).has(user.id)) return true;
  const emails = parseList(env.PREMIFLOW_ADMIN_EMAILS, true);
  if (emails.size === 0) return false;
  return (
    user.emailVerified === true &&
    typeof user.email === "string" &&
    emails.has(user.email.trim().toLowerCase())
  );
}

export type AccountUser = { userId: string; email: string | null; admin: boolean };

/** Signed-in PREMIFLOW account, with admin computed server-side. */
export async function requireAccountUser(
  request: Request,
  env: AdminEnv = process.env
): Promise<AccountUser> {
  let session: Awaited<ReturnType<typeof readAccountSession>>;
  try {
    session = await readAccountSession(request);
  } catch (err) {
    if (err instanceof AccountSessionUnavailableError) {
      throw new HttpError(503, "account_session_unavailable", err.message);
    }
    throw err;
  }
  const user = session?.user;
  if (!user?.id) {
    throw new HttpError(401, "account_unauthenticated", "Sign in to your PREMIFLOW account.");
  }
  return {
    userId: user.id,
    email: typeof user.email === "string" ? user.email : null,
    admin: isAppAdminUser(user, env),
  };
}

export async function requireAppAdmin(
  request: Request,
  env: AdminEnv = process.env
): Promise<AppAdminIdentity> {
  const account = await requireAccountUser(request, env);
  if (!account.admin) {
    throw new HttpError(403, "forbidden", "This PREMIFLOW account is not a Help Desk admin.");
  }
  return { userId: account.userId, email: account.email };
}
