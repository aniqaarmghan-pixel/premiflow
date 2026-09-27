import type { PublicNotification } from "@/lib/server/notifications/pagination";
import type { ApiError } from "@/lib/app/messages-client";

export type NotificationsPage = {
  notifications: PublicNotification[];
  nextCursor: string | null;
};

export type UnreadCountResponse = {
  unreadCount: number;
};

export type MarkOneResponse = {
  notification: PublicNotification;
};

export type MarkAllResponse = {
  markedCount: number;
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

/** Recipient is never sent — ownership comes from the session cookie. */
export function fetchUnreadNotificationCount() {
  return request<UnreadCountResponse>("/api/notifications/unread-count");
}

export function fetchNotifications(query: { cursor?: string | null; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const suffix = params.size ? `?${params}` : "";
  return request<NotificationsPage>(`/api/notifications${suffix}`);
}

export function markNotificationRead(id: string) {
  return request<MarkOneResponse>(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
    body: "{}",
  });
}

export function markAllNotificationsRead() {
  return request<MarkAllResponse>("/api/notifications/read-all", {
    method: "POST",
    body: "{}",
  });
}

export function isNotificationsAuthError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "status" in err &&
      (err as ApiError).status === 401
  );
}
