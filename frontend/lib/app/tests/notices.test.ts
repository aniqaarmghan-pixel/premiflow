import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NOTICE_AUTO_DISMISS_MS,
  NoticeDedupe,
  dismissNotice,
  noticeFromAccountRefresh,
  noticeFromTxOutcome,
  prependNotice,
  requestNoticeSound,
  shouldPlayNoticeSound,
  type InAppNotice,
} from "../notice-feed";
import { playNoticeSound } from "../notice-sound";
import {
  NOTICE_CATALOG,
  SOUND_PREF_KEY,
  isNoticeSoundEnabled,
  noticeKindForAction,
  setNoticeSoundEnabled,
} from "../notices";
import type { TxPhase } from "../tx-state";

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

test("sound preference defaults off and persists on/off", () => {
  const storage = new MemoryStorage();
  assert.equal(isNoticeSoundEnabled(storage), false);
  setNoticeSoundEnabled(true, storage);
  assert.equal(storage.getItem(SOUND_PREF_KEY), "1");
  assert.equal(isNoticeSoundEnabled(storage), true);
  setNoticeSoundEnabled(false, storage);
  assert.equal(storage.getItem(SOUND_PREF_KEY), "0");
  assert.equal(isNoticeSoundEnabled(storage), false);
});

test("confirmed meaningful action produces one notification", () => {
  const dedupe = new NoticeDedupe();
  const notice = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "sig-approve",
      action: "approveWorkUnit",
      now: 1,
    },
    dedupe
  );
  assert.ok(notice);
  assert.equal(notice.kind, "work_approved");
  assert.equal(notice.id, "tx:sig-approve");
  assert.equal(notice.level, "success");
  const again = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "sig-approve",
      action: "approveWorkUnit",
      now: 2,
    },
    dedupe
  );
  assert.equal(again, null);
});

test("confirmed meaningful action with sound ON requests one sound", () => {
  const notice = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "sig-sound",
      action: "withdrawFreelancer",
      now: 1,
    },
    new NoticeDedupe()
  );
  assert.ok(notice);
  let plays = 0;
  const played = requestNoticeSound(true, notice, () => {
    plays += 1;
    return true;
  });
  assert.equal(played, true);
  assert.equal(plays, 1);
});

test("sound OFF produces no sound", () => {
  const notice = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "sig-quiet",
      action: "completeContract",
      now: 1,
    },
    new NoticeDedupe()
  );
  let plays = 0;
  const played = requestNoticeSound(false, notice, () => {
    plays += 1;
    return true;
  });
  assert.equal(played, false);
  assert.equal(plays, 0);
});

test("failed, wallet rejection, pending, and confirming produce no success notice or sound", () => {
  const dedupe = new NoticeDedupe();
  const phases: TxPhase[] = [
    "ready",
    "awaiting_wallet",
    "submitting",
    "confirming",
    "pending_confirmation",
    "failed",
  ];
  for (const phase of phases) {
    const notice = noticeFromTxOutcome(
      {
        phase,
        signature: `sig-${phase}`,
        action: "approveWorkUnit",
        now: 1,
      },
      dedupe
    );
    assert.equal(notice, null, phase);
    assert.equal(shouldPlayNoticeSound(true, notice), false, phase);
  }
});

test("duplicate confirmed result does not replay", () => {
  const dedupe = new NoticeDedupe();
  const first = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "dup",
      action: "requestWorkRevision",
      now: 1,
    },
    dedupe
  );
  const second = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "dup",
      noticeKind: "revision_requested",
      now: 2,
    },
    dedupe
  );
  assert.ok(first);
  assert.equal(second, null);
  const stacked = prependNotice([], first);
  assert.equal(prependNotice(stacked, first).length, 1);
});

test("RPC/account refresh does not create a notification", () => {
  assert.equal(noticeFromAccountRefresh(), null);
});

test("request revision, revised submit, and expired revision use catalog copy", () => {
  assert.equal(noticeKindForAction("requestWorkRevision"), "revision_requested");
  assert.equal(NOTICE_CATALOG.revision_requested.title, "Revision requested");
  assert.equal(
    noticeKindForAction("submitWorkUnit", { workUnitStatus: "Revising" }),
    "revised_deliverable_submitted"
  );
  assert.equal(
    NOTICE_CATALOG.revised_deliverable_submitted.title,
    "Revised deliverable submitted"
  );
  assert.equal(noticeKindForAction("voidStaleRevision"), "expired_revision_ended");
  assert.equal(NOTICE_CATALOG.expired_revision_ended.title, "Expired revision ended");
  assert.equal(
    noticeFromTxOutcome(
      {
        phase: "success",
        signature: "sched-1",
        noticeKind: "revision_deadline_passed",
        now: 1,
      },
      new NoticeDedupe()
    ),
    null
  );
});

