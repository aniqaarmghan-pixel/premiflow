import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_TYPE_DECISION_HEADING,
  CONTRACT_TYPE_DECISION_HINTS,
  CONTRACT_TYPE_GUIDES,
  CONTRACT_TYPES,
} from "../contract-type-guide";
import { typeBlurb } from "../view-model";
import {
  defaultCreateDraft,
  validateCreateDraft,
  type CreateWizardDraft,
} from "../validation";
import { PREMIFLOW_RESOLVER, PREMIFLOW_TEST_TOKEN } from "../premiflow";
import { WALLET_A, WALLET_B } from "../../streampay-v2/tests/fixtures";

test("create type guide lists Fixed, Milestone, and Streaming only", () => {
  assert.deepEqual([...CONTRACT_TYPES], ["Fixed", "Milestone", "Streaming"]);
  assert.equal(CONTRACT_TYPES.includes("Fixed"), true);
  assert.equal(CONTRACT_TYPES.includes("Milestone"), true);
  assert.equal(CONTRACT_TYPES.includes("Streaming"), true);
  assert.equal("Hourly" in CONTRACT_TYPE_GUIDES, false);
});

test("decision guide maps customer situations to existing payment modes", () => {
  assert.equal(CONTRACT_TYPE_DECISION_HEADING, "Which contract fits your work?");
  assert.deepEqual(
    CONTRACT_TYPE_DECISION_HINTS.map((hint) => [hint.match, hint.type]),
    [
      ["One specific deliverable", "Fixed"],
      ["Several project stages", "Milestone"],
      ["Payment based on time", "Streaming"],
    ]
  );
});

test("Fixed description is deliverable-based and not hourly", () => {
  const guide = CONTRACT_TYPE_GUIDES.Fixed;
  assert.equal(guide.title, "Fixed");
  assert.equal(guide.tagline, "One job, one price");
  assert.match(guide.bestFor, /one final deliverable/i);
  assert.equal(guide.exampleLines[0], "Design a logo for a fixed price.");
  assert.equal(guide.compactBestFor, "Logo, articles, and one-time jobs");
  assert.match(guide.explanation, /submits the finished work for review/i);
  assert.match(guide.explanation, /available to collect/i);
  assert.match(guide.selectedExplanation, /one main deliverable/i);
  assert.doesNotMatch(guide.explanation, /hour|hourly|accrue|time passes/i);
  assert.doesNotMatch(guide.selectedExplanation, /hour|hourly|accrue/i);
  assert.equal(typeBlurb("Fixed"), guide.selectedExplanation);
});

test("Milestone description explains stages without automatic payment", () => {
  const guide = CONTRACT_TYPE_GUIDES.Milestone;
  assert.equal(guide.tagline, "Pay by project stage");
  assert.match(guide.bestFor, /separate deliverables/i);
  assert.equal(
    guide.exampleLines[0],
    "Build a website with separate amounts for Design, Frontend, Backend, and Testing."
  );
  assert.equal(guide.compactBestFor, "Websites, apps, and multi-stage work");
  assert.match(guide.explanation, /stage by stage/i);
  assert.match(guide.selectedExplanation, /stages with separate amounts and deliverables/i);
  assert.doesNotMatch(guide.explanation, /automatically paid|paid automatically/i);
  assert.equal(typeBlurb("Milestone"), guide.selectedExplanation);
});

