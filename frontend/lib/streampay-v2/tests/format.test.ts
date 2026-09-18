import assert from "node:assert/strict";
import test from "node:test";

import {
  baseUnitsToUiAmount,
  dateToUnixSeconds,
  localDateTimeInputToUnixSeconds,
  uiAmountToBaseUnits,
  unixSecondsToUtcDate,
  utcIsoToUnixSeconds,
} from "../format";

test("amount conversion is exact", () => {
  assert.equal(uiAmountToBaseUnits("1.23", 6), 1_230_000n);
  assert.equal(baseUnitsToUiAmount(1_230_000n, 6), "1.23");
  assert.equal(uiAmountToBaseUnits("1", 0), 1n);
  assert.equal(baseUnitsToUiAmount(1n, 0), "1");
  assert.equal(uiAmountToBaseUnits("0.000001", 6), 1n);
});

test("large amount conversion does not lose precision", () => {
  const ui = "9007199254740993";
  const base = uiAmountToBaseUnits(ui, 0);
  assert.equal(base, 9007199254740993n);
  assert.equal(baseUnitsToUiAmount(base, 0), ui);
  const withDecimals = uiAmountToBaseUnits("184467440737.095516", 6);
  assert.equal(withDecimals, 184467440737095516n);
  assert.equal(baseUnitsToUiAmount(withDecimals, 6), "184467440737.095516");
});

test("rejects invalid, negative, overflowing, and over-precise amounts", () => {
  assert.throws(() => uiAmountToBaseUnits("-1", 6));
  assert.throws(() => uiAmountToBaseUnits("", 6));
  assert.throws(() => uiAmountToBaseUnits("1.2.3", 6));
  assert.throws(() => uiAmountToBaseUnits("1.1234567", 6));
  assert.throws(() => uiAmountToBaseUnits("18446744073709551616", 0));
});

test("time conversion uses seconds, not milliseconds", () => {
  const date = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 500));
  const seconds = dateToUnixSeconds(date);
  assert.equal(seconds, Math.floor(date.getTime() / 1000));
  assert.notEqual(seconds, date.getTime());
  assert.equal(seconds * 1000 + 500, date.getTime());
  const roundTrip = unixSecondsToUtcDate(seconds);
  assert.equal(roundTrip.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("UTC ISO timestamps require an explicit timezone", () => {
  assert.equal(utcIsoToUnixSeconds("2026-01-01T00:00:00Z"), 1_767_225_600);
  assert.throws(() => utcIsoToUnixSeconds("2026-01-01T00:00:00"));
  const local = localDateTimeInputToUnixSeconds("2026-01-01T00:00:00");
  assert.equal(typeof local, "number");
  assert.equal(local, Math.floor(new Date("2026-01-01T00:00:00").getTime() / 1000));
});