test("create success uses SuccessMoment without duplicate toast or sound", () => {
  const wizard = readFileSync(
    new URL("../../../components/create/CreateWizard.tsx", import.meta.url),
    "utf8"
  );
  assert.match(wizard, /<SuccessMoment/);
  assert.match(wizard, /suppressNotice:\s*true/);
  assert.doesNotMatch(wizard, /noticeKind:\s*"contract_created"/);
  assert.equal(NOTICE_CATALOG.contract_created.title, "Contract created");

  const notice = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "create-sig",
      noticeKind: "contract_created",
      suppressNotice: true,
      now: 1,
    },
    new NoticeDedupe()
  );
  assert.equal(notice, null);
  assert.equal(shouldPlayNoticeSound(true, notice), false);
});

test("approveTrialAndActivate uses a dedicated activation notice, not work_approved", () => {
  assert.equal(noticeKindForAction("approveWorkUnit"), "work_approved");
  assert.equal(
    noticeKindForAction("approveTrialAndActivate"),
    "trial_approved_and_activated"
  );
  const copy = NOTICE_CATALOG.trial_approved_and_activated;
  assert.equal(copy.title, "Trial approved and contract activated");
  assert.match(copy.body, /released in contract accounting/i);
  assert.match(copy.body, /contract is now active/i);
  assert.match(copy.body, /withdraws released funds separately/i);
  assert.doesNotMatch(copy.body, /\bpaid\b|\btransferred\b|\breceived in wallet\b/i);
  const notice = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "sig-trial-activate",
      action: "approveTrialAndActivate",
      now: 1,
    },
    new NoticeDedupe()
  );
  assert.ok(notice);
  assert.equal(notice.kind, "trial_approved_and_activated");
});

test("rejectActivation notice matches ActivationRejected or Disputed from source", () => {
  assert.equal(noticeKindForAction("rejectActivation"), "activation_declined");
  assert.equal(
    noticeKindForAction("rejectActivation", { workUnitStatus: "Defined" }),
    "activation_declined"
  );
  const declined = NOTICE_CATALOG.activation_declined;
  assert.match(declined.body, /did not activate/i);
  assert.doesNotMatch(declined.body, /\bpaid\b|\btransferred\b|\breceived in wallet\b|\brefunded\b|\breturned\b/i);

  assert.equal(
    noticeKindForAction("rejectActivation", { workUnitStatus: "Submitted" }),
    "activation_rejected_disputed"
  );
  assert.equal(
    noticeKindForAction("rejectActivation", { workUnitStatus: "Revising" }),
    "activation_rejected_disputed"
  );
  const disputed = NOTICE_CATALOG.activation_rejected_disputed;
  assert.match(disputed.title, /dispute/i);
  assert.match(disputed.body, /frozen in dispute/i);
  assert.doesNotMatch(
    disputed.body,
    /\bpaid\b|\btransferred\b|\breceived in wallet\b|\brefunded\b|\breturned\b/i
  );
});

