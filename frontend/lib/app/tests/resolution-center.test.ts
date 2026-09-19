import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolutionPreview, shouldOfferOpenDispute } from "../dispute-ux";
import {
  CASE_PREPARATION_COPY,
  DISPUTE_CATEGORIES,
  EVIDENCE_COPY,
  PARTY_STATEMENTS_COPY,
  PREMIFLOW_ASSISTANT,
  RESOLUTION_CASE_PERSISTENCE,
  RESOLUTION_CENTER_COPY,
  RESOLUTION_CENTER_TITLE,
  RESOLUTION_LIFECYCLE,
  RESOLVER_EXPLANATION,
  SUPPORT_VS_DISPUTE_COPY,
  assistantDecidesSettlement,
  caseNotesAreOnChain,
  caseNotesRequiredToOpenDispute,
  categoryImpliesAutomaticSplit,
  resolutionContext,
  resolutionLifecycleState,
  suggestedAwardFromCategory,
} from "../resolution-center";
import { SUPPORT_PAGE, SUPPORT_TOPICS } from "../support";
import { PREMIFLOW_RESOLVER } from "../premiflow";
import { availableActions } from "../../streampay-v2/actions";
import {
  WALLET_A,
  WALLET_B,
  makeContract,
  makeWorkUnit,
} from "../../streampay-v2/tests/fixtures";

test("Resolution Center terminology is frozen-review, not staff review", () => {
  assert.equal(RESOLUTION_CENTER_TITLE, "Resolution Center");
  assert.match(RESOLUTION_CENTER_COPY.heading, /dispute in progress/i);
  assert.match(RESOLUTION_CENTER_COPY.frozen, /frozen while the dispute is reviewed/i);
  assert.match(RESOLUTION_CENTER_COPY.resolverReviews, /designated resolver reviews/i);
  assert.match(RESOLUTION_CENTER_COPY.noTransfer, /does not by itself transfer tokens/i);
  assert.match(RESOLUTION_CENTER_COPY.notStaffReview, /do not currently review/i);
  assert.match(RESOLUTION_CENTER_COPY.resolvedHeading, /settlement recorded/i);
  assert.match(RESOLUTION_CENTER_COPY.resolvedBody, /tokens move only when/i);
  assert.doesNotMatch(RESOLUTION_CENTER_COPY.resolvedHeading, /before you open/i);
});

test("Help & Support entry point exists in navigation and support page", () => {
  const shell = readFileSync(
    new URL("../../../components/shell/AppShell.tsx", import.meta.url),
    "utf8"
  );
  assert.match(shell, /Help & Support/);
  assert.match(shell, /\/support/);
  assert.equal(SUPPORT_PAGE.title, "Help & Support");
  assert.match(SUPPORT_PAGE.intro, /no live chat/i);
  assert.ok(SUPPORT_TOPICS.some((topic) => topic.id === "disputes"));
  assert.ok(SUPPORT_TOPICS.some((topic) => topic.id === "resolver"));
  assert.ok(SUPPORT_TOPICS.some((topic) => topic.id === "wallet"));
});

test("support versus dispute explanation is present", () => {
  assert.match(SUPPORT_VS_DISPUTE_COPY.whenToDispute, /cannot resolve it directly/i);
  assert.match(SUPPORT_VS_DISPUTE_COPY.supportFirst, /support issues/i);
  assert.ok(
    SUPPORT_VS_DISPUTE_COPY.examples.some((line) => /has not collected/i.test(line))
  );
  assert.ok(
    SUPPORT_VS_DISPUTE_COPY.examples.some((line) => /transaction failed/i.test(line))
  );
  assert.ok(
    SUPPORT_VS_DISPUTE_COPY.examples.some((line) => /Streaming/i.test(line))
  );
});

test("dispute categories exist and do not determine settlement percentage", () => {
  assert.equal(DISPUTE_CATEGORIES.length, 8);
  assert.deepEqual(
    DISPUTE_CATEGORIES.map((category) => category.id),
    [
      "work_not_delivered",
      "incomplete_work",
      "work_quality",
      "scope",
      "payment",
      "deadline_abandonment",
      "time_hours",
      "other",
    ]
  );
  for (const category of DISPUTE_CATEGORIES) {
    assert.equal(suggestedAwardFromCategory(category.id), null);
    assert.equal(categoryImpliesAutomaticSplit(category.id), false);
  }
  const preview = resolutionPreview(
    {
      contestedAmount: 70n,
      releasedAmount: 30n,
      refundedAmount: 0n,
      withdrawnAmount: 10n,
    },
    40n
  );
  assert.equal(preview.freelancerFromDispute, 40n);
  assert.equal(preview.employerFromDispute, 30n);
});

