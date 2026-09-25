import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ABOUT_ASSISTANT,
  ABOUT_AUDIENCE,
  ABOUT_CTA,
  ABOUT_DISPUTES,
  ABOUT_FORBIDDEN_CLAIMS,
  ABOUT_HERO,
  ABOUT_HOME_TEASER,
  ABOUT_MESSAGES,
  ABOUT_MODELS,
  ABOUT_NAV_LABEL,
  ABOUT_PATH,
  ABOUT_PROBLEM,
  ABOUT_TRUST,
  ABOUT_VISION,
  ABOUT_WORKFLOW,
} from "../about";

const PAGE = readFileSync(
  new URL("../../../app/about/page.tsx", import.meta.url),
  "utf8"
);
const ABOUT_UI = readFileSync(
  new URL("../../../components/about/AboutPage.tsx", import.meta.url),
  "utf8"
);
const SHELL = readFileSync(
  new URL("../../../components/shell/AppShell.tsx", import.meta.url),
  "utf8"
);
const HOME = readFileSync(
  new URL("../../../components/overview/OverviewPage.tsx", import.meta.url),
  "utf8"
);

function aboutCorpus() {
  return JSON.stringify({
    ABOUT_HERO,
    ABOUT_PROBLEM,
    ABOUT_WORKFLOW,
    ABOUT_MODELS,
    ABOUT_AUDIENCE,
    ABOUT_MESSAGES,
    ABOUT_DISPUTES,
    ABOUT_TRUST,
    ABOUT_VISION,
    ABOUT_ASSISTANT,
    ABOUT_CTA,
    ABOUT_HOME_TEASER,
  }).toLowerCase();
}

test("/about exists and About is in main navigation", () => {
  assert.equal(ABOUT_PATH, "/about");
  assert.equal(ABOUT_NAV_LABEL, "About");
  assert.match(PAGE, /AboutPage/);
  assert.match(SHELL, /href: "\/about", label: "About"/);
  assert.match(SHELL, /Help & Support/);
});

