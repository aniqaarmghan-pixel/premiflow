import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";

import {
  assertResolverDistinct,
  defaultPaymentToken,
  defaultResolver,
  findPaymentToken,
  findResolver,
  paymentTokenLabel,
  PREMIFLOW_RESOLVER,
  PREMIFLOW_TEST_TOKEN,
  resolverLabel,
} from "../premiflow";
import {
  defaultCreateDraft,
  validateCreateDraft,
  validateParties,
} from "../validation";
import { toCreateContractArgs } from "../../streampay-v2/instructions";
import type { CreateContractRequest } from "../../streampay-v2/types";
import { WALLET_A, WALLET_B } from "../../streampay-v2/tests/fixtures";

const EMPLOYER = WALLET_A;
const FREELANCER = WALLET_B;

test("configured payment token is selected and mint is derived", () => {
  const draft = defaultCreateDraft();
  const token = defaultPaymentToken();
  assert.equal(draft.mint, token.mint.toBase58());
  assert.equal(draft.mint, PREMIFLOW_TEST_TOKEN.mint.toBase58());
  assert.equal(draft.decimals, 6);
  assert.equal(findPaymentToken(draft.mint)?.id, "premiflow-test-token");
  assert.equal(paymentTokenLabel(draft.mint), "PREMIFLOW Test Token");
});

test("configured resolver is selected automatically", () => {
  const draft = defaultCreateDraft();
  const resolver = defaultResolver();
  assert.equal(draft.resolver, resolver.address.toBase58());
  assert.equal(draft.resolver, PREMIFLOW_RESOLVER.address.toBase58());
  assert.equal(findResolver(draft.resolver)?.name, "PREMIFLOW Resolver");
  assert.equal(resolverLabel(draft.resolver), "PREMIFLOW Resolver");
});

test("create request still receives the exact configured mint and resolver", () => {
  const draft = defaultCreateDraft();
  const request: CreateContractRequest = {
    contractId: 1n,
    paymentMode: "Fixed",
    startMode: "OnActivation",
    totalAmount: 10_000_000n,
    acceptanceDeadline: 2_000_000_000,
    scheduledStartTime: 0,
    durationSeconds: 86_400,
    checkpointInterval: 0,
    reviewDuration: 3_600,
    activationReviewDuration: 3_600,
    maxRevisions: 2,
    trialAmount: 0n,
    resolver: new PublicKey(draft.resolver),
    metadataUri: "memory:review",
    metadataHash: new Uint8Array(32),
  };
  const args = toCreateContractArgs(request);
  assert.equal(args.resolver.toBase58(), PREMIFLOW_RESOLVER.address.toBase58());
  assert.equal(draft.mint, PREMIFLOW_TEST_TOKEN.mint.toBase58());
});

test("resolver cannot equal employer or freelancer", () => {
  assert.equal(
    assertResolverDistinct(PREMIFLOW_RESOLVER.address, PREMIFLOW_RESOLVER.address, FREELANCER),
    "Resolver must be different from the employer."
  );
  assert.equal(
    assertResolverDistinct(PREMIFLOW_RESOLVER.address, EMPLOYER, PREMIFLOW_RESOLVER.address),
    "Resolver must be different from the freelancer."
  );
  assert.equal(
    validateParties(
      PREMIFLOW_RESOLVER.address,
      FREELANCER.toBase58(),
      PREMIFLOW_RESOLVER.address.toBase58()
    ).resolver,
    "Resolver must be different from the employer."
  );
});

test("review labels stay human-readable while addresses stay configured", () => {
  const draft = defaultCreateDraft();
  assert.equal(paymentTokenLabel(draft.mint), "PREMIFLOW Test Token");
  assert.equal(resolverLabel(draft.resolver), "PREMIFLOW Resolver");
  assert.equal(draft.mint, "9JTBN7QLcoam7LkN44YDhtMQsYt4zKLW7KUE4FscgZtx");
  assert.equal(draft.resolver, "BiSDjVKLTHm4nLVCtpaibahpoqF4nXLsZ8iBBUr3nKaF");
});

test("valid draft using configured token and resolver does not require typed keys", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
  const draft = defaultCreateDraft();
  draft.freelancer = FREELANCER.toBase58();
  draft.totalAmountUi = "10";
  draft.title = "Landing page";
  draft.description = "Ship the page";
  draft.deliverables = "Figma + code";
  draft.acceptanceDeadlineLocal = future;
  draft.durationSeconds = 3600;
  draft.reviewDuration = 600;
  const errors = validateCreateDraft(EMPLOYER, draft, Math.floor(Date.now() / 1000));
  assert.equal(errors.mint, undefined);
  assert.equal(errors.resolver, undefined);
  assert.deepEqual(errors, {});
});
