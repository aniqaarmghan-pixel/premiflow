import { NextResponse } from "next/server";

import { ADMIN_AUTHORITY, requireAccountUser } from "@/lib/server/admin/auth";
import { HttpError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-computed admin flag for UI navigation only. Every admin API checks
 * again server-side; this flag never grants settlement authority.
 */
export async function GET(request: Request) {
  try {
    const account = await requireAccountUser(request);
    return NextResponse.json({
      admin: account.admin,
      authority: account.admin ? ADMIN_AUTHORITY : null,
      // The signed-in account's own verification state (helps explain why an
      // unverified email is not recognized). Never the configured allowlist.
      emailVerified: account.emailVerified,
    });
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      return NextResponse.json({ admin: false, authority: null });
    }
    return NextResponse.json({ admin: false, authority: null }, { status: 503 });
  }
}