test("approve, timeout, stream, cancel, complete, dispute, withdraw, and refund wording stay economically accurate", () => {
  const approved = NOTICE_CATALOG.work_approved;
  assert.equal(approved.title, "Work approved");
  assert.match(approved.body, /released in accounting/i);
  assert.match(approved.body, /withdraws available funds separately/i);
  assert.doesNotMatch(approved.body, /\bpaid\b|\btransferred\b|\breceived in wallet\b/i);

  const timeout = NOTICE_CATALOG.payment_released;
  assert.equal(noticeKindForAction("finalizeReviewTimeout"), "payment_released");
  assert.equal(noticeKindForAction("releaseStreamAccrual"), "payment_released");
  assert.equal(timeout.title, "Release recorded");
  assert.match(timeout.body, /Released accounting increased/i);
  assert.match(timeout.body, /Tokens move only when withdrawn/i);
  assert.doesNotMatch(timeout.body, /\bpaid\b|\btransferred\b|\breceived in wallet\b/i);

  const cancelled = NOTICE_CATALOG.contract_cancelled;
  assert.equal(noticeKindForAction("cancelActiveContract"), "contract_cancelled");
  assert.match(cancelled.body, /Settlement was recorded/i);
  assert.match(cancelled.body, /Tokens move only when withdraw or refund is claimed/i);
  assert.doesNotMatch(cancelled.body, /\bpaid\b|\btransferred\b|\breceived in wallet\b|\brefunded\b/i);

  const completed = NOTICE_CATALOG.contract_completed;
  assert.equal(completed.title, "Contract completed");
  assert.match(completed.body, /did not itself transfer tokens/i);
  assert.doesNotMatch(completed.body, /paid the freelancer|tokens left escrow|\btransferred\b/i);

  const resolved = NOTICE_CATALOG.dispute_resolved;
  assert.equal(noticeKindForAction("resolveDispute"), "dispute_resolved");
  assert.match(resolved.body, /Settlement accounting was recorded/i);
  assert.match(resolved.body, /Withdraw and refund remain separate claims/i);
  assert.doesNotMatch(resolved.body, /\bpaid\b|\btransferred\b|\breceived in wallet\b/i);

  const voided = NOTICE_CATALOG.expired_revision_ended;
  assert.match(voided.body, /No payment was released, transferred, or refunded/i);

  const withdrawn = NOTICE_CATALOG.withdrawal_completed;
  assert.equal(noticeKindForAction("withdrawFreelancer"), "withdrawal_completed");
  assert.equal(withdrawn.title, "Withdrawal complete");
  assert.match(withdrawn.body, /transferred to your wallet/i);

  const refunded = NOTICE_CATALOG.refund_claimed;
  assert.equal(noticeKindForAction("claimEmployerRefund"), "refund_claimed");
  assert.match(refunded.body, /transferred from escrow/i);
});

test("one confirmed signature produces one notice; different signatures each produce a notice", () => {
  const dedupe = new NoticeDedupe();
  const first = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "sig-a",
      action: "approveWorkUnit",
      now: 1,
    },
    dedupe
  );
  const same = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "sig-a",
      action: "withdrawFreelancer",
      now: 2,
    },
    dedupe
  );
  const second = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "sig-b",
      action: "withdrawFreelancer",
      now: 3,
    },
    dedupe
  );
  assert.ok(first);
  assert.equal(first.kind, "work_approved");
  assert.equal(same, null);
  assert.ok(second);
  assert.equal(second.kind, "withdrawal_completed");
  assert.notEqual(first.id, second.id);
});

test("visible toast stack is capped at three", () => {
  const dedupe = new NoticeDedupe();
  const notices = ["sig-1", "sig-2", "sig-3", "sig-4"].reduce((stack, signature) => {
    const notice = noticeFromTxOutcome(
      {
        phase: "success",
        signature,
        action: "acceptContract",
        now: 1,
      },
      dedupe
    );
    assert.ok(notice);
    return prependNotice(stack, notice);
  }, [] as InAppNotice[]);
  assert.equal(notices.length, 3);
  assert.equal(notices[0]?.signature, "sig-4");
  assert.equal(notices[2]?.signature, "sig-2");
});

test("inaccessible Web Audio failure does not break visual notification", () => {
  const notice = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "sig-audio-fail",
      action: "completeContract",
      now: 1,
    },
    new NoticeDedupe()
  );
  assert.ok(notice);
  const played = requestNoticeSound(true, notice, () => {
    throw new Error("AudioContext unavailable");
  });
  assert.equal(played, false);
  assert.equal(notice.title, "Contract completed");
  assert.doesNotThrow(() => playNoticeSound());
});

test("notification dismiss works", () => {
  const notice = noticeFromTxOutcome(
    {
      phase: "success",
      signature: "sig-dismiss",
      action: "openDispute",
      now: 1,
    },
    new NoticeDedupe()
  );
  assert.ok(notice);
  assert.deepEqual(dismissNotice([notice], notice.id), []);
  assert.equal(NOTICE_AUTO_DISMISS_MS > 1000, true);
});

test("toast surface stays a live region, not a history feed", () => {
  const provider = readFileSync(
    new URL("../../../components/shell/NoticeProvider.tsx", import.meta.url),
    "utf8"
  );
  assert.match(provider, /aria-live="polite"/);
  assert.match(provider, /top-20/);
  assert.match(provider, /break-words/);
  assert.match(provider, /motion-reduce:animate-none/);
  assert.doesNotMatch(provider, /notice\.signature/);
});

test("toggling sound preference does not play a preview", () => {
  const preference = readFileSync(
    new URL("../../../components/shell/SoundPreference.tsx", import.meta.url),
    "utf8"
  );
  assert.match(preference, /unlockNoticeAudio/);
  assert.doesNotMatch(preference, /playNoticeSound/);
});
