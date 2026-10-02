import type {
  FreelancerCard,
  GigCard,
  GigDetail,
  ProfilePage,
  PublicGig,
  PublicProfile,
  UnifiedSearchResult,
} from "@/lib/server/marketplace/catalog-service";
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
  skills: string[];
  /** "" = no explicit category (derived from keywords). */
  category: "" | NonNullable<PublicJob["category"]>;
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

/* ---------- Phase 2: search, gigs, profiles ---------- */

/** `qs` comes from buildSearchQuery (empty string or "?..."). */
export function searchJobs(qs: string) {
  return request<{ jobs: PublicJob[] }>(`/api/marketplace/jobs${qs}`);
}

export function searchGigs(qs: string) {
  return request<{ gigs: GigCard[] }>(`/api/marketplace/gigs${qs}`);
}

export type GigInput = {
  title: string;
  description: string;
  skills: string[];
  paymentMode: PublicGig["paymentMode"];
  priceAmount: string;
};

export function createGig(input: GigInput) {
  return request<{ gig: PublicGig }>("/api/marketplace/gigs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function editGig(gigId: string, input: GigInput) {
  return request<{ gig: PublicGig }>(`/api/marketplace/gigs/${encodeURIComponent(gigId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function setGigStatus(gigId: string, action: "pause" | "resume") {
  return request<{ gig: PublicGig }>(`/api/marketplace/gigs/${encodeURIComponent(gigId)}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
}

export function deleteGig(gigId: string) {
  return request<{ deleted: true }>(`/api/marketplace/gigs/${encodeURIComponent(gigId)}`, {
    method: "DELETE",
  });
}

export function fetchMyGigs() {
  return request<{ gigs: PublicGig[] }>("/api/marketplace/gigs/mine");
}

export function fetchGigDetail(gigId: string) {
  return request<GigDetail>(`/api/marketplace/gigs/${encodeURIComponent(gigId)}`);
}

export function fetchGigHandoff(gigId: string) {
  return request<{ handoff: CreateHandoff }>(
    `/api/marketplace/gigs/${encodeURIComponent(gigId)}/handoff`
  );
}

export type ProfileInput = {
  displayName: string;
  avatarUrl: string;
  headline: string;
  bio: string;
  skills: string[];
  rateAmount: string;
  availability: PublicProfile["availability"];
  portfolio: PublicProfile["portfolio"];
};

export function fetchMyProfile() {
  return request<{ wallet: string; profile: PublicProfile | null }>("/api/marketplace/profiles/me");
}

export function saveMyProfile(input: ProfileInput) {
  return request<{ profile: PublicProfile }>("/api/marketplace/profiles/me", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function fetchProfilePage(wallet: string) {
  return request<ProfilePage>(`/api/marketplace/profiles/${encodeURIComponent(wallet)}`);
}

/* ---------- Phase 3: discovery ---------- */

export function fetchFreelancers(qs: string) {
  return request<{ freelancers: FreelancerCard[] }>(`/api/marketplace/freelancers${qs}`);
}

export function searchMarketplace(qs: string) {
  return request<UnifiedSearchResult>(`/api/marketplace/search${qs}`);
}
