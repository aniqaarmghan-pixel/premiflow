import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  HOURLY_COPY,
  HOURLY_NO_ATTACHMENT_URI,
  canEndHourlyContract,
  canStartHourlyWork,
  canStopHourlyWork,
  displayHourlyWorkLog,
  employerEndBlockedBySession,
  employerSeesActiveSession,
  formatElapsedClock,
  formatHourlyDuration,
  hourlyActivationCopy,
  hourlyCreateReviewLines,
  hourlyDashboard,
  hourlyFundingFromInputs,
  isHourlyEngagementEnded,
  isHourlyWorkLogSentinel,
  parseAuthorizedTime,
  parseEngagementDuration,
  resolveHourlyWorkLogUri,
  stopHourlyCopy,
} from "../hourly-ux";
import { CONTRACT_TYPE_GUIDES, CONTRACT_TYPES } from "../contract-type-guide";
import { NOTICE_CATALOG, noticeKindForAction } from "../notices";
import { noticeFromTxOutcome, NoticeDedupe } from "../notice-feed";
import { resolutionContext } from "../resolution-center";
import {
  applyCreateDraftPatch,
  defaultCreateDraft,
  validateCreateDraft,
  type CreateWizardDraft,
} from "../validation";
import { actionLabel, clientMethodForAction, typeBlurb } from "../view-model";
import { PREMIFLOW_RESOLVER, PREMIFLOW_TEST_TOKEN } from "../premiflow";
import { availableActions } from "../../streampay-v2/actions";
import { isHourlyEngagementExpired } from "../../streampay-v2/derived";
import {
  canonicalHourlyEarned,
  engagementDurationToSeconds,
} from "../../streampay-v2/hourly";
import { HOURLY_NO_ACTIVE_SESSION } from "../../streampay-v2/constants";
import {
  makeContract,
  makeHourlySession,
  makeHourlyState,
  WALLET_A,
  WALLET_B,
} from "../../streampay-v2/tests/fixtures";

function futureAcceptance(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
}

function validHourlyDraft(overrides: Partial<CreateWizardDraft> = {}): CreateWizardDraft {
  const draft = defaultCreateDraft();
  return {
    ...draft,
    paymentMode: "Hourly",
    freelancer: WALLET_B.toBase58(),
    hourlyRateUi: "10",
    authorizedTimeValue: "8",
    authorizedTimeUnit: "hours",
    engagementDurationValue: "1",
    engagementDurationUnit: "days",
    title: "Hourly support",
    description: "Logged freelance work",
    acceptanceDeadlineLocal: futureAcceptance(),
    durationSeconds: 86_400,
    reviewDuration: 600,
    mint: PREMIFLOW_TEST_TOKEN.mint.toBase58(),
    resolver: PREMIFLOW_RESOLVER.address.toBase58(),
    ...overrides,
  };
}

function hourlyContract(
  overrides: Parameters<typeof makeContract>[0] = {}
) {
  return makeContract({
    paymentMode: "Hourly",
    status: "Active",
    totalAmount: 80_000_000n,
    mainAmount: 80_000_000n,
    allocatedAmount: 0n,
    workUnitCount: 0,
    releasedAmount: 0n,
    ...overrides,
  });
}

test("Hourly appears as the fourth contract type", () => {
  assert.deepEqual([...CONTRACT_TYPES], ["Fixed", "Milestone", "Streaming", "Hourly"]);
  assert.equal(CONTRACT_TYPE_GUIDES.Hourly.tagline, "Pay for recorded working time");
  assert.equal(typeBlurb("Hourly"), CONTRACT_TYPE_GUIDES.Hourly.selectedExplanation);
});

test("Hourly rate parsing uses base units", () => {
  const funding = hourlyFundingFromInputs({
    hourlyRate: 10_000_000n,
    authorizedSeconds: 28_800,
    trialAmount: 0n,
  });
  assert.equal(funding.hourlyRate, 10_000_000n);
  assert.equal(funding.mainAmount, 80_000_000n);
});

