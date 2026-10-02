import type {
  CreateHandoff,
  JobDetail,
  MyProposalItem,
  PublicJob,
  PublicProposal,
} from "@/lib/server/marketplace/service";

export type MarketplaceApiError = { status: number; code: string; message: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "include" });
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
    } satisfies MarketplaceApiError;
  }
  return json as T;
}

export type JobInput = {
  title: string;
  description: string;
  paymentMode: PublicJob["paymentMode"];
  budgetAmount: string;
};

export function fetchOpenJobs() {
  return request<{ jobs: PublicJob[] }>("/api/marketplace/jobs");
}

export function fetchMyJobs() {
  return request<{ jobs: PublicJob[] }>("/api/marketplace/jobs/mine");
}

export function fetchJobDetail(jobId: string) {
  return request<JobDetail>(`/api/marketplace/jobs/${encodeURIComponent(jobId)}`);
}

export function postJob(input: JobInput) {
  return request<{ job: PublicJob }>("/api/marketplace/jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function editJob(jobId: string, input: JobInput) {
  return request<{ job: PublicJob }>(`/api/marketplace/jobs/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function closeJob(jobId: string) {
  return request<{ job: PublicJob }>(`/api/marketplace/jobs/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "close" }),
  });
}

export function submitProposal(jobId: string, input: { message: string; proposedAmount: string }) {
  return request<{ proposal: PublicProposal }>(
    `/api/marketplace/jobs/${encodeURIComponent(jobId)}/proposals`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function withdrawProposal(proposalId: string) {
  return request<{ proposal: PublicProposal }>(
    `/api/marketplace/proposals/${encodeURIComponent(proposalId)}/withdraw`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export function selectProposal(jobId: string, proposalId: string) {
  return request<JobDetail>(`/api/marketplace/jobs/${encodeURIComponent(jobId)}/select`, {
    method: "POST",
    body: JSON.stringify({ proposalId }),
  });
}

export function fetchMyProposals() {
  return request<{ items: MyProposalItem[] }>("/api/marketplace/proposals/mine");
}

export function fetchCreateHandoff(jobId: string) {
  return request<{ handoff: CreateHandoff }>(
    `/api/marketplace/jobs/${encodeURIComponent(jobId)}/handoff`
  );
}
