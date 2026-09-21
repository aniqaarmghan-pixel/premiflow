import type { PublicContractMessage } from "@/lib/server/messages/pagination";

export type SessionInfo = {
  wallet: string;
  expiresAt: string;
};

export type MessagesPage = {
  messages: PublicContractMessage[];
  nextCursor: string | null;
  unreadCount: number;
};

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

export function createChallenge(wallet: string) {
  return request<{ challengeId: string; message: string; expiresAt: string }>(
    "/api/auth/challenge",
    { method: "POST", body: JSON.stringify({ wallet }) }
  );
}

export function verifyChallenge(challengeId: string, signature: string) {
  return request<SessionInfo>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, signature }),
  });
}

export function fetchSession() {
  return request<SessionInfo>("/api/auth/me");
}

export function logoutSession() {
  return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export function fetchContractMessages(
  address: string,
  query: { cursor?: string | null; limit?: number } = {}
) {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const suffix = params.size ? `?${params}` : "";
  return request<MessagesPage>(`/api/contracts/${address}/messages${suffix}`);
}

export function sendContractMessage(
  address: string,
  body: string,
  attachmentIds: string[] = []
) {
  return request<{ message: PublicContractMessage }>(
    `/api/contracts/${address}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        body,
        ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      }),
    }
  );
}

export function markContractMessagesRead(address: string, lastReadMessageId: string) {
  return request<{ unreadCount: number }>(`/api/contracts/${address}/messages/read`, {
    method: "POST",
    body: JSON.stringify({ lastReadMessageId }),
  });
}

export function signatureToBase64(signature: Uint8Array): string {
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}