test("authorized time converts to seconds", () => {
  assert.equal(parseAuthorizedTime("8", "hours").seconds, 28_800);
  assert.equal(parseAuthorizedTime("1", "days").seconds, 86_400);
  assert.equal(parseAuthorizedTime("8.5", "hours").error != null, true);
  assert.equal(parseAuthorizedTime("0", "hours").error != null, true);
});

test("maximum budget uses integer canonical hourly earned", () => {
  assert.equal(canonicalHourlyEarned(10_000_000n, 1_800n), 5_000_000n);
  assert.equal(canonicalHourlyEarned(10_000_000n, 3_600n), 10_000_000n);
  assert.equal(canonicalHourlyEarned(10_000_000n, 4_800n), 13_333_333n);
  const threeNaive = canonicalHourlyEarned(10_000_000n, 1_200n) * 3n;
  assert.equal(threeNaive, 9_999_999n);
  assert.equal(canonicalHourlyEarned(10_000_000n, 3_600n), 10_000_000n);
});

test("trial plus maximum funding summary", () => {
  const funding = hourlyFundingFromInputs({
    hourlyRate: 10_000_000n,
    authorizedSeconds: 28_800,
    trialAmount: 5_000_000n,
  });
  assert.equal(funding.mainAmount, 80_000_000n);
  assert.equal(funding.trialAmount, 5_000_000n);
  assert.equal(funding.totalAmount, 85_000_000n);
});

test("Hourly create validation does not require a total amount field", () => {
  const now = Math.floor(Date.now() / 1000);
  const errors = validateCreateDraft(WALLET_A, validHourlyDraft(), now);
  assert.deepEqual(errors, {});
  const missingRate = validateCreateDraft(
    WALLET_A,
    validHourlyDraft({ hourlyRateUi: "" }),
    now
  );
  assert.ok(missingRate.hourlyRateUi);
  assert.equal(missingRate.totalAmountUi, undefined);
});

