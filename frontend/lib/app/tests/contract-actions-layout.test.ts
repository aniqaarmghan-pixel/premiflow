import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { PaymentModeName, UiAction } from "@/lib/streampay-v2";

import { summaryWorkUnitActions, workUnitsHaveOwnCards } from "../view-model";

type Unit = { index: number };

const UNITS: Unit[] = [{ index: 0 }, { index: 1 }, { index: 2 }];
const REVIEW_ACTIONS: UiAction[] = ["approveWorkUnit", "finalizeReviewTimeout"];

function summaryFor(paymentMode: PaymentModeName) {
  return summaryWorkUnitActions({
    paymentMode,
    units: UNITS,
    actionsFor: () => REVIEW_ACTIONS,
  });
}

test("Milestone: per-unit review actions are not repeated in the contract-level Actions card", () => {
  assert.equal(workUnitsHaveOwnCards("Milestone"), true);
  assert.deepEqual(summaryFor("Milestone"), []);
});

test("Fixed: the deliverable card owns its unit actions, so the summary adds none", () => {
  assert.equal(workUnitsHaveOwnCards("Fixed"), true);
  assert.deepEqual(summaryFor("Fixed"), []);
});

test("Streaming and Hourly have no unit cards, so unit actions stay in the summary per unit", () => {
  for (const mode of ["Streaming", "Hourly"] as const) {
    assert.equal(workUnitsHaveOwnCards(mode), false);
    const summary = summaryFor(mode);
    assert.equal(summary.length, UNITS.length * REVIEW_ACTIONS.length);
    for (const unit of UNITS) {
      const forUnit = summary.filter((entry) => entry.unit === unit).map((e) => e.action);
      assert.deepEqual(forUnit, REVIEW_ACTIONS, `unit ${unit.index} keeps its own actions`);
    }
  }
});

test("summary actions are computed per unit, never shared across units", () => {
  const summary = summaryWorkUnitActions<Unit>({
    paymentMode: "Streaming",
    units: UNITS,
    actionsFor: (unit) => (unit.index === 1 ? ["finalizeReviewTimeout"] : []),
  });
  assert.deepEqual(summary, [{ action: "finalizeReviewTimeout", unit: UNITS[1] }]);
});

test("ContractDetail uses the shared layout rule for summary buttons and unit cards", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(
    path.join(here, "../../../components/contracts/ContractDetail.tsx"),
    "utf8"
  );
  assert.match(src, /const primaryUnitButtons = summaryWorkUnitActions\(\{/);
  assert.match(src, /\{workUnitsHaveOwnCards\(contract\.paymentMode\) \? \(/);
  assert.match(
    src,
    /onAction=\{\(action\) => requestAction\(action, unit\)\}/,
    "each unit card still targets its own work unit"
  );
  assert.doesNotMatch(src, /const primaryUnitButtons = main\.flatMap/);
});
