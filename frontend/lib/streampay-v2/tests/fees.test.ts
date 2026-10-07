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

test("streaming: cumulative accrual withdrawals earn fee only on released principal", () => {
  const total = 1_000n;
  const reserve = feeOn(total, BPS);
  assert.equal(employerTotal(total, BPS), 1_030n);
  let paid = 0n;
  // Six cumulative releases of a 60s stream; unreleased time earns nothing.
  for (const w of [166n, 333n, 500n]) paid += feeDueOnRelease(w, paid, reserve, BPS);
  assert.equal(paid, feeOn(500n, BPS));
  // Cancel at 50%: unearned fee returns with the principal refund.
  const back = feeRefundDue(total, 0n, total - 500n, reserve, BPS);
  assert.equal(paid + back, reserve);
});

test("hourly: recorded-session principal earns fee, unused budget returns the rest", () => {
  const main = 20_000_000n; // 2h at 10 tokens/h
  const reserve = feeOn(main, BPS);
  const recorded = 10_000_000n; // 1h stopped session
  const paid = feeDueOnRelease(recorded, 0n, reserve, BPS);
  assert.equal(paid, 300_000n);
  const back = feeRefundDue(main, 0n, main - recorded, reserve, BPS);
  assert.equal(paid + back, reserve);
  // Nothing recorded yet (open session): nothing earned.
  assert.equal(feeDueOnRelease(0n, 0n, reserve, BPS), 0n);
});

test("dispute split and tiny base units conserve the reserve", () => {
  for (const total of [1n, 33n, 101n, 7_777n]) {
    const reserve = feeOn(total, BPS);
    for (const award of [0n, 1n, total / 3n, total]) {
      const paid = feeDueOnRelease(award, 0n, reserve, BPS);
      const back = feeRefundDue(total, 0n, total - award, reserve, BPS);
      assert.equal(paid + back, reserve, `total ${total} award ${award}`);
    }
  }
});
