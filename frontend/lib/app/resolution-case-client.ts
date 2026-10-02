import type { PublicResolutionCase } from "@/lib/server/cases/service";
import type { DisputeCategoryId } from "@/lib/app/resolution-center";

export type ApiError = {
  status: number;
  code: string;
  message: string;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const json = (await response.json().catch(() => null)) as
    | T
    | { error?: { code?: string; message?: string } }
    | null;
  if (!response.ok) {
    const error = json && typeof json === "object" && "error" in json ? json.error : null;
    throw {
      status: response.status,
      code: error?.code ?? "request_failed",
      message: error?.message ?? "Request failed.",
    } satisfies ApiError;
  }
  return json as T;
}

export function fetchResolutionCase(address: string) {
  return request<{ case: PublicResolutionCase }>(`/api/contracts/${address}/case`);
}

export function recoverResolutionCase(
  address: string,
  body: {
    category?: DisputeCategoryId | "";
    description?: string;
    openSignature?: string;
  } = {}
) {
  return request<{ case: PublicResolutionCase }>(`/api/contracts/${address}/case`, {
    method: "POST",
    body: JSON.stringify({
      category: body.category || undefined,
      description: body.description || undefined,
      openSignature: body.openSignature || undefined,
    }),
  });
}

export function updateResolutionCaseNotes(
  address: string,
  body: { category?: DisputeCategoryId | ""; description?: string }
) {
  return request<{ case: PublicResolutionCase }>(`/api/contracts/${address}/case`, {
    method: "PATCH",
    body: JSON.stringify({
      category: body.category || null,
      description: body.description ?? "",
    }),
  });
}

export function upsertResolutionCaseStatement(address: string, body: string) {
  return request<{ case: PublicResolutionCase }>(
    `/api/contracts/${address}/case/statement`,
    {
      method: "PUT",
      body: JSON.stringify({ body }),
    }
  );
}


export function addMessageToResolutionEvidence(
  address: string,
  messageId: string
) {
  return request<{ case: PublicResolutionCase }>(
    `/api/contracts/${address}/case/evidence`,
    {
      method: "POST",
      body: JSON.stringify({ messageId }),
    }
  );
}
