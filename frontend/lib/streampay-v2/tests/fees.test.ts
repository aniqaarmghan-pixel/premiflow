import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PLATFORM_FEE_BPS as BPS,
  employerTotal,
  feeDueOnRelease,
  feeOn,
  feeRefundDue,
  unearnedFeeReturned,
} from "../fees";

test("100 principal costs employer 103 at 3%", () => {
  assert.equal(feeOn(100n, BPS), 3n);
  assert.equal(employerTotal(100n, BPS), 103n);
  assert.equal(feeDueOnRelease(100n, 0n, 3n, BPS), 3n);
});

test("floor rounding for tiny/odd amounts", () => {
  assert.equal(feeOn(1n, BPS), 0n);
  assert.equal(feeOn(33n, BPS), 0n);
  assert.equal(feeOn(34n, BPS), 1n);
  assert.equal(feeOn(1_000_001n, BPS), 30_000n);
});

test("partial releases sum to full reserve", () => {
  const reserve = feeOn(1_000n, BPS);
  let paid = 0n;
  for (const w of [333n, 666n, 1_000n]) paid += feeDueOnRelease(w, paid, reserve, BPS);
  assert.equal(paid, reserve);
});

test("refund returns unearned fee; release + refund conserve reserve", () => {
  const reserve = feeOn(1_000n, BPS);
  const paid = feeDueOnRelease(400n, 0n, reserve, BPS);
  const back = feeRefundDue(1_000n, 0n, 600n, reserve, BPS);
  assert.equal(paid + back, reserve);
  assert.equal(unearnedFeeReturned(1_000n, 1_000n, reserve, BPS), reserve);
});

test("zero bps and invalid inputs", () => {
  assert.equal(employerTotal(500n, 0), 500n);
  assert.throws(() => feeOn(1n, 10_001));
  assert.throws(() => feeOn(-1n, BPS));
  assert.throws(() => feeDueOnRelease(1_000n, 0n, 1n, BPS));
});

test("u64 max principal does not overflow fee", () => {
  const max = (1n << 64n) - 1n;
  assert.equal(feeOn(max, BPS), (max * 300n) / 10_000n);
});
