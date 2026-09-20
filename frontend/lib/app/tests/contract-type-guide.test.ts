import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import { ABOUT_MODELS } from "../about";
import {
  CONFIGURE_PREVIEW_HEADING,
  CONTRACT_TYPE_DECISION_HEADING,
  CONTRACT_TYPE_DECISION_HINTS,
  CONTRACT_TYPE_GUIDES,
  CONTRACT_TYPES,
  HOW_PAYMENT_WORKS_HEADING,
  STREAMING_VS_HOURLY,
  TYPE_SELECTION_CONTINUE_LABEL,
  TYPE_SELECTION_SUPPORT_NOTE,
  paymentModeForWorkChoice,
} from "../contract-type-guide";
import { typeBlurb } from "../view-model";
import {
  defaultCreateDraft,
  validateCreateDraft,
  type CreateWizardDraft,
} from "../validation";
import { PREMIFLOW_RESOLVER, PREMIFLOW_TEST_TOKEN } from "../premiflow";
import { WALLET_A, WALLET_B } from "../../streampay-v2/tests/fixtures";

test("create type guide lists Fixed, Milestone, Streaming, and Hourly", () => {
  assert.deepEqual([...CONTRACT_TYPES], ["Fixed", "Milestone", "Streaming", "Hourly"]);
  assert.equal(CONTRACT_TYPES.includes("Fixed"), true);
  assert.equal(CONTRACT_TYPES.includes("Milestone"), true);
  assert.equal(CONTRACT_TYPES.includes("Streaming"), true);
  assert.equal(CONTRACT_TYPES.includes("Hourly"), true);
  assert.equal("Hourly" in CONTRACT_TYPE_GUIDES, true);
});

test("decision guide maps customer situations to existing payment modes", () => {
  assert.equal(CONTRACT_TYPE_DECISION_HEADING, "What kind of work are you paying for?");
  assert.deepEqual(
    CONTRACT_TYPE_DECISION_HINTS.map((hint) => [hint.match, hint.type]),
    [
      ["One finished job", "Fixed"],
      ["Several project stages", "Milestone"],
      ["Continuous scheduled payment", "Streaming"],
      ["Actual hours worked", "Hourly"],
    ]
  );
  assert.equal(paymentModeForWorkChoice("One finished job"), "Fixed");
  assert.equal(paymentModeForWorkChoice("Several project stages"), "Milestone");
  assert.equal(paymentModeForWorkChoice("Continuous scheduled payment"), "Streaming");
  assert.equal(paymentModeForWorkChoice("Actual hours worked"), "Hourly");
});

test("all four contract types have customer-friendly descriptions and examples", () => {
  for (const type of CONTRACT_TYPES) {
    const guide = CONTRACT_TYPE_GUIDES[type];
    assert.ok(guide.customerChoice.length > 0);
    assert.ok(guide.tagline.length > 0);
    assert.ok(guide.bestFor.length > 0);
    assert.ok(guide.explanation.length > 0);
    assert.ok(guide.exampleLines.length > 0);
    assert.ok(guide.compactExampleLines.length > 0);
    assert.ok(guide.howPaymentWorks.length > 0);
    assert.ok(guide.configurePreview.length > 0);
  }
});

test("Fixed description is deliverable-based and not hourly", () => {
  const guide = CONTRACT_TYPE_GUIDES.Fixed;
  assert.equal(guide.title, "Fixed");
  assert.equal(guide.customerChoice, "One finished job");
  assert.equal(guide.tagline, "One job, one price");
  assert.match(guide.bestFor, /clearly defined deliverable/i);
  assert.ok(guide.exampleLines.some((line) => /logo/i.test(line)));
  assert.equal(guide.compactBestFor, "Logo, article, and one-time jobs");
  assert.match(guide.explanation, /one total price/i);
  assert.match(guide.explanation, /one main deliverable/i);
  assert.match(guide.howPaymentWorks, /one total price/i);
  assert.match(guide.howPaymentWorks, /main deliverable for review/i);
  assert.match(guide.howPaymentWorks, /available for the freelancer to collect/i);
  assert.match(guide.selectedExplanation, /one total price/i);
  assert.ok(guide.configurePreview.includes("Total price"));
  assert.ok(guide.configurePreview.includes("Main deliverable"));
  assert.doesNotMatch(guide.explanation, /hour|hourly|accrue|time passes/i);
  assert.doesNotMatch(guide.selectedExplanation, /hour|hourly|accrue/i);
  assert.equal(typeBlurb("Fixed"), guide.selectedExplanation);
  assert.equal(guide.howPaymentWorks, guide.selectedExplanation);
});

