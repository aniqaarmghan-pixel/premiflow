import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MISSING_RPC_MESSAGE = "Devnet RPC is not configured on the server.";

function jsonRpcError(status: number, code: number, message: string, id: unknown = null) {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code, message }, id },
    { status }
  );
}

function isJsonRpcObject(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return rec.jsonrpc === "2.0" && "method" in rec && typeof rec.method === "string";
}

function isJsonRpcPayload(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isJsonRpcObject);
  }
  return isJsonRpcObject(value);
}

function configuredRpcUrl(): URL | null {
  const raw = process.env.SOLANA_RPC_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const upstreamUrl = configuredRpcUrl();
  if (!upstreamUrl) {
    return jsonRpcError(503, -32042, MISSING_RPC_MESSAGE);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonRpcError(400, -32700, "Parse error");
  }

  if (!isJsonRpcPayload(payload)) {
    return jsonRpcError(400, -32600, "Invalid JSON-RPC request");
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return jsonRpcError(502, -32043, "Upstream Devnet RPC request failed.");
  }

  const body = await upstream.text();
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": contentType },
  });
}

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}
