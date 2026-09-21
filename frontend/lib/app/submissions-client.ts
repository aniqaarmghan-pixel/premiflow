import type { PublicWorkSubmission } from "@/lib/server/submissions/service";
import type { ApiError } from "@/lib/app/messages-client";

export type { PublicWorkSubmission };

export type PersistSubmissionInput = {
  submissionKind: "trial" | "fixed" | "milestone";
  workUnitIndex: number;
  revisionNumber: number;
  deliveryNote: string;
  links: { url: string; label?: string | null }[];
  onChainSubmissionUri: string;
  transactionSignature: string;
  chainSubmittedAt?: number | string | null;
  attachmentIds?: string[];
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

export function fetchContractSubmissions(address: string) {
  return request<{ submissions: PublicWorkSubmission[] }>(
    `/api/contracts/${address}/submissions`
  );
}

export function persistContractSubmission(
  address: string,
  body: PersistSubmissionInput
) {
  return request<{ submission: PublicWorkSubmission; created: boolean }>(
    `/api/contracts/${address}/submissions`,
    { method: "POST", body: JSON.stringify(body) }
  );
}