test("category and description are not claimed as persisted case evidence", () => {
  assert.equal(RESOLUTION_CASE_PERSISTENCE.onChain, false);
  assert.equal(RESOLUTION_CASE_PERSISTENCE.backend, false);
  assert.equal(RESOLUTION_CASE_PERSISTENCE.requiredForOpenDispute, false);
  assert.equal(caseNotesAreOnChain(), false);
  assert.equal(caseNotesRequiredToOpenDispute(), false);
  assert.match(CASE_PREPARATION_COPY.notStored, /not recorded on-chain/i);
  assert.match(CASE_PREPARATION_COPY.notStored, /does not yet have a Resolution Case backend/i);
  assert.match(CASE_PREPARATION_COPY.pageOnly, /not submitted as evidence/i);
  assert.match(PARTY_STATEMENTS_COPY.unavailable, /not stored yet/i);
  assert.match(EVIDENCE_COPY.comingLater, /coming later/i);
});

test("resolver remains the final decision-maker and AI cannot decide settlement", () => {
  assert.equal(assistantDecidesSettlement(), false);
  assert.equal(PREMIFLOW_ASSISTANT.comingLater, true);
  assert.ok(PREMIFLOW_ASSISTANT.mustNot.some((line) => /decide who wins/i.test(line)));
  assert.ok(PREMIFLOW_ASSISTANT.mustNot.some((line) => /allocate escrow/i.test(line)));
  assert.ok(PREMIFLOW_ASSISTANT.mustNot.some((line) => /replace the designated resolver/i.test(line)));
  assert.ok(PREMIFLOW_ASSISTANT.mustNot.some((line) => /Sign resolve_dispute/i.test(line)));
  assert.match(RESOLVER_EXPLANATION.definition, /designated third party/i);
  assert.ok(RESOLVER_EXPLANATION.points.some((line) => /does not receive the escrow/i.test(line)));
  assert.ok(RESOLVER_EXPLANATION.points.some((line) => /cannot collect funds/i.test(line)));
  assert.match(RESOLVER_EXPLANATION.configured, /configured PREMIFLOW resolver/i);
  assert.doesNotMatch(RESOLVER_EXPLANATION.configured, /decentralized resolver network exists/i);
});

test("Fixed dispute context uses deliverable and revision state", () => {
  const contract = makeContract({
    status: "Active",
    paymentMode: "Fixed",
    totalAmount: 10n,
    mainAmount: 10n,
    releasedAmount: 0n,
    maxRevisions: 2,
  });
  const unit = makeWorkUnit({
    kind: "Fixed",
    status: "Revising",
    revisionCount: 1,
    actionDeadline: 2_000,
    submissionUri: "https://example.test/work",
  });
  const context = resolutionContext(contract, [unit], 1_500);
  assert.equal(context.paymentMode, "Fixed");
  assert.ok(context.facts.some((fact) => fact.label === "Official deliverable"));
  assert.ok(context.facts.some((fact) => fact.label === "Revisions used"));
  assert.ok(context.notes.some((note) => /one official deliverable/i.test(note)));
  assert.equal(context.trial, null);
});

test("Milestone dispute context explains stages and unresolved amounts", () => {
  const contract = makeContract({
    status: "Active",
    paymentMode: "Milestone",
    totalAmount: 100n,
    mainAmount: 100n,
    allocatedAmount: 100n,
    workUnitCount: 2,
    releasedUnitCount: 1,
    releasedAmount: 40n,
  });
  const units = [
    makeWorkUnit({ kind: "Milestone", index: 0, status: "Released", amount: 40n }),
    makeWorkUnit({ kind: "Milestone", index: 1, status: "Defined", amount: 60n }),
  ];
  const context = resolutionContext(contract, units, 1_000);
  assert.ok(context.facts.some((fact) => fact.label === "Released stages"));
  assert.ok(context.facts.some((fact) => fact.label.startsWith("Stage ")));
  assert.ok(context.notes.some((note) => /one or more project stages/i.test(note)));
});

test("Streaming dispute context explains elapsed time, not worked hours", () => {
  const contract = makeContract({
    status: "Active",
    paymentMode: "Streaming",
    startTime: 1_000,
    endTime: 2_000,
    mainAmount: 100n,
    totalAmount: 100n,
    releasedAmount: 0n,
    streamReleasedAmount: 0n,
  });
  const context = resolutionContext(contract, [], 1_500);
  assert.ok(context.facts.some((fact) => fact.label === "Funded stream (main)"));
  assert.ok(context.facts.some((fact) => fact.label === "Display earned so far"));
  assert.ok(context.notes.some((note) => /not freelancer work sessions/i.test(note)));
  assert.ok(context.notes.some((note) => /accrued pay is accounted/i.test(note)));
  const hours = DISPUTE_CATEGORIES.find((category) => category.id === "time_hours");
  assert.match(hours?.hint ?? "", /Hourly tracks recorded/i);
});

