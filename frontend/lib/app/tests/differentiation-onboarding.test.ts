import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { VERIFIED_REPUTATION_COPY, WHY_PREMIFLOW, verifiedBadgeLabel } from "../differentiation";
import {
  GET_STARTED_HREFS,
  NO_GET_STARTED_FACTS,
  defaultGetStartedRole,
  getStartedFacts,
  getStartedSteps,
  isProfileComplete,
} from "../onboarding";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const CLAIMS = /\b(first|only|best)\b/i;

/** Static app routes from app/**\/page.tsx (dynamic segments kept as [x]). */
function appRoutes(): Set<string> {
  const routes = new Set<string>();
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "api") continue;
        const seg = name.startsWith("(") ? "" : `/${name}`;
        walk(full, prefix + seg);
      } else if (name === "page.tsx") {
        routes.add(prefix || "/");
      }
    }
  };
  walk(join(root, "app"), "");
  return routes;
}

function whyBlock(): string {
  const home = read("components/marketplace/MarketplaceHome.tsx");
  const start = home.indexOf("{/* Why PREMIFLOW");
  const end = home.indexOf("{/* Dark: how it works");
  assert.ok(start > 0 && end > start, "Why PREMIFLOW section sits before how it works");
  return home.slice(start, end);
}

test("homepage Why PREMIFLOW copy names the four models, trials and lifecycle", () => {
  assert.equal(WHY_PREMIFLOW.title, "One freelance marketplace. Four ways to get paid on Solana.");
  assert.deepEqual(
    WHY_PREMIFLOW.modes.map((m) => m.title),
    ["Fixed", "Milestone", "Streaming", "Hourly"]
  );
  const featured = WHY_PREMIFLOW.modes.filter((m) => "featured" in m && m.featured);
  assert.deepEqual(featured.map((m) => m.key), ["streaming"]);
  assert.equal(WHY_PREMIFLOW.trials.title, "Paid trials + revisions");
  assert.equal(WHY_PREMIFLOW.lifecycle.title, "Protected contract lifecycle");
  assert.ok(WHY_PREMIFLOW.lifecycle.steps.length >= 3);
});

test("homepage Why PREMIFLOW makes no first/only/best claims or stats", () => {
  const copy = JSON.stringify(WHY_PREMIFLOW);
  assert.doesNotMatch(copy, CLAIMS);
  assert.doesNotMatch(copy, /\d+\s*(%|\+|k\b|users|freelancers|clients|reviews)/i);
  assert.doesNotMatch(copy, /testimonial/i);
  const block = whyBlock();
  assert.doesNotMatch(block, CLAIMS);
  assert.match(block, /WHY_PREMIFLOW\.title/);
  assert.match(block, /sm:col-span-2 lg:row-span-2/, "streaming card is the wide featured card");
});

test("homepage keeps the existing section order around the new section", () => {
  const home = read("components/marketplace/MarketplaceHome.tsx");
  const media = home.indexOf("{/* Media:");
  const why = home.indexOf("{/* Why PREMIFLOW");
  const how = home.indexOf('id="how-it-works"');
  assert.ok(media > 0 && media < why && why < how);
});

test("verified reputation wording and hidden state without reviews", () => {
  assert.equal(VERIFIED_REPUTATION_COPY.line, "Verified through completed PREMIFLOW contracts.");
  assert.equal(verifiedBadgeLabel({ reviewCount: 0, averageScore: null }), null);
  assert.equal(verifiedBadgeLabel(null), null);
  assert.equal(verifiedBadgeLabel({ reviewCount: 1, averageScore: 5 }), "5.0/5 - 1 verified review");
  assert.equal(verifiedBadgeLabel({ reviewCount: 3, averageScore: 4.7 }), "4.7/5 - 3 verified reviews");
  const trust = read("components/marketplace/MarketplaceTrustSummary.tsx");
  assert.match(trust, /VERIFIED_REPUTATION_COPY\.line/);
  assert.match(trust, /VERIFIED_REPUTATION_COPY\.empty/);
  assert.match(trust, /export function VerifiedReputationBadge/);
  assert.match(trust, /if \(!label\) return null/);
});

test("verified reputation shows on profile, freelancer cards and gig owner area", () => {
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  const card = parts.slice(parts.indexOf("export function FreelancerSummaryCard"), parts.indexOf("export function SkeletonGrid"));
  assert.match(card, /<VerifiedReputationBadge wallet=\{freelancer\.wallet\}/);
  assert.match(read("components/marketplace/MarketplaceProfileView.tsx"), /<VerifiedReputationBadge wallet=\{query\.data\.wallet\}/);
  assert.match(read("components/marketplace/MarketplaceGigDetail.tsx"), /<VerifiedReputationBadge wallet=\{gig\.freelancerWallet\}/);
});

test("onboarding links point to existing routes", () => {
  const routes = appRoutes();
  const hrefs = new Set<string>([
    ...Object.values(GET_STARTED_HREFS),
    ...getStartedSteps("hiring").map((s) => s.href),
    ...getStartedSteps("working").map((s) => s.href),
  ]);
  for (const href of hrefs) {
    assert.ok(routes.has(href.split("?")[0]), `missing route for ${href}`);
  }
});

test("onboarding steps are role-aware and never faked", () => {
  assert.deepEqual(
    getStartedSteps("hiring").map((s) => s.label),
    ["Complete profile", "Post a job", "Review proposals", "Create protected contract"]
  );
  assert.deepEqual(
    getStartedSteps("working").map((s) => s.label),
    ["Complete profile", "Browse jobs", "Offer a gig", "Submit proposal"]
  );
  assert.ok(getStartedSteps("hiring", NO_GET_STARTED_FACTS).every((s) => !s.done));
  assert.ok(getStartedSteps("working", NO_GET_STARTED_FACTS).every((s) => !s.done));
  assert.equal(defaultGetStartedRole("working"), "working");
  assert.equal(defaultGetStartedRole("hiring"), "hiring");
  assert.equal(defaultGetStartedRole("new"), "hiring");

  // Unknown workspace (not verified) proves nothing.
  const unknown = getStartedFacts({ profile: null, workspace: null, hiringContracts: 0 });
  assert.deepEqual(unknown, NO_GET_STARTED_FACTS);

  const profile = { displayName: "Ana", headline: "Designer", skills: ["Figma"] };
  assert.equal(isProfileComplete(profile), true);
  assert.equal(isProfileComplete({ ...profile, skills: [] }), false);
  assert.equal(isProfileComplete({ ...profile, headline: " " }), false);

  const facts = getStartedFacts({
    profile,
    workspace: { jobs: [{ selectedProposalId: null }, { selectedProposalId: "p1" }], gigs: [], proposals: [{}] },
    hiringContracts: 0,
  });
  const hiring = Object.fromEntries(getStartedSteps("hiring", facts).map((s) => [s.key, s.done]));
  assert.deepEqual(hiring, { profile: true, "post-job": true, "review-proposals": true, "create-contract": false });
  const working = Object.fromEntries(getStartedSteps("working", facts).map((s) => [s.key, s.done]));
  assert.deepEqual(working, { profile: true, "browse-jobs": true, "offer-gig": false, "submit-proposal": true });
});

test("dashboard renders the dismissible get started card", () => {
  const overview = read("components/overview/OverviewPage.tsx");
  assert.match(overview, /<GetStartedCard/);
  const card = read("components/overview/GetStartedCard.tsx");
  assert.match(card, /GET_STARTED_DISMISS_KEY/);
  assert.match(card, /localStorage/);
  assert.match(card, /aria-label="Dismiss get started"/);
});
