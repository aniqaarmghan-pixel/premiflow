import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmSignatureHttp,
  throwIfNotConfirmed,
  TransactionConfirmationUnknownError,
  TransactionFailedOnChainError,
  type SignatureStatusValue,
} from "../confirm";

const SIG = "xu1VLVJ6sQJKFpPhJHS6M6d91M1AgEHXqpAFPXFbC6fAPM3SPQZFNBKruZZtk3kELVW1pppPMyf1eAcM8hDZ6DT";

function clock() {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}

test("HTTP confirm accepts confirmed status", async () => {
  const result = await confirmSignatureHttp(
    async () => ({ err: null, confirmationStatus: "confirmed" }),
    SIG,
    { timeoutMs: 1_000, intervalMs: 1 }
  );
  assert.deepEqual(result, {
    outcome: "confirmed",
    signature: SIG,
    confirmationStatus: "confirmed",
  });
});

test("HTTP confirm accepts finalized status", async () => {
  const result = await confirmSignatureHttp(
    async () => ({ err: null, confirmationStatus: "finalized" }),
    SIG
  );
  assert.equal(result.outcome, "confirmed");
  if (result.outcome === "confirmed") {
    assert.equal(result.confirmationStatus, "finalized");
  }
});

test("HTTP confirm treats explicit transaction err as failed", async () => {
  const err = { InstructionError: [0, { Custom: 6111 }] };
  const result = await confirmSignatureHttp(
    async () => ({ err, confirmationStatus: "confirmed" }),
    SIG
  );
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.deepEqual(result.err, err);
    assert.equal(result.signature, SIG);
  }
  assert.throws(
    () => throwIfNotConfirmed(result),
    (caught: unknown) =>
      caught instanceof TransactionFailedOnChainError &&
      caught.signature === SIG
  );
});

test("HTTP confirm keeps polling processed then succeeds", async () => {
  const replies: SignatureStatusValue[] = [
    null,
    { err: null, confirmationStatus: "processed" },
    { err: null, confirmationStatus: "confirmed" },
  ];
  let calls = 0;
  const result = await confirmSignatureHttp(
    async () => {
      const next = replies[Math.min(calls, replies.length - 1)];
      calls += 1;
      return next;
    },
    SIG,
    { timeoutMs: 5_000, intervalMs: 0 }
  );
  assert.equal(result.outcome, "confirmed");
  assert.ok(calls >= 3);
});

test("HTTP confirm timeout is unknown, not failed", async () => {
  const time = clock();
  const result = await confirmSignatureHttp(
    async () => ({ err: null, confirmationStatus: "processed" }),
    SIG,
    { timeoutMs: 40, intervalMs: 10, now: time.now, sleep: time.sleep }
  );
  assert.equal(result.outcome, "unknown");
  if (result.outcome === "unknown") {
    assert.equal(result.reason, "timeout");
    assert.equal(result.signature, SIG);
  }
  assert.throws(
    () => throwIfNotConfirmed(result),
    (caught: unknown) =>
      caught instanceof TransactionConfirmationUnknownError &&
      caught.reason === "timeout" &&
      caught.signature === SIG
  );
});

test("HTTP confirm persistent RPC errors become unknown, not failed", async () => {
  const time = clock();
  const result = await confirmSignatureHttp(
    async () => {
      throw new Error("upstream 503");
    },
    SIG,
    { timeoutMs: 40, intervalMs: 10, now: time.now, sleep: time.sleep }
  );
  assert.equal(result.outcome, "unknown");
  if (result.outcome === "unknown") {
    assert.equal(result.reason, "rpc_error");
    assert.match(result.lastError ?? "", /503/);
    assert.equal(result.signature, SIG);
  }
});

test("HTTP confirm recovers after a transient RPC error", async () => {
  let calls = 0;
  const result = await confirmSignatureHttp(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary");
      return { err: null, confirmationStatus: "finalized" };
    },
    SIG,
    { timeoutMs: 5_000, intervalMs: 0 }
  );
  assert.equal(result.outcome, "confirmed");
  assert.equal(calls, 2);
});