test("trial context appears only when a trial is configured", () => {
  const withTrial = makeContract({
    status: "PendingEmployerApproval",
    trialAmount: 10n,
    totalAmount: 110n,
    mainAmount: 100n,
    openReviewCount: 1,
  });
  const trial = makeWorkUnit({ kind: "Trial", status: "Submitted", amount: 10n });
  const context = resolutionContext(withTrial, [trial], 1_000);
  assert.ok(context.trial);
  assert.ok(context.trial.some((fact) => fact.label === "Trial amount"));
  assert.ok(context.trial.some((fact) => fact.label === "Trial status"));

  const noTrial = resolutionContext(makeContract({ trialAmount: 0n }), [], 1_000);
  assert.equal(noTrial.trial, null);
});

test("lifecycle wording matches the real current steps", () => {
  assert.deepEqual(
    RESOLUTION_LIFECYCLE.map((step) => step.label),
    [
      "Problem",
      "Open dispute",
      "Contract frozen",
      "Resolver review",
      "Settlement recorded",
      "Collect / Claim refund",
    ]
  );
  const disputed = resolutionLifecycleState("Disputed");
  assert.equal(disputed.find((step) => step.id === "review")?.state, "current");
  assert.equal(disputed.find((step) => step.id === "recorded")?.state, "future");
  const resolved = resolutionLifecycleState("Resolved");
  assert.equal(resolved.find((step) => step.id === "recorded")?.state, "current");
  assert.ok(!disputed.some((step) => step.state === "later" && step.id === "review"));
});

test("live openDispute path still works without case notes", () => {
  const contract = makeContract({
    status: "Active",
    paymentMode: "Fixed",
    totalAmount: 10n,
    releasedAmount: 0n,
  });
  const employer = availableActions({ wallet: WALLET_A, contract, now: 1_000 });
  const freelancer = availableActions({ wallet: WALLET_B, contract, now: 1_000 });
  assert.ok(employer.includes("openDispute"));
  assert.ok(freelancer.includes("openDispute"));
  assert.equal(shouldOfferOpenDispute("employer", employer), true);
  assert.equal(caseNotesRequiredToOpenDispute(), false);
});

test("live resolveDispute path still uses freelancer award only", () => {
  const detail = readFileSync(
    new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
    "utf8"
  );
  assert.match(detail, /freelancerContestedAward: parsed\.amount/);
  assert.match(detail, /client\.openDispute\(contract\.address\)/);
  assert.match(detail, /client\.withdrawFreelancer/);
  assert.match(detail, /client\.claimEmployerRefund/);
  assert.doesNotMatch(detail, /disputeCategory.*openDispute/);
  assert.doesNotMatch(detail, /suggestedAwardFromCategory/);
});

test("Collect pay and Claim refund remain separate post-resolution actions", () => {
  const resolved = makeContract({
    status: "Resolved",
    releasedAmount: 6n,
    withdrawnAmount: 0n,
    refundedAmount: 0n,
    freelancerSettlementAmount: 6n,
    employerRefundableAmount: 4n,
    contestedAmount: 10n,
    resolver: PREMIFLOW_RESOLVER.address,
  });
  assert.ok(
    availableActions({ wallet: WALLET_B, contract: resolved, now: 1_000 }).includes(
      "withdrawFreelancer"
    )
  );
  assert.ok(
    availableActions({ wallet: WALLET_A, contract: resolved, now: 1_000 }).includes(
      "claimEmployerRefund"
    )
  );
});

test("Resolution Center UI does not invent AI analysis or attachment storage", () => {
  const center = readFileSync(
    new URL("../../../components/contracts/ResolutionCenter.tsx", import.meta.url),
    "utf8"
  );
  assert.match(center, /RESOLUTION_CENTER_TITLE/);
  assert.match(center, /resolvedHeading/);
  assert.match(center, /CASE_PREPARATION_COPY/);
  assert.match(center, /PARTY_STATEMENTS_COPY/);
  assert.match(center, /AI_CASE_SUMMARY_COPY/);
  assert.doesNotMatch(center, /type=["']file["']/);
  assert.doesNotMatch(center, /localStorage/);
  const support = readFileSync(
    new URL("../../../components/support/SupportPage.tsx", import.meta.url),
    "utf8"
  );
  assert.match(support, /no chatbot/i);
  assert.match(support, /coming later/i);
});
