import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCreateAssistantIntent,
  deterministicGuideAnswer,
  fallbackGuideAnswer,
  GENERIC_TOPIC_LIST_FALLBACK,
  isEducationalAssistantPrompt,
  isRecommendationAssistantPrompt,
} from "../copilot-assistant-voice";
import { createSystemContext } from "../copilot";
import { liveSystemContext } from "../copilot-live";

test("intent classification separates explain/howto from recommendations", () => {
  assert.equal(classifyCreateAssistantIntent("Explain streaming contract"), "explain");
  assert.equal(classifyCreateAssistantIntent("What is a milestone contract?"), "explain");
  assert.equal(classifyCreateAssistantIntent("What is a paid trial?"), "explain");
  assert.equal(
    classifyCreateAssistantIntent("What's the difference between Fixed and Streaming?"),
    "explain"
  );
  assert.equal(
    classifyCreateAssistantIntent("How do I create a milestone contract?"),
    "howto"
  );
  assert.equal(
    classifyCreateAssistantIntent(
      "I need a designer for a project with three stages. Which contract should I use?"
    ),
    "recommend"
  );
  assert.equal(
    classifyCreateAssistantIntent("I need a designer for three project stages"),
    "recommend"
  );
  assert.equal(isEducationalAssistantPrompt("Explain streaming contract"), true);
  assert.equal(
    isRecommendationAssistantPrompt(
      "I need a designer for a project with three stages. Which contract should I use?"
    ),
    true
  );
  assert.equal(
    isEducationalAssistantPrompt("I need a designer for a 30-day project with milestones"),
    false
  );
});

test("deterministic guide answers are explanatory", () => {
  const streaming = deterministicGuideAnswer("Explain streaming contract");
  assert.ok(streaming);
  assert.match(streaming!, /Streaming contract/i);
  assert.match(streaming!, /accrues/i);
  assert.match(streaming!, /Fixed/i);
  assert.match(streaming!, /Milestone/i);
  assert.ok(streaming!.split("\n\n").length >= 3);
  assert.doesNotMatch(streaming!, /Suggested type/i);
  assert.doesNotMatch(streaming!, new RegExp(GENERIC_TOPIC_LIST_FALLBACK, "i"));

  const milestone = deterministicGuideAnswer("What is a milestone contract?");
  assert.ok(milestone);
  assert.match(milestone!, /stages/i);
  assert.match(milestone!, /PREMIFLOW/i);
  assert.ok(milestone!.split("\n\n").length >= 3);

  const trial = deterministicGuideAnswer("What is a paid trial?");
  assert.ok(trial);
  assert.match(trial!, /trial/i);
  assert.match(trial!, /wallet/i);
  assert.ok(trial!.split("\n\n").length >= 3);

  const compare = deterministicGuideAnswer(
    "What's the difference between Fixed and Streaming?"
  );
  assert.ok(compare);
  assert.match(compare!, /Fixed/i);
  assert.match(compare!, /Streaming/i);

  const howto = deterministicGuideAnswer("How do I create a milestone contract?");
  assert.ok(howto);
  assert.match(howto!, /1\./);
  assert.match(howto!, /Milestone/i);
});

test("dispute questions get substantive product answers", () => {
  const resolved = deterministicGuideAnswer(
    "if i have a dispute how it will be resolved?"
  );
  assert.ok(resolved);
  assert.match(resolved!, /freeze|frozen|Disputed/i);
  assert.match(resolved!, /resolver/i);
  assert.match(resolved!, /Collect|Claim/i);
  assert.doesNotMatch(resolved!, new RegExp(GENERIC_TOPIC_LIST_FALLBACK, "i"));
  assert.ok(resolved!.split("\n\n").length >= 3);

  const who = deterministicGuideAnswer("who is the resolver?");
  assert.ok(who);
  assert.match(who!, /designated/i);
  assert.match(who!, /split|divid/i);
  assert.match(who!, /does not receive|not receive|does not.*escrow/i);
  assert.doesNotMatch(who!, new RegExp(GENERIC_TOPIC_LIST_FALLBACK, "i"));

  const funds = deterministicGuideAnswer("what happens to my funds during a dispute?");
  assert.ok(funds);
  assert.match(funds!, /escrow|protected/i);
  assert.match(funds!, /Collect|Claim/i);
  assert.match(funds!, /block/i);
  assert.doesNotMatch(funds!, new RegExp(GENERIC_TOPIC_LIST_FALLBACK, "i"));

  const canResolve = deterministicGuideAnswer("can you resolve my dispute?");
  assert.ok(canResolve);
  assert.match(canResolve!, /cannot/i);
  assert.match(canResolve!, /Assistant/i);
  assert.match(canResolve!, /wallet/i);
  assert.doesNotMatch(canResolve!, new RegExp(GENERIC_TOPIC_LIST_FALLBACK, "i"));
});

test("fallback no longer uses the topic-list template", () => {
  const fallback = fallbackGuideAnswer("xyzzy unrelated question", "explain");
  assert.doesNotMatch(fallback, new RegExp(GENERIC_TOPIC_LIST_FALLBACK, "i"));
  assert.match(fallback, /couldn.?t match|don.?t have/i);
});

test("system contexts include depth and safety rules", () => {
  assert.match(createSystemContext(), /2–5 short paragraphs|beginner-friendly/i);
  assert.match(createSystemContext(), /never create, fund, sign/i);
  assert.match(createSystemContext(), /INTENT RULES/i);
  assert.match(createSystemContext(), /Disputes \(actual protocol\)/i);
  assert.match(liveSystemContext(), /authoritative facts/i);
  assert.match(liveSystemContext(), /never sign/i);
  assert.match(liveSystemContext(), /untrusted/i);
});
