"use client";

import { fetchJobDetail } from "@/lib/app/marketplace-client";
import {
  proposalCountsByJob,
  submittedProposalItems,
  type EmployerProposalItem,
} from "@/lib/app/employer-proposals";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";
import type { PublicJob } from "@/lib/server/marketplace/service";

/**
 * Submitted proposals on the employer's open jobs, read from the existing
 * owner job-detail API (no new endpoints). Checks at most `max` open jobs.
 */
export function useEmployerProposals(jobs: readonly PublicJob[] | null | undefined, max = 12) {
  const session = useMarketplaceSession();
  const openJobs = (jobs ?? []).filter((job) => job.status === "open").slice(0, max);
  const key =
    session.wallet && openJobs.length > 0
      ? `employer-proposals:${session.wallet}:${openJobs.map((job) => job.id).join(",")}`
      : null;
  const query = useMarketplaceQuery(key, async () => {
    const results = await Promise.allSettled(openJobs.map((job) => fetchJobDetail(job.id)));
    return submittedProposalItems(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])));
  });
  const items: EmployerProposalItem[] = query.status === "ready" ? query.data : [];
  return { items, counts: proposalCountsByJob(items), status: query.status };
}
