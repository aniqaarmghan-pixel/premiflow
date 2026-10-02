"use client";

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import {
  AVAILABILITY_LABELS,
  PROFILE_COPY,
  formatMarketplaceAmount,
} from "@/lib/app/marketplace";
import { fetchProfilePage } from "@/lib/app/marketplace-client";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";

import {
  Avatar,
  GigSummaryCard,
  JobSummaryCard,
  MarketplaceHeader,
  SkillList,
  StatusPill,
} from "./MarketplaceParts";

export function MarketplaceProfileView({ wallet }: { wallet: string }) {
  const session = useMarketplaceSession();
  const query = useMarketplaceQuery(`profile:${wallet}`, () => fetchProfilePage(wallet));

  if (query.status !== "ready") {
    return (
      <div className="min-w-0 space-y-4">
        <MarketplaceHeader title="Profile" />
        <Card className="p-4 text-sm text-ink-soft">
          {query.status === "error"
            ? query.error.status === 404
              ? "Profile not found."
              : query.error.message
            : "Loading profile..."}
        </Card>
      </div>
    );
  }

  const { profile, gigs, openJobs } = query.data;
  const isSelf = session.wallet === query.data.wallet;

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader title={profile?.displayName || "Marketplace profile"} />
      <Card className="min-w-0 space-y-3 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Avatar url={profile?.avatarUrl ?? null} size={64} />
          <div className="min-w-0 flex-1">
            {profile?.headline ? (
              <p className="break-words font-semibold text-ink [overflow-wrap:anywhere]">{profile.headline}</p>
            ) : null}
            <p className="break-all text-xs text-ink-faint">{query.data.wallet}</p>
          </div>
          {profile ? <StatusPill>{AVAILABILITY_LABELS[profile.availability]}</StatusPill> : null}
        </div>
        {profile ? (
          <>
            {profile.rateAmount ? (
              <p className="text-sm text-ink-soft">Rate: {formatMarketplaceAmount(profile.rateAmount)} / hour</p>
            ) : null}
            <SkillList skills={profile.skills} />
            {profile.bio ? (
              <p className="whitespace-pre-wrap break-words text-sm text-ink-soft [overflow-wrap:anywhere]">
                {profile.bio}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-soft">{PROFILE_COPY.emptyProfile}</p>
        )}
        {isSelf ? (
          <Link href="/marketplace/profile" className="text-sm font-medium text-accent underline">
            Edit my profile
          </Link>
        ) : null}
      </Card>

      {profile && profile.portfolio.length > 0 ? (
        <section className="min-w-0 space-y-2">
          <h2 className="font-display text-lg">Portfolio</h2>
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {profile.portfolio.map((item) => (
              <Card key={item.url + item.title} className="min-w-0 space-y-1 p-3 sm:p-4">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="break-words font-semibold text-accent underline [overflow-wrap:anywhere]"
                >
                  {item.title}
                </a>
                {item.description ? (
                  <p className="break-words text-sm text-ink-soft [overflow-wrap:anywhere]">{item.description}</p>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {gigs.length > 0 ? (
        <section className="min-w-0 space-y-2">
          <h2 className="font-display text-lg">Gigs</h2>
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {gigs.map((gig) => (
              <GigSummaryCard key={gig.id} gig={gig} />
            ))}
          </div>
        </section>
      ) : null}

      {openJobs.length > 0 ? (
        <section className="min-w-0 space-y-2">
          <h2 className="font-display text-lg">Open jobs</h2>
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {openJobs.map((job) => (
              <JobSummaryCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
