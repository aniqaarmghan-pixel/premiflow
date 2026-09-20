import { NextResponse } from "next/server";

import { cookieSecureForOrigin, type ServerEnv } from "./env";

export const MAX_JSON_BODY_BYTES = 8_192;
export const SESSION_COOKIE = "premiflow_session";

export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function assertOrigin(request: Request, appOrigin: string): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new HttpError(403, "forbidden", "Request origin is not allowed.");
  }
  if (origin !== appOrigin) {
    throw new HttpError(403, "forbidden", "Request origin is not allowed.");
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function readJsonObject(
  request: Request
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(400, "invalid_content_type", "Expected application/json.");
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, "payload_too_large", "Request is too large.");
  }
  let parsed: unknown;
  try {
    parsed = raw.length ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON.");
  }
  return parsed as Record<string, unknown>;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookieOptions(env: ServerEnv) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: cookieSecureForOrigin(env.appOrigin),
    maxAge: env.sessionTtlSeconds,
  };
}
