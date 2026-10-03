import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ATTENTION_RANK, attentionQueue } from "../dashboard-insights";
import {
  newProposalsLabel,
  proposalCountsByJob,
  proposalReviewHref,
  reviewProposalsLabel,
  submittedProposalItems,
  type EmployerProposalItem,
} from "../employer-proposals";
import type { OfferListItem } from "../dashboard-offers";
import type { JobDetail, PublicJob, PublicProposal } from "../../server/marketplace/service";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const EMPTY = { actionItems: [], offersToAnswer: [], reviewContracts: [], unreadMessages: null, pendingInvitations: 0 };

function job(id: string, status: PublicJob["status"] = "open"): PublicJob {
  return {
    id,
    employerWallet: "Employer1111111111111111111111111111111111",
    title: `Job ${id}`,
    description: "d",
    paymentMode: "Fixed",
    budgetAmount: "1000000",
    tokenMint: "Mint",
    status,
    selectedProposalId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    closedAt: null,
    skills: [],
    category: null,
  } as PublicJob;
}

function proposal(id: string, jobId: string, status: PublicProposal["status"], createdAt: string): PublicProposal {
  return {
    id,
    jobId,
    freelancerWallet: "Freelancer99999999999999999999999999999999",
    message: "m",
    proposedAmount: "2500000",
    status,
    createdAt,
    updatedAt: createdAt,
  };
}

function detail(j: PublicJob, proposals: PublicProposal[], viewerRole: JobDetail["viewerRole"] = "owner"): JobDetail {
  return { job: j, viewerRole, proposals, ownProposal: null } as unknown as JobDetail;
}

const item = (n: number): EmployerProposalItem => ({
  jobId: `J${n}`,
  jobTitle: `Logo design ${n}`,
  proposalId: `P${n}`,
  freelancerWallet: "Freelancer99999999999999999999999999999999",
  proposedAmount: "2500000",
  createdAt: `2026-10-0${n}T00:00:00.000Z`,
});

test("submitted proposals come only from open owner jobs, newest first, with counts", () => {
  const items = submittedProposalItems([
    detail(job("A"), [
      proposal("a1", "A", "submitted", "2026-10-01T00:00:00.000Z"),
      proposal("a2", "A", "withdrawn", "2026-10-02T00:00:00.000Z"),
      proposal("a3", "A", "submitted", "2026-10-03T00:00:00.000Z"),
    ]),
    detail(job("B", "filled"), [proposal("b1", "B", "submitted", "2026-10-04T00:00:00.000Z")]),
    detail(job("C"), [proposal("c1", "C", "submitted", "2026-10-05T00:00:00.000Z")], "visitor"),
  ]);
  assert.deepEqual(items.map((i) => i.proposalId), ["a3", "a1"]);
  assert.equal(proposalCountsByJob(items).get("A"), 2);
  assert.equal(proposalCountsByJob(items).get("B"), undefined);
  assert.equal(newProposalsLabel(1), "1 new proposal");
  assert.equal(newProposalsLabel(2), "2 new proposals");
  assert.equal(reviewProposalsLabel(1), "Review proposal");
  assert.equal(reviewProposalsLabel(3), "Review proposals");
});

test("review CTA deep links to the job detail proposal section", () => {
  assert.equal(proposalReviewHref("job-1", "prop-9"), "/marketplace/jobs/job-1?proposal=prop-9#proposals");
  assert.equal(proposalReviewHref("job-1"), "/marketplace/jobs/job-1#proposals");
});

test("attention ranking: proposals, offers, actions, submitted work, invitations, messages, then reviews", () => {
  const offer = {
    address: "OfferA",
    mode: "Fixed",
    href: "/contracts/OfferA",
    acceptanceDeadline: 500,
    deadlinePassed: false,
  } as unknown as OfferListItem;
  const items = attentionQueue({
    ...EMPTY,
    offersToAnswer: [offer],
    unreadMessages: 2,
    pendingInvitations: 1,
    reviewPrompts: ["R1"],
    proposals: [item(1)],
    limit: 10,
  });
  assert.deepEqual(
    items.map((i) => i.kind),
    ["proposal", "offer", "invitation", "messages", "feedback"]
  );
  const first = items[0];
  assert.equal(first.title, "New proposal: Logo design 1");
  assert.match(first.detail, /proposed/);
  assert.equal(first.cta, "Review proposal");
  assert.equal(first.href, "/marketplace/jobs/J1?proposal=P1#proposals");
  assert.ok(ATTENTION_RANK.proposal < ATTENTION_RANK.offer);
  assert.ok(ATTENTION_RANK.offer < ATTENTION_RANK.action);
  assert.ok(ATTENTION_RANK.action < ATTENTION_RANK.review);
  assert.ok(ATTENTION_RANK.messages < ATTENTION_RANK.feedback);
});