test("Milestone description explains stages without automatic payment", () => {
  const guide = CONTRACT_TYPE_GUIDES.Milestone;
  assert.equal(guide.tagline, "Pay by project stage");
  assert.equal(guide.customerChoice, "Several project stages");
  assert.match(guide.bestFor, /separate deliverables/i);
  assert.match(guide.exampleLines[0], /Design → Frontend → Backend → Testing/);
  assert.equal(guide.compactBestFor, "Websites, apps, and multi-stage work");
  assert.match(guide.explanation, /stage by stage/i);
  assert.match(guide.howPaymentWorks, /own amount and deliverable/i);
  assert.match(guide.selectedExplanation, /stage by stage/i);
  assert.ok(guide.configurePreview.includes("Project stages"));
  assert.ok(guide.configurePreview.includes("Amount per milestone"));
  assert.doesNotMatch(guide.explanation, /automatically paid|paid automatically/i);
  assert.equal(typeBlurb("Milestone"), guide.selectedExplanation);
});

test("Streaming description explains time accrual without automatic token transfer", () => {
  const guide = CONTRACT_TYPE_GUIDES.Streaming;
  assert.equal(guide.tagline, "Pay as contract time passes");
  assert.equal(guide.customerChoice, "Continuous scheduled payment");
  assert.match(guide.bestFor, /scheduled period/i);
  assert.ok(guide.exampleLines.some((line) => /Retainers/i.test(line)));
  assert.match(guide.compactExampleLines[0], /Retainers/);
  assert.equal(guide.compactBestFor, "Retainers and scheduled consulting periods");
  assert.match(guide.explanation, /does not track actual working sessions/i);
  assert.match(guide.howPaymentWorks, /while the stream is active/i);
  assert.match(guide.howPaymentWorks, /does not measure actual hours worked/i);
  assert.match(guide.collectNote ?? "", /collects available pay/i);
  assert.ok(guide.configurePreview.includes("Funded amount"));
  assert.ok(guide.configurePreview.includes("Scheduled duration"));
  assert.doesNotMatch(
    `${guide.explanation} ${guide.collectNote} ${guide.selectedExplanation}`,
    /tokens? (are |is )?(automatically )?(sent|transferred|received)|receives tokens automatically/i
  );
  assert.doesNotMatch(guide.explanation, /submit (official )?deliverable/i);
  assert.doesNotMatch(
    `${guide.explanation} ${guide.exampleLines.join(" ")} ${guide.compactExampleLines.join(" ")}`,
    /equivalent hourly rate|tracks? actual hours/i
  );
  assert.doesNotMatch(guide.explanation, /Start work/);
  assert.match(guide.howPaymentWorks, /Choose Hourly if payment should depend on Start work/);
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
      guide.howPaymentWorks,
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
  draft.paymentMode = CONTRACT_TYPE_GUIDES.Hourly.type;
  assert.equal(draft.paymentMode, "Hourly");
});