test("hero copy exists", () => {
  assert.equal(ABOUT_HERO.heading, "Why PREMIFLOW?");
  assert.match(ABOUT_HERO.idea, /not one-size-fits-all/i);
  assert.match(ABOUT_HERO.idea, /Payment protection shouldn't be either/i);
  assert.match(ABOUT_HERO.body, /contract-based workspace/i);
  assert.match(ABOUT_UI, /ABOUT_HERO\.heading/);
  assert.match(ABOUT_UI, /<h1/);
});

test("problem section exists for both freelancer and employer", () => {
  assert.match(ABOUT_PROBLEM.heading, /problem PREMIFLOW is built around/i);
  assert.ok(ABOUT_PROBLEM.freelancer.some((line) => /waiting to be paid/i.test(line)));
  assert.ok(ABOUT_PROBLEM.employer.some((line) => /Paying before knowing/i.test(line)));
  assert.match(ABOUT_UI, /about-problem-heading/);
});

test("Agree Fund Work Review Collect Resolve workflow exists", () => {
  assert.deepEqual(
    ABOUT_WORKFLOW.steps.map((step) => step.title),
    ["Agree", "Fund", "Work", "Review / Record", "Collect", "Resolve when necessary"]
  );
  assert.match(ABOUT_WORKFLOW.steps[4].body, /collected separately/i);
  assert.match(ABOUT_UI, /ABOUT_WORKFLOW/);
});

test("all four contract types exist with distinct Streaming and Hourly copy", () => {
  for (const type of ["Fixed", "Milestone", "Streaming", "Hourly"] as const) {
    assert.equal(ABOUT_MODELS[type].heading, type);
  }
  assert.equal(ABOUT_MODELS.Fixed.tagline, "One job, one price");
  assert.equal(ABOUT_MODELS.Milestone.tagline, "Pay by project stage");
  assert.equal(ABOUT_MODELS.Streaming.tagline, "Pay as time passes");
  assert.equal(ABOUT_MODELS.Hourly.tagline, "Pay for recorded working time");
  assert.match(ABOUT_MODELS.Streaming.explain, /contract clock/i);
  assert.match(ABOUT_MODELS.Streaming.explain, /not from Start work/i);
  assert.match(ABOUT_MODELS.Hourly.explain, /recorded eligible time/i);
  assert.match(ABOUT_MODELS.Hourly.explain, /sessions/i);
  assert.doesNotMatch(ABOUT_MODELS.Hourly.explain, /contract clock/);
});

test("freelancer and employer sections exist without guaranteed payment", () => {
  assert.match(ABOUT_AUDIENCE.freelancerHeading, /freelancers/i);
  assert.match(ABOUT_AUDIENCE.employerHeading, /employers/i);
  assert.match(ABOUT_AUDIENCE.freelancerNote, /does not guarantee payment/i);
  assert.match(ABOUT_AUDIENCE.employerNote, /do not arbitrarily reclaim/i);
});

test("Contract Messages description is truthful", () => {
  const text = ABOUT_MESSAGES.body.join(" ");
  assert.match(text, /employer and freelancer/i);
  assert.match(text, /stored by PREMIFLOW/i);
  assert.match(text, /not end-to-end encryption/i);
  assert.match(text, /not recorded on Solana/i);
  assert.match(text, /does not automatically receive private-chat/i);
  assert.doesNotMatch(text, /Neon|end-to-end encrypted(?!)/i);
});

test("Resolution Center description is truthful", () => {
  assert.match(ABOUT_DISPUTES.heading, /agreement breaks down/i);
  assert.match(ABOUT_DISPUTES.intro, /disagreements never happen/i);
  assert.ok(ABOUT_DISPUTES.points.some((line) => /configured resolver reviews/i.test(line)));
  assert.ok(ABOUT_DISPUTES.points.some((line) => /does not receive the escrow/i.test(line)));
  assert.match(ABOUT_DISPUTES.note, /does not automatically decide who wins/i);
  assert.match(ABOUT_DISPUTES.note, /does not decide disputes/i);
});

test("trust model, vision, live assistant, and CTA exist", () => {
  assert.match(ABOUT_TRUST.heading, /Make the agreement clearer/i);
  assert.equal(ABOUT_TRUST.layers.length, 4);
  assert.match(ABOUT_VISION.idea, /without either side having to rely only on blind trust/i);
  assert.equal(ABOUT_ASSISTANT.status, "Available now");
  assert.match(ABOUT_ASSISTANT.tagline, /AI guidance throughout PREMIFLOW/i);
  assert.match(ABOUT_ASSISTANT.note, /floating PREMIFLOW Assistant/i);
  assert.doesNotMatch(ABOUT_ASSISTANT.status + ABOUT_ASSISTANT.note, /coming later|no assistant backend/i);
  assert.ok(ABOUT_ASSISTANT.willNot.some((line) => /Resolve disputes or decide winners/i.test(line)));
  assert.ok(ABOUT_ASSISTANT.willNot.some((line) => /private Contract Messages/i.test(line)));
  assert.ok(ABOUT_ASSISTANT.willNot.some((line) => /Sign wallet transactions/i.test(line)));
  assert.deepEqual(
    ABOUT_CTA.actions.map((action) => action.href),
    ["/create", "/contracts", "/support"]
  );
});

test("homepage teaser links to /about", () => {
  assert.equal(ABOUT_HOME_TEASER.href, "/about");
  assert.equal(ABOUT_HOME_TEASER.button, "Learn why PREMIFLOW");
  assert.match(HOME, /WhyPremiflowTeaser/);
  assert.match(ABOUT_UI, /ABOUT_HOME_TEASER/);
});

test("About copy avoids guaranteed-payment, AI-decides, and fake adoption claims", () => {
  const corpus = aboutCorpus();
  for (const claim of ABOUT_FORBIDDEN_CLAIMS) {
    assert.equal(corpus.includes(claim), false, claim);
  }
  assert.doesNotMatch(corpus, /\b\d{1,3},\d{3}\+?\s+(users|freelancers|employers|contracts)/i);
  assert.doesNotMatch(corpus, /testimonial|customer logo|ai-powered/i);
  assert.doesNotMatch(ABOUT_UI + PAGE, /Neon/);
});
