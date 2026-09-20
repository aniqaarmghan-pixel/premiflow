import type { CopilotResponse } from "@/lib/app/copilot-schemas";

export type CopilotClientError = {
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
    } satisfies CopilotClientError;
  }
  return json as T;
}

export function requestCreateProposal(prompt: string): Promise<CopilotResponse> {
  return request<CopilotResponse>("/api/copilot", {
    method: "POST",
    body: JSON.stringify({ mode: "create", prompt }),
  });
}

export function isCopilotClientError(err: unknown): err is CopilotClientError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "code" in err &&
    "message" in err
  );
}
