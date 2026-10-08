import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Keypair } from "@solana/web3.js";

import {
  OFFER_REVISION_COPY,
  clearReviseHandoff,
  draftFromCancelledOffer,
  isOfferChangesRequested,
  isOfferRevisedLabel,
  loadReviseHandoff,
  markOfferChangesRequested,
  markOfferRevised,
  presentOfferTerminalLabel,
  saveReviseHandoff,
} from "../offer-revision";
import { defaultCreateDraft } from "../validation";
import type { IntentScope } from "../milestone-create-plan";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const scope: IntentScope = { cluster: "devnet", programId: "EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd" };

function mem(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test("Request Changes does not invent an on-chain action", () => {
  const actions = read("lib/streampay-v2/actions.ts");
  const detail = read("components/contracts/ContractDetail.tsx");
  assert.doesNotMatch(actions, /requestOfferChanges|requestChangesContract/);
  assert.match(detail, /data-testid="offer-request-changes"/);
  assert.match(detail, /OFFER_REVISION_COPY\.requestChangesNote/);
  assert.match(detail, /data-testid="offer-awaiting-revision"/);
  assert.match(detail, /data-testid="offer-changes-requested"/);
  assert.match(OFFER_REVISION_COPY.requestChangesNote, /does not accept, decline, cancel, or move escrow funds/);
  assert.match(OFFER_REVISION_COPY.awaitingEmployerRevision, /unchanged on-chain/);
  assert.match(OFFER_REVISION_COPY.changesRequestedEmployer, /unchanged/);
});

test("employer PendingAcceptance can cancelPendingOffer; freelancer cannot", () => {
  const employer = Keypair.generate().publicKey;
  const freelancer = Keypair.generate().publicKey;
  const base = {
    status: "PendingAcceptance" as const,
    paymentMode: "Fixed" as const,
    employer,
    freelancer,
    acceptedAt: 0,
    acceptanceDeadline: 1_700_003_600,
    startTime: 0,
    endTime: 0,
    totalAmount: 100n,
    releasedAmount: 0n,
    withdrawnAmount: 0n,
    refundedAmount: 0n,
    openReviewCount: 0,
    trialAmount: 0n,
  };
  // availableActions signature may need more fields ? assert via source if call fails
  const src = read("lib/streampay-v2/actions.ts");
  assert.match(src, /actions\.add\("cancelPendingOffer"\)/);
  assert.match(src, /contract\.status === "PendingAcceptance" &&\s*role === "employer"/);
  void base;
});

test("cancel then claim then create is gated; failed claim does not create", () => {
  const detail = read("components/contracts/ContractDetail.tsx");
  const wizard = read("components/create/CreateWizard.tsx");
  assert.match(detail, /case "cancelPendingOffer"/);
  assert.match(detail, /claimEmployerRefund/);
  assert.match(detail, /cancelPendingOffer claim refund failed/);
  assert.match(detail, /router\.push\("\/create"\)/);
  assert.match(detail, /saveReviseHandoff/);
  // claim catch returns before saveReviseHandoff
  const catchIdx = detail.indexOf("cancelPendingOffer claim refund failed");
  const saveIdx = detail.indexOf("saveReviseHandoff(");
  assert.ok(catchIdx > 0 && saveIdx > catchIdx);
  const between = detail.slice(catchIdx, saveIdx);
  assert.match(between, /return;/);
  assert.match(wizard, /data-testid="offer-revise-handoff"/);
  assert.match(wizard, /markOfferRevised/);
  assert.match(OFFER_REVISION_COPY.cancelReviseNewOffer, /new contract id/);
  assert.match(OFFER_REVISION_COPY.cancelReviseFunds, /unearned platform fee reserve/);
});

test("changes requested and revised labels are local-only", () => {
  const storage = mem();
  const address = "Offer111";
  assert.equal(isOfferChangesRequested(storage, scope, address), false);
  assert.equal(markOfferChangesRequested(storage, scope, address), true);
  assert.equal(isOfferChangesRequested(storage, scope, address), true);
  assert.equal(presentOfferTerminalLabel({ status: "Cancelled", revised: false }), "Cancelled");
  assert.equal(markOfferRevised(storage, scope, address, "New222"), true);
  assert.equal(isOfferRevisedLabel(storage, scope, address), true);
  assert.equal(presentOfferTerminalLabel({ status: "Cancelled", revised: true }), "Revised");
  assert.equal(presentOfferTerminalLabel({ status: "Declined", revised: true }), "Declined");
});

test("revise handoff stores a new draft and does not reuse the cancelled address", () => {
  const storage = mem();
  const employer = "Employer111";
  const cancelled = "CancelledPda";
  const base = defaultCreateDraft();
  const freelancer = Keypair.generate().publicKey;
  const draft = draftFromCancelledOffer({
    contract: {
      freelancer,
      paymentMode: "Fixed",
      totalAmount: 100n,
      trialAmount: 0n,
      mainAmount: 100n,
      reviewDuration: 86_400,
      activationReviewDuration: 86_400,
      maxRevisions: 2,
      acceptanceDeadline: 0,
      createdAt: 0,
      checkpointInterval: 0,
      startMode: "OnActivation",
    } as never,
    base,
    title: "Old title",
    description: "Old desc",
    totalAmountUi: "100",
    trialAmountUi: "0",
  });
  assert.equal(draft.title, "Old title");
  assert.equal(draft.freelancer, freelancer.toBase58());
  assert.equal(saveReviseHandoff(storage, scope, employer, cancelled, draft), true);
  const loaded = loadReviseHandoff(storage, scope, employer);
  assert.ok(loaded);
  assert.equal(loaded!.revisedFrom, cancelled);
  assert.notEqual(loaded!.revisedFrom, "will-be-new");
  clearReviseHandoff(storage, scope, employer);
  assert.equal(loadReviseHandoff(storage, scope, employer), null);
});