test("many proposals: three rows plus a '+N more' entry; never displaced by reviews", () => {
  const items = attentionQueue({
    ...EMPTY,
    proposals: [item(1), item(2), item(3), item(4), item(5)],
    reviewPrompts: ["R1", "R2", "R3", "R4", "R5", "R6", "R7"],
  });
  assert.deepEqual(items.map((i) => i.id), ["proposal-P1", "proposal-P2", "proposal-P3", "proposals-more", "feedback-group"]);
  assert.equal(items[3].title, "+2 more proposals to review");
  assert.equal(items[3].href, "/marketplace/my-jobs");
});

test("repeated review reminders collapse into one grouped entry", () => {
  const grouped = attentionQueue({ ...EMPTY, reviewPrompts: ["R1", "R2", "R3", "R4"] });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].id, "feedback-group");
  assert.equal(grouped[0].title, "4 contracts awaiting your review");
  assert.equal(grouped[0].href, "/contracts/R1#review");
  const single = attentionQueue({ ...EMPTY, reviewPrompts: ["R1"] });
  assert.equal(single[0].title, "Leave a review");
  assert.deepEqual(attentionQueue({ ...EMPTY }), []);
});

test("dashboard wires real employer proposals and shows the CTA", () => {
  const overview = read("components/overview/OverviewPage.tsx");
  assert.match(overview, /const employerProposals = useEmployerProposals\(ws\.data\?\.jobs\);/);
  assert.match(overview, /proposals: employerProposals\.items,/);
  assert.match(overview, /\{entry\.cta\}/);
  const hook = read("lib/hooks/useEmployerProposals.ts");
  assert.match(hook, /fetchJobDetail\(job\.id\)/);
  assert.match(hook, /job\.status === "open"/);
});

test("My jobs cards: proposal count + Review CTA inside the isolated card footer", () => {
  const myJobs = read("components/marketplace/MarketplaceMyJobs.tsx");
  assert.match(myJobs, /useEmployerProposals\(query\.status === "ready" \? query\.data\.jobs : null, 50\)/);
  assert.match(myJobs, /newProposalsLabel\(proposals\.counts\.get\(job\.id\) \?\? 0\)/);
  assert.match(myJobs, /href=\{proposalReviewHref\(job\.id\)\}/);
  assert.match(myJobs, /reviewProposalsLabel\(/);
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  assert.match(parts, /wholeCardLink = true,/);
  assert.match(parts, /onClick=\{stopInner\} onKeyDown=\{stopInner\}>\s*\{footer\}/);
});

test("Select proposal uses the accessible Modal instead of window.confirm; still warns about declines", () => {
  const jobDetail = read("components/marketplace/MarketplaceJobDetail.tsx");
  assert.doesNotMatch(jobDetail, /window\.confirm\("Select this proposal/);
  assert.match(jobDetail, /import \{ Modal \} from "@\/components\/ui\/Modal";/);
  assert.match(jobDetail, /onClick=\{\(\) => setConfirmProposal\(p\)\}/);
  assert.match(jobDetail, /<Modal\s+open=\{confirmProposal !== null\}\s+title="Select this proposal\?"/);
  assert.match(jobDetail, /Other submitted proposals for this job will be declined\./);
  assert.match(jobDetail, /void run\(\(\) => selectProposal\(job\.id, chosen\.id\), "Proposal selected\."\)/);
  const modal = read("components/ui/Modal.tsx");
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /useDialogFocus\(open, panelRef, onClose\)/);
});

test("job detail: proposals anchor, highlight, prominent status and Create protected contract handoff", () => {
  const jobDetail = read("components/marketplace/MarketplaceJobDetail.tsx");
  assert.match(jobDetail, /id="proposals"/);
  assert.match(jobDetail, /id=\{`proposal-\$\{p\.id\}`\}/);
  assert.match(jobDetail, /deepLink\.proposalId === p\.id \? "ring-2 ring-accent ring-offset-2" : ""/);
  assert.match(jobDetail, /New - awaiting your decision/);
  assert.match(jobDetail, /id="create-contract"/);
  assert.match(jobDetail, /onClick=\{\(\) => void startCreate\(\)\}>\s*Create protected contract/);
  // Existing handoff (pending record + router to Create) is unchanged.
  assert.match(jobDetail, /savePendingHandoff\(browserStorage\(\), CREATE_SCOPE, wallet, handoff, Date\.now\(\)\)/);
  assert.match(jobDetail, /router\.push\("\/create"\)/);
  const jobForm = read("components/marketplace/MarketplaceJobForm.tsx");
  assert.doesNotMatch(jobForm, /trial/i);
});