test("Create wizard uses the four protocol types and the decision guide", () => {
  const source = readFileSync(
    new URL("../../../components/create/CreateWizard.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /CONTRACT_TYPES/);
  assert.match(source, /CONTRACT_TYPE_DECISION_HEADING/);
  assert.match(source, /CONTRACT_TYPE_GUIDES/);
  assert.match(source, /compactExampleLines/);
  assert.match(source, /compactBestFor/);
  assert.match(source, /customerChoice/);
  assert.match(source, /howPaymentWorks/);
  assert.match(source, /configurePreview/);
  assert.match(source, /HOW_PAYMENT_WORKS_HEADING/);
  assert.match(source, /STREAMING_VS_HOURLY/);
  assert.match(source, /TYPE_SELECTION_CONTINUE_LABEL/);
  assert.match(source, /Hourly/);
  assert.match(source, /createHourlyContract/);
  assert.match(source, /createContract/);
  assert.match(source, /paymentMode === "Hourly"[\s\S]*createHourlyContract/);
  assert.match(source, /createContract\(\{/);
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

test("decision guide distinguishes Hourly from Streaming", () => {
  const streaming = CONTRACT_TYPE_GUIDES.Streaming;
  const hourly = CONTRACT_TYPE_GUIDES.Hourly;
  assert.equal(hourly.customerChoice, "Actual hours worked");
  assert.equal(hourly.tagline, "Pay for recorded working time");
  assert.match(streaming.explanation, /does not track actual working sessions/i);
  assert.match(hourly.explanation, /Start work \/ Stop work sessions/i);
  assert.match(hourly.explanation, /Calendar time alone does not create Hourly earnings/i);
  assert.match(hourly.collectNote ?? "", /Streaming accrues automatically/i);
  assert.match(hourly.selectedExplanation, /Start work and Stop work/i);
  assert.match(hourly.howPaymentWorks, /authorized working time/i);
  assert.ok(hourly.configurePreview.includes("Engagement window"));
  assert.ok(hourly.configurePreview.includes("Maximum authorized work time"));
  assert.ok(hourly.configurePreview.includes("Engagement window"));
  assert.doesNotMatch(hourly.explanation, /accrues automatically as contract time/i);
  assert.match(STREAMING_VS_HOURLY.streaming, /does not track actual working sessions/i);
  assert.match(STREAMING_VS_HOURLY.hourly, /Start work \/ Stop work/i);
  assert.doesNotMatch(streaming.explanation, /Start work/);
});

test("Hourly distinguishes authorized working time from engagement window", () => {
  const hourly = CONTRACT_TYPE_GUIDES.Hourly;
  assert.ok(hourly.configurePreview.includes("Maximum authorized work time"));
  assert.ok(hourly.configurePreview.includes("Engagement window"));
  assert.notEqual(
    hourly.configurePreview.indexOf("Maximum authorized work time"),
    hourly.configurePreview.indexOf("Engagement window")
  );
});

test("Create wording is consistent with About wording", () => {
  assert.equal(CONTRACT_TYPE_GUIDES.Fixed.tagline, ABOUT_MODELS.Fixed.tagline);
  assert.equal(CONTRACT_TYPE_GUIDES.Milestone.tagline, ABOUT_MODELS.Milestone.tagline);
  assert.equal(CONTRACT_TYPE_GUIDES.Hourly.tagline, ABOUT_MODELS.Hourly.tagline);
  assert.match(CONTRACT_TYPE_GUIDES.Streaming.tagline, /Pay as .*time passes/);
  assert.match(ABOUT_MODELS.Streaming.tagline, /Pay as time passes/);
  assert.match(CONTRACT_TYPE_GUIDES.Streaming.explanation, /does not track actual working sessions/i);
  assert.match(ABOUT_MODELS.Streaming.explain, /not from Start work/i);
  assert.match(CONTRACT_TYPE_GUIDES.Hourly.explanation, /Start work \/ Stop work/i);
  assert.match(ABOUT_MODELS.Hourly.explain, /recorded eligible time|sessions/i);
  assert.doesNotMatch(CONTRACT_TYPE_GUIDES.Streaming.howPaymentWorks, /tracks actual hours worked/i);
});

test("basic type selection does not require Help or Assistant", () => {
  assert.equal(HOW_PAYMENT_WORKS_HEADING, "How payment works");
  assert.equal(CONFIGURE_PREVIEW_HEADING, "You'll configure");
  assert.equal(TYPE_SELECTION_CONTINUE_LABEL, "This fits my work — Continue");
  assert.match(TYPE_SELECTION_SUPPORT_NOTE, /Neither is required/i);
  assert.match(TYPE_SELECTION_SUPPORT_NOTE, /coming later/i);
  const source = readFileSync(
    new URL("../../../components/create/CreateWizard.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /TYPE_SELECTION_SUPPORT_NOTE/);
  assert.doesNotMatch(source, /must (open|read|use) Help/i);
  assert.doesNotMatch(source, /Assistant is required/i);
  const page = readFileSync(new URL("../../../app/create/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /Help & Support to choose/i);
});

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
