/**
 * Role-aware "Get started" steps for the dashboard. A step is marked done only
 * when existing data proves it (profile, own listings, own contracts).
 */

export type GetStartedRole = "hiring" | "working";

export const GET_STARTED_DISMISS_KEY = "premiflow:get-started:dismissed";

/** Existing app routes only (checked by tests against app/.../page.tsx). */
export const GET_STARTED_HREFS = {
  profile: "/marketplace/profile",
  postJob: "/marketplace/post",
  reviewProposals: "/marketplace/my-jobs",
  createContract: "/create",
  browseJobs: "/marketplace/jobs",
  offerGig: "/marketplace/gigs/new",
  submitProposal: "/marketplace/my-proposals",
} as const;

export type GetStartedFacts = {
  profileComplete: boolean;
  jobsPosted: number;
  /** A proposal was selected on one of the wallet's jobs. */
  proposalSelected: boolean;
  hiringContracts: number;
  gigsOffered: number;
  proposalsSubmitted: number;
};

export const NO_GET_STARTED_FACTS: GetStartedFacts = {
  profileComplete: false,
  jobsPosted: 0,
  proposalSelected: false,
  hiringContracts: 0,
  gigsOffered: 0,
  proposalsSubmitted: 0,
};

export type GetStartedStep = {
  key: string;
  label: string;
  detail: string;
  href: string;
  done: boolean;
};

export function getStartedSteps(role: GetStartedRole, facts: GetStartedFacts = NO_GET_STARTED_FACTS): GetStartedStep[] {
  const profile: GetStartedStep = {
    key: "profile",
    label: "Complete profile",
    detail: "Add a name, headline and skills.",
    href: GET_STARTED_HREFS.profile,
    done: facts.profileComplete,
  };
  if (role === "hiring") {
    return [
      profile,
      { key: "post-job", label: "Post a job", detail: "Describe the work and budget.", href: GET_STARTED_HREFS.postJob, done: facts.jobsPosted > 0 },
      {
        key: "review-proposals",
        label: "Review proposals",
        detail: "Compare freelancers and select one.",
        href: GET_STARTED_HREFS.reviewProposals,
        done: facts.proposalSelected,
      },
      {
        key: "create-contract",
        label: "Create protected contract",
        detail: "Fund a Fixed, Milestone, Streaming or Hourly contract.",
        href: GET_STARTED_HREFS.createContract,
        done: facts.hiringContracts > 0,
      },
    ];
  }
  return [
    profile,
    // Submitting a proposal requires opening a job, so it proves browsing.
    { key: "browse-jobs", label: "Browse jobs", detail: "Find open work that fits your skills.", href: GET_STARTED_HREFS.browseJobs, done: facts.proposalsSubmitted > 0 },
    { key: "offer-gig", label: "Offer a gig", detail: "Package a service clients can hire directly.", href: GET_STARTED_HREFS.offerGig, done: facts.gigsOffered > 0 },
    {
      key: "submit-proposal",
      label: "Submit proposal",
      detail: "Apply from a job page and track replies here.",
      href: GET_STARTED_HREFS.submitProposal,
      done: facts.proposalsSubmitted > 0,
    },
  ];
}

export function defaultGetStartedRole(mode: "hiring" | "working" | "both" | "new"): GetStartedRole {
  return mode === "working" ? "working" : "hiring";
}

export function isProfileComplete(
  profile: { displayName: string; headline: string; skills: readonly string[] } | null | undefined
): boolean {
  return Boolean(profile && profile.displayName.trim() && profile.headline.trim() && profile.skills.length > 0);
}

type WorkspaceLike = {
  jobs: ReadonlyArray<{ selectedProposalId: string | null }>;
  gigs: readonly unknown[];
  proposals: readonly unknown[];
};

/** Unknown data (not verified / still loading) counts as not done. */
export function getStartedFacts(input: {
  profile: { displayName: string; headline: string; skills: readonly string[] } | null | undefined;
  workspace: WorkspaceLike | null | undefined;
  hiringContracts: number;
}): GetStartedFacts {
  const ws = input.workspace;
  return {
    profileComplete: isProfileComplete(input.profile),
    jobsPosted: ws ? ws.jobs.length : 0,
    proposalSelected: ws ? ws.jobs.some((j) => j.selectedProposalId !== null) : false,
    hiringContracts: input.hiringContracts,
    gigsOffered: ws ? ws.gigs.length : 0,
    proposalsSubmitted: ws ? ws.proposals.length : 0,
  };
}
