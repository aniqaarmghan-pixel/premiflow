import { toNextJsHandler } from "better-auth/next-js";

import { getAccountAuth } from "@/lib/server/account-auth/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lazy Better Auth HTTP handler.
 *
 * Better Auth is initialized only when an account-auth request arrives,
 * preserving PREMIFLOW's build-time behavior when server env is unavailable.
 */
const handler = toNextJsHandler(async (request: Request) => {
  return getAccountAuth().handler(request);
});

export const { GET, POST, PATCH, PUT, DELETE } = handler;
