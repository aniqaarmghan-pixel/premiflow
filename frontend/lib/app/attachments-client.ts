import type { PublicAttachment } from "@/lib/server/attachments/service";
import type { ApiError } from "@/lib/app/messages-client";
import type { AttachmentContext } from "@/lib/app/attachments-policy";

export type { PublicAttachment };

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
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

export function uploadContractAttachment(
  address: string,
  file: File,
  context: AttachmentContext,
  onProgress?: (ratio: number) => void
): Promise<{ attachment: PublicAttachment }> {
  // XMLHttpRequest provides upload progress; fetch does not for FormData reliably.
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("context", context);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/contracts/${address}/attachments`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = JSON.parse(xhr.responseText || "null");
      } catch {
        json = null;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const error =
          json && typeof json === "object" && "error" in json
            ? (json as { error?: { code?: string; message?: string } }).error
            : null;
        reject({
          status: xhr.status,
          code: error?.code ?? "request_failed",
          message: error?.message ?? "Upload failed.",
        } satisfies ApiError);
        return;
      }
      resolve(json as { attachment: PublicAttachment });
    };
    xhr.onerror = () => {
      reject({
        status: 0,
        code: "network_error",
        message: "Upload failed.",
      } satisfies ApiError);
    };
    xhr.send(form);
  });
}

export function discardPendingAttachment(address: string, attachmentId: string) {
  return requestJson<{ ok: true }>(
    `/api/contracts/${address}/attachments/${attachmentId}`,
    { method: "DELETE" }
  );
}

export function attachmentDownloadHref(downloadPath: string): string {
  return downloadPath;
}