test("Hourly create wizard uses createHourlyContract and existing modes use createContract", () => {
  const source = readFileSync(
    new URL("../../../components/create/CreateWizard.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /createHourlyContract/);
  assert.match(source, /createContract/);
  assert.match(source, /paymentMode === "Hourly"/);
  assert.match(source, /HourlyPaymentFields/);
  // Hourly submit uses the dedicated client path; other modes use createContract.
  assert.match(
    source,
    /paymentMode === "Hourly"\s*\?\s*await client\.createHourlyContract/
  );
  assert.match(source, /: await client\.createContract\(/);
  assert.doesNotMatch(source, /type="mint"|editable mint|Resolver wallet/);
  // Condensed Payment step shows a read-only configured token label (not a mint input).
  assert.match(source, /paymentTokenLabel\(draft\.mint\)/);
  assert.match(source, />Token</);
  const hourlyFields = source.slice(
    source.indexOf("function HourlyPaymentFields"),
    source.indexOf("function HourlyReviewLines")
  );
  assert.doesNotMatch(hourlyFields, /Total funded amount/);
});

test("Hourly create hides Fixed deliverable and Milestone builder", () => {
  const source = readFileSync(
    new URL("../../../components/create/CreateWizard.tsx", import.meta.url),
    "utf8"
  );
  // Deliverables textarea is gated off for Hourly; Milestone builder only for Milestone.
  assert.match(source, /paymentMode !== "Hourly"/);
  assert.match(source, /no separate deliverable list/);
  assert.match(source, /paymentMode === "Milestone" \?/);
  assert.match(source, /paymentMode === "Milestone" \? \(\s*<MilestoneBuilder/);
  assert.doesNotMatch(
    source.slice(
      source.indexOf("function HourlyPaymentFields"),
      source.indexOf("function HourlyReviewLines")
    ),
    /MilestoneBuilder|Deliverables/
  );
});

test("Hourly create has no Streaming wording in Hourly payment fields", () => {
  const source = readFileSync(
    new URL("../../../components/create/CreateWizard.tsx", import.meta.url),
    "utf8"
  );
  const hourlyBlock = source.slice(
    source.indexOf("function HourlyPaymentFields"),
    source.indexOf("function HourlyReviewLines")
  );
  assert.doesNotMatch(hourlyBlock, /stream|checkpoint|equivalent hourly/i);
});

test("freelancer Start work gating and employer cannot Start", () => {
  const contract = hourlyContract();
  const idle = makeHourlyState();
  assert.equal(
    canStartHourlyWork({ role: "freelancer", contract, hourlyState: idle, now: contract.startTime + 10 }),
    true
  );
  assert.equal(
    canStartHourlyWork({ role: "employer", contract, hourlyState: idle, now: contract.startTime + 10 }),
    false
  );
  const actions = availableActions({
    wallet: WALLET_B,
    contract,
    hourlyState: idle,
    now: contract.startTime + 10,
  });
  assert.ok(actions.includes("startHourlySession"));
  assert.equal(actions.includes("submitWorkUnit"), false);
  const employer = availableActions({
    wallet: WALLET_A,
    contract,
    hourlyState: idle,
    now: contract.startTime + 10,
  });
  assert.equal(employer.includes("startHourlySession"), false);
  assert.ok(employer.includes("endHourlyContract"));
});

test("running-session presentation and Stop work gating", () => {
  const contract = hourlyContract();
  const state = makeHourlyState({
    sessionCount: 1,
    activeSessionIndex: 0,
    approvedSeconds: 0n,
  });
  const session = makeHourlySession({ startedAt: contract.startTime });
  const dash = hourlyDashboard(contract, state, session, contract.startTime + 2_244);
  assert.ok(dash);
  assert.equal(dash.hasActiveSession, true);
  assert.equal(dash.displayElapsed, 2_244);
  assert.equal(dash.clockIsDisplayOnly, true);
  assert.equal(formatElapsedClock(dash.displayElapsed), "00:37:24");
  assert.equal(
    canStopHourlyWork({ role: "freelancer", contract, hourlyState: state }),
    true
  );
  assert.equal(
    canStopHourlyWork({ role: "employer", contract, hourlyState: state }),
    false
  );
  assert.equal(
    employerSeesActiveSession({ role: "employer", hourlyState: state }),
    true
  );
});

test("browser timer display is non-authoritative", () => {
  assert.match(HOURLY_COPY.clockDisclaimer, /display only/i);
  assert.match(HOURLY_COPY.clockDisclaimer, /on-chain clock/i);
  const source = readFileSync(
    new URL("../../../components/contracts/HourlyShowcase.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /clockDisclaimer/);
  assert.match(source, /display only/);
  assert.doesNotMatch(source, /releasedAmount \+=|optimistic/i);
});

test("8-hour display cap does not increase estimated pay", () => {
  const contract = hourlyContract();
  const state = makeHourlyState({
    authorizedSeconds: 100_000n,
    sessionCount: 1,
    activeSessionIndex: 0,
  });
  const session = makeHourlySession({ startedAt: 1_000 });
  const dash = hourlyDashboard(contract, state, session, 1_000 + 10 * 3_600);
  assert.ok(dash);
  assert.equal(dash.displayElapsed, 36_000);
  assert.equal(dash.cappedAtEightHours, true);
  assert.equal(dash.estimatedSessionValue, canonicalHourlyEarned(state.hourlyRate, 28_800n));
  assert.equal(formatHourlyDuration(28_800), "8h");
});

test("short running session displays real elapsed time and zero payable estimate", () => {
  const contract = hourlyContract();
  const state = makeHourlyState({
    authorizedSeconds: 100_000n,
    sessionCount: 1,
    activeSessionIndex: 0,
  });
  const short = hourlyDashboard(
    contract,
    state,
    makeHourlySession({ startedAt: 1_000 }),
    1_030
  );
  assert.equal(short?.shortSessionMayVoid, true);
  assert.equal(short?.finalRemainderRecorded, false);
  assert.equal(short?.displayElapsed, 30);
  assert.equal(short?.estimatedSessionValue, 0n);
  assert.match(HOURLY_COPY.shortSession, /no payable time/i);
});

test("final sub-minimum remainder remains payable under H2 semantics", () => {
  const contract = hourlyContract({
    endTime: 1_700_100_000,
    durationSeconds: 100_000,
  });
  const state = makeHourlyState({
    authorizedSeconds: 45n,
    approvedSeconds: 0n,
    sessionCount: 1,
    activeSessionIndex: 0,
  });
  const remainder = hourlyDashboard(
    contract,
    state,
    makeHourlySession({ startedAt: 1_000 }),
    1_045
  );
  assert.equal(remainder?.shortSessionMayVoid, false);
  assert.equal(remainder?.finalRemainderRecorded, true);
  assert.equal(remainder?.displayElapsed, 45);
  assert.equal(
    remainder?.estimatedSessionValue,
    canonicalHourlyEarned(state.hourlyRate, 45n)
  );
  assert.match(HOURLY_COPY.shortRemainder, /remainder/i);
});

test("no Hourly Submit Work", () => {
  const actions = availableActions({
    wallet: WALLET_B,
    contract: hourlyContract(),
    hourlyState: makeHourlyState(),
    now: 1_700_000_010,
  });
  assert.equal(actions.includes("submitWorkUnit"), false);
  assert.equal(actionLabel("startHourlySession"), "Start work");
  assert.equal(actionLabel("stopHourlySession"), "Stop work");
});

test("Collect pay gating", () => {
  const unpaid = availableActions({
    wallet: WALLET_B,
    contract: hourlyContract(),
    hourlyState: makeHourlyState(),
    now: 1_700_000_010,
  });
  assert.equal(unpaid.includes("withdrawFreelancer"), false);
  const released = availableActions({
    wallet: WALLET_B,
    contract: hourlyContract({ releasedAmount: 10_000_000n }),
    hourlyState: makeHourlyState({ approvedSeconds: 3_600n }),
    now: 1_700_000_010,
  });
  assert.ok(released.includes("withdrawFreelancer"));
  assert.match(HOURLY_COPY.collectExplain, /Collect transfers/i);
  assert.match(HOURLY_COPY.collectExplain, /does not end the contract/i);
  assert.match(HOURLY_COPY.openSessionNotCollectable, /after you stop/i);
  assert.match(stopHourlyCopy().points.join(" "), /not automatically transferred/i);
});

test("End hourly contract gating and active session blocks End", () => {
  const idle = makeHourlyState();
  const open = makeHourlyState({ sessionCount: 1, activeSessionIndex: 0 });
  const contract = hourlyContract();
  assert.equal(
    canEndHourlyContract({ role: "employer", contract, hourlyState: idle }),
    true
  );
  assert.equal(
    canEndHourlyContract({ role: "employer", contract, hourlyState: open }),
    false
  );
  assert.equal(
    canEndHourlyContract({ role: "freelancer", contract, hourlyState: idle }),
    false
  );
  const employerOpen = availableActions({
    wallet: WALLET_A,
    contract,
    hourlyState: open,
    now: contract.startTime + 10,
  });
  assert.equal(employerOpen.includes("endHourlyContract"), false);
  assert.equal(actionLabel("endHourlyContract"), "End hourly contract");
  assert.equal(clientMethodForAction("endHourlyContract"), "endHourlyContract");
});

test("Employer sees session-in-progress info (no End button) while session runs", () => {
  const idle = makeHourlyState();
  const open = makeHourlyState({ sessionCount: 1, activeSessionIndex: 0 });
  const contract = hourlyContract();

  // A: running session → blocked control + copy, no End action, no Stop for employer.
  const blocked = { role: "employer" as const, contract, hourlyState: open };
  assert.equal(employerEndBlockedBySession(blocked), true);
  assert.equal(canEndHourlyContract(blocked), false);
  assert.equal(canStopHourlyWork(blocked), false);
  assert.match(HOURLY_COPY.endBlockedBySession, /active work session/);
  assert.match(HOURLY_COPY.endBlockedBySession, /open a dispute/);
  const employerOpen = availableActions({
    wallet: WALLET_A,
    contract,
    hourlyState: open,
    now: contract.startTime + 10,
  });
  assert.equal(employerOpen.includes("endHourlyContract"), false);
  assert.equal(employerOpen.includes("stopHourlySession"), false);
  const showcase = readFileSync(
    new URL("../../../components/contracts/HourlyShowcase.tsx", import.meta.url),
    "utf8"
  );
  // Approved UX: an informational status replaces the disabled End button.
  assert.match(showcase, /endBlocked \? \(\s*<p\s+role="status"/);
  assert.match(showcase, /HOURLY_COPY\.employerSessionInProgress/);
  assert.doesNotMatch(showcase, /endBlocked \? \(\s*<Button disabled/);

  // B: no running session → normal enabled End, not blocked.
  const enabled = { role: "employer" as const, contract, hourlyState: idle };
  assert.equal(employerEndBlockedBySession(enabled), false);
  assert.equal(canEndHourlyContract(enabled), true);

  // C: freelancer running session → Stop unchanged, never blocked-End copy.
  const freelancer = { role: "freelancer" as const, contract, hourlyState: open };
  assert.equal(canStopHourlyWork(freelancer), true);
  assert.equal(employerEndBlockedBySession(freelancer), false);
});

test("trial approval does not imply timer started", () => {
  const copy = hourlyActivationCopy(
    hourlyContract({ trialAmount: 5_000_000n, totalAmount: 85_000_000n })
  );
  assert.match(copy ?? "", /does not begin until the freelancer starts a session/i);
  assert.equal(
    noticeKindForAction("approveTrialAndActivate", { paymentMode: "Hourly" }),
    "hourly_trial_activated"
  );
  assert.equal(noticeKindForAction("approveTrialAndActivate"), "trial_approved_and_activated");
  assert.equal(
    noticeKindForAction("approveActivation", { paymentMode: "Hourly" }),
    "hourly_activated"
  );
});

test("Hourly Resolution Center context and active-session dispute explanation", () => {
  const contract = hourlyContract({ releasedAmount: 10_000_000n });
  const state = makeHourlyState({
    approvedSeconds: 3_600n,
    sessionCount: 1,
    activeSessionIndex: 0,
  });
  const session = makeHourlySession();
  const context = resolutionContext(
    contract,
    [],
    contract.startTime + 100,
    (amount) => amount.toString(),
    { hourlyState: state, hourlySession: session }
  );
  assert.equal(context.paymentMode, "Hourly");
  assert.ok(context.facts.some((fact) => fact.label === "Hourly rate"));
  assert.ok(context.facts.some((fact) => fact.label === "Authorized time"));
  assert.ok(context.facts.some((fact) => fact.label === "Recorded time"));
  assert.ok(context.notes.some((note) => /records eligible elapsed work/i.test(note)));
  assert.doesNotMatch(context.notes.join(" "), /erased|voided unpaid/i);
});

test("confirmed Hourly notices and rejection produces none", () => {
  assert.equal(noticeKindForAction("startHourlySession"), "hourly_session_started");
  assert.equal(noticeKindForAction("stopHourlySession"), "hourly_session_recorded");
  assert.equal(noticeKindForAction("endHourlyContract"), "hourly_contract_ended");
  assert.match(NOTICE_CATALOG.hourly_session_started.body, /did not transfer tokens/i);
  const dedupe = new NoticeDedupe();
  const notice = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "hourlySig",
      action: "startHourlySession",
    },
    dedupe
  );
  assert.equal(notice?.kind, "hourly_session_started");
  assert.equal(
    noticeFromTxOutcome(
      { phase: "success", signature: "hourlySig", action: "startHourlySession" },
      dedupe
    ),
    null
  );
  assert.equal(
    noticeFromTxOutcome(
      { phase: "failed", signature: "other", action: "startHourlySession" },
      dedupe
    ),
    null
  );
});

test("Hourly work-log empty field uses the documented protocol sentinel", () => {
  assert.equal(resolveHourlyWorkLogUri(""), HOURLY_NO_ATTACHMENT_URI);
  assert.equal(resolveHourlyWorkLogUri("   "), HOURLY_NO_ATTACHMENT_URI);
  assert.equal(resolveHourlyWorkLogUri(" https://notes.test "), "https://notes.test");
  assert.equal(isHourlyWorkLogSentinel(HOURLY_NO_ATTACHMENT_URI), true);
  assert.equal(isHourlyWorkLogSentinel("https://notes.test"), false);
  assert.equal(displayHourlyWorkLog(""), null);
  assert.equal(displayHourlyWorkLog(HOURLY_NO_ATTACHMENT_URI), null);
  assert.equal(displayHourlyWorkLog("https://notes.test"), "https://notes.test");
  assert.match(stopHourlyCopy().workLogHint, /not an attachment or evidence/i);
});

test("work-log sentinel is never Resolution Center evidence", () => {
  const contract = hourlyContract({ releasedAmount: 10_000_000n });
  const state = makeHourlyState({
    approvedSeconds: 3_600n,
    sessionCount: 1,
    activeSessionIndex: 0,
  });
  const sentinelContext = resolutionContext(
    contract,
    [],
    contract.startTime + 100,
    (amount) => amount.toString(),
    {
      hourlyState: state,
      hourlySession: makeHourlySession({
        workLogUri: HOURLY_NO_ATTACHMENT_URI,
        status: "Recorded",
      }),
    }
  );
  assert.equal(
    sentinelContext.facts.some((fact) => fact.value.includes(HOURLY_NO_ATTACHMENT_URI)),
    false
  );
  assert.equal(
    sentinelContext.facts.some((fact) => fact.label === "Work log link or note"),
    false
  );

  const realContext = resolutionContext(
    contract,
    [],
    contract.startTime + 100,
    (amount) => amount.toString(),
    {
      hourlyState: state,
      hourlySession: makeHourlySession({
        workLogUri: "https://notes.test/log",
        status: "Recorded",
      }),
    }
  );
  assert.ok(
    realContext.facts.some(
      (fact) =>
        fact.label === "Work log link or note" && fact.value === "https://notes.test/log"
    )
  );
});

test("Hourly engagement hours and days convert to seconds", () => {
  assert.equal(engagementDurationToSeconds("8", "hours"), 28_800);
  assert.equal(engagementDurationToSeconds("14", "days"), 1_209_600);
  assert.equal(parseEngagementDuration("8", "hours").seconds, 28_800);
  assert.equal(parseEngagementDuration("14", "days").seconds, 1_209_600);
  assert.ok(parseEngagementDuration("0", "hours").error);
  const hours = applyCreateDraftPatch(validHourlyDraft(), {
    engagementDurationValue: "8",
    engagementDurationUnit: "hours",
  });
  assert.equal(hours.durationSeconds, 28_800);
  const days = applyCreateDraftPatch(validHourlyDraft(), {
    engagementDurationValue: "14",
    engagementDurationUnit: "days",
  });
  assert.equal(days.durationSeconds, 1_209_600);
});

test("authorized time and engagement window remain distinct", () => {
  const draft = applyCreateDraftPatch(validHourlyDraft(), {
    authorizedTimeValue: "40",
    authorizedTimeUnit: "hours",
    engagementDurationValue: "14",
    engagementDurationUnit: "days",
  });
  const authorized = parseAuthorizedTime(
    draft.authorizedTimeValue,
    draft.authorizedTimeUnit
  );
  const engagement = parseEngagementDuration(
    draft.engagementDurationValue,
    draft.engagementDurationUnit
  );
  assert.equal(authorized.seconds, 144_000);
  assert.equal(engagement.seconds, 1_209_600);
  assert.notEqual(authorized.seconds, engagement.seconds);
  assert.equal(draft.durationSeconds, 1_209_600);
  assert.match(HOURLY_COPY.authorizedVsEngagement, /maximum payable work time/i);
  assert.match(HOURLY_COPY.authorizedVsEngagement, /calendar period/i);
  assert.match(HOURLY_COPY.authorizedVsEngagement, /40 authorized work hours/i);
});

test("Hourly review summary distinguishes authorized time from engagement window", () => {
  const lines = hourlyCreateReviewLines({
    hourlyRateUi: "10",
    authorizedTimeValue: "40",
    authorizedTimeUnit: "hours",
    engagementDurationValue: "14",
    engagementDurationUnit: "days",
    maxWorkBudgetLabel: "400",
    trialEnabled: true,
    trialAmountLabel: "20",
    maxEscrowLabel: "420 (work budget + trial)",
  });
  assert.deepEqual(lines, [
    "Hourly rate: 10 / hour",
    "Authorized work time: 40 hours",
    "Engagement window: 14 days",
    "Maximum work budget: 400",
    "Trial amount: 20",
    "Maximum escrow funding: 420 (work budget + trial)",
  ]);
  const source = readFileSync(
    new URL("../../../components/create/CreateWizard.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /hourlyCreateReviewLines/);
  assert.match(source, /Engagement window/);
  assert.match(source, /Authorized working time/);
  // Wizard surfaces the shared product distinction (not a seconds-only engagement field).
  assert.match(source, /HOURLY_COPY\.authorizedVsEngagement/);
  const scheduleHourly = source.slice(
    source.indexOf('label="Engagement window"'),
    source.indexOf('label="Duration (seconds)"')
  );
  assert.doesNotMatch(scheduleHourly, /Engagement duration \(seconds\)/);
  assert.match(scheduleHourly, /engagementDurationValue/);
});

test("Fixed Milestone and Streaming create paths remain intact", () => {
  const now = Math.floor(Date.now() / 1000);
  const draft = defaultCreateDraft();
  draft.freelancer = WALLET_B.toBase58();
  draft.totalAmountUi = "10";
  draft.title = "Landing page";
  draft.description = "Ship the page";
  draft.acceptanceDeadlineLocal = futureAcceptance();
  draft.durationSeconds = 3600;
  draft.reviewDuration = 600;
  draft.mint = PREMIFLOW_TEST_TOKEN.mint.toBase58();
  draft.resolver = PREMIFLOW_RESOLVER.address.toBase58();
  assert.deepEqual(validateCreateDraft(WALLET_A, { ...draft, paymentMode: "Fixed" }, now), {});
  assert.deepEqual(
    validateCreateDraft(
      WALLET_A,
      {
        ...draft,
        paymentMode: "Milestone",
        milestones: [{ label: "Ship", amountUi: "10", dueOffsetSeconds: 1800 }],
      },
      now
    ),
    {}
  );
  assert.deepEqual(
    validateCreateDraft(
      WALLET_A,
      { ...draft, paymentMode: "Streaming", checkpointInterval: 1800 },
      now
    ),
    {}
  );
});

test("Hourly idle dashboard remaining time", () => {
  const dash = hourlyDashboard(
    hourlyContract(),
    makeHourlyState({ authorizedSeconds: 28_800n, approvedSeconds: 9_300n }),
    null,
    1_700_000_100
  );
  assert.equal(dash?.authorizedSeconds, 28_800);
  assert.equal(dash?.approvedSeconds, 9_300);
  assert.equal(dash?.remainingAuthorizedSeconds, 19_500);
  assert.equal(formatHourlyDuration(9_300), "2h 35m");
  assert.equal(formatHourlyDuration(19_500), "5h 25m");
});

test("active session index sentinel is not a real session", () => {
  assert.equal(HOURLY_NO_ACTIVE_SESSION, 0xffff_ffff);
  assert.equal(
    canStartHourlyWork({
      role: "freelancer",
      contract: hourlyContract(),
      hourlyState: makeHourlyState({ activeSessionIndex: HOURLY_NO_ACTIVE_SESSION }),
      now: hourlyContract().startTime + 10,
    }),
    true
  );
});

test("Hourly salary workspace surfaces rate, session, balances, and gated Collect", () => {
  const source = readFileSync(
    new URL("../../../components/contracts/HourlyShowcase.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /Hourly rate/);
  assert.match(source, /HOURLY_COPY\.runningStatus/);
  assert.match(source, /formatElapsedClock/);
  assert.match(source, /openSessionNotCollectable/);
  assert.match(source, /Recorded \/ worked time/);
  assert.match(source, /Earned \/ released/);
  assert.match(source, /Collected/);
  assert.match(source, /Available to collect/);
  assert.match(source, /Remaining budget/);
  assert.match(source, /aria-label="Start work"/);
  assert.match(source, /aria-label="Stop work"/);
  assert.match(source, /canCollect && onCollect/);
  assert.match(source, /onCollect/);
  assert.match(source, /does not end the contract|collectExplain/);
  assert.match(source, /display only — not\s+added to Available/);
  assert.doesNotMatch(source, /status\s*=\s*"Completed"|contract\.status\s*=\s*"Completed"/);
  assert.doesNotMatch(source, /availableToCollect \+ dash\.estimatedSessionValue|estimatedSessionValue \+/);

  const open = makeHourlyState({ sessionCount: 1, activeSessionIndex: 0 });
  const dash = hourlyDashboard(
    hourlyContract({ releasedAmount: 80_000_000n }),
    open,
    makeHourlySession({ startedAt: 1_000 }),
    1_000 + 3_600
  );
  assert.ok(dash?.hasActiveSession);
  assert.equal(dash?.availableToCollect, 80_000_000n);
  assert.ok(dash!.estimatedSessionValue > 0n);
  assert.notEqual(dash!.availableToCollect, dash!.availableToCollect + dash!.estimatedSessionValue);

  const withReleased = availableActions({
    wallet: WALLET_B,
    contract: hourlyContract({ releasedAmount: 10_000_000n }),
    hourlyState: open,
    now: 1_700_000_010,
  });
  assert.ok(withReleased.includes("withdrawFreelancer"));
  assert.ok(withReleased.includes("stopHourlySession"));

  const employer = availableActions({
    wallet: WALLET_A,
    contract: hourlyContract({ releasedAmount: 10_000_000n }),
    hourlyState: makeHourlyState(),
    now: 1_700_000_010,
  });
  assert.equal(employer.includes("withdrawFreelancer"), false);
  assert.match(source, /role === "employer"/);
  assert.equal(clientMethodForAction("withdrawFreelancer"), "withdrawFreelancer");
});

test("expired Hourly engagement: Start work gated before / at / after end (now >= endTime)", () => {
  const contract = hourlyContract();
  const idle = makeHourlyState();
  const end = contract.endTime;
  const cases: Array<[number, boolean]> = [
    [end - 1, true],
    [end, false],
    [end + 60, false],
  ];
  for (const [now, startable] of cases) {
    assert.equal(isHourlyEngagementExpired(contract, now), !startable, `expired @${now - end}`);
    assert.equal(
      canStartHourlyWork({ role: "freelancer", contract, hourlyState: idle, now }),
      startable,
      `panel @${now - end}`
    );
    const actions = availableActions({ wallet: WALLET_B, contract, hourlyState: idle, now });
    assert.equal(actions.includes("startHourlySession"), startable, `actions @${now - end}`);
    assert.equal(
      isHourlyEngagementEnded({ contract, running: false, now }),
      !startable,
      `ended state @${now - end}`
    );
  }
  // Only Start work is removed; other existing actions keep their own gating.
  const before = availableActions({ wallet: WALLET_B, contract, hourlyState: idle, now: end - 1 });
  const after = availableActions({ wallet: WALLET_B, contract, hourlyState: idle, now: end });
  assert.deepEqual(after, before.filter((a) => a !== "startHourlySession"));
  const employerBefore = availableActions({ wallet: WALLET_A, contract, hourlyState: idle, now: end - 1 });
  const employerAfter = availableActions({ wallet: WALLET_A, contract, hourlyState: idle, now: end });
  assert.deepEqual(employerAfter, employerBefore);
});

test("Hourly panel shows Engagement ended instead of Ready to start work", () => {
  const source = readFileSync(
    new URL("../../../components/contracts/HourlyShowcase.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /isHourlyEngagementEnded\(\{ contract, running, now: clockNow \}\)/);
  assert.match(source, /HOURLY_COPY\.engagementEndedTitle/);
  assert.match(source, /canStart && onStart && !engagementEnded/);
  assert.equal(HOURLY_COPY.engagementEndedTitle, "Engagement ended");
  assert.match(HOURLY_COPY.engagementEndedExplain, /no new work session can start/);
  assert.doesNotMatch(HOURLY_COPY.engagementEndedExplain, /dispute/i);
});