test("Streaming description explains time accrual without automatic token transfer", () => {
  const guide = CONTRACT_TYPE_GUIDES.Streaming;
  assert.equal(guide.tagline, "Pay as time passes");
  assert.match(guide.bestFor, /start and end time/i);
  assert.equal(guide.exampleLines[0], "Fund an 8-hour work period.");
  assert.equal(
    guide.exampleLines[1],
    "Your equivalent hourly rate is shown automatically."
  );
  assert.equal(guide.compactExampleLines[0], "Fund an 8-hour work period.");
  assert.equal(guide.compactBestFor, "Consulting, retainers, and scheduled hours");
  assert.match(guide.explanation, /accrues proportionally with time/i);
  assert.match(guide.explanation, /does not require a normal deliverable submission/i);
  assert.match(guide.collectNote ?? "", /collects available pay/i);
  assert.doesNotMatch(
    `${guide.explanation} ${guide.collectNote} ${guide.selectedExplanation}`,
    /tokens? (are |is )?(automatically )?(sent|transferred|received)|receives tokens automatically/i
  );
  assert.doesNotMatch(guide.explanation, /submit (official )?deliverable/i);
  assert.equal(typeBlurb("Streaming"), guide.selectedExplanation);
});

test("educational type examples stay currency-neutral", () => {
  const copy = CONTRACT_TYPES.flatMap((type) => {
    const guide = CONTRACT_TYPE_GUIDES[type];
    return [
      ...guide.exampleLines,
      ...guide.compactExampleLines,
      guide.tagline,
      guide.explanation,
      guide.bestFor,
      guide.compactBestFor,
      guide.selectedExplanation,
      guide.collectNote ?? "",
    ];
  }).join(" ");
  assert.doesNotMatch(copy, /PREMIFLOW|USDT|USDC/i);
});

test("type cards still bind to the existing paymentMode values", () => {
  assert.equal(CONTRACT_TYPE_GUIDES.Fixed.type, "Fixed");
  assert.equal(CONTRACT_TYPE_GUIDES.Milestone.type, "Milestone");
  assert.equal(CONTRACT_TYPE_GUIDES.Streaming.type, "Streaming");
  const draft = defaultCreateDraft();
  assert.equal(draft.paymentMode, "Fixed");
  draft.paymentMode = CONTRACT_TYPE_GUIDES.Streaming.type;
  assert.equal(draft.paymentMode, "Streaming");
});

test("Create wizard still uses the three protocol types and the decision guide", () => {
  const source = readFileSync(
    new URL("../../../components/create/CreateWizard.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /CONTRACT_TYPES/);
  assert.match(source, /CONTRACT_TYPE_DECISION_HEADING/);
  assert.match(source, /CONTRACT_TYPE_GUIDES/);
  assert.match(source, /compactExampleLines/);
  assert.match(source, /compactBestFor/);
  assert.doesNotMatch(source, /Hourly/);
  assert.doesNotMatch(source, /\["Fixed", "Milestone", "Streaming"\]/);
});

function futureAcceptance(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
}

function validDraft(overrides: Partial<CreateWizardDraft> = {}): CreateWizardDraft {
  const draft = defaultCreateDraft();
  draft.freelancer = WALLET_B.toBase58();
  draft.totalAmountUi = "10";
  draft.title = "Landing page";
  draft.description = "Ship the page";
  draft.deliverables = "Figma + code";
  draft.acceptanceDeadlineLocal = futureAcceptance();
  draft.durationSeconds = 3600;
  draft.reviewDuration = 600;
  draft.mint = PREMIFLOW_TEST_TOKEN.mint.toBase58();
  draft.resolver = PREMIFLOW_RESOLVER.address.toBase58();
  return { ...draft, ...overrides };
}

test("existing Create validation still works for all three types", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.deepEqual(
    validateCreateDraft(WALLET_A, validDraft({ paymentMode: "Fixed" }), now),
    {}
  );
  assert.deepEqual(
    validateCreateDraft(
      WALLET_A,
      validDraft({
        paymentMode: "Milestone",
        milestones: [{ label: "Ship", amountUi: "10", dueOffsetSeconds: 1800 }],
      }),
      now
    ),
    {}
  );
  assert.deepEqual(
    validateCreateDraft(
      WALLET_A,
      validDraft({
        paymentMode: "Streaming",
        checkpointInterval: 1800,
      }),
      now
    ),
    {}
  );
});
