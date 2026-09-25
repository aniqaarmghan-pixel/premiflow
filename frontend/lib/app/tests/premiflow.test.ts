import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";

import {
  assertResolverDistinct,
  defaultPaymentToken,
  defaultResolver,
  findPaymentToken,
  findResolver,
  lockedCreatePayment,
  parseTrustedCreatePubkey,
  paymentTokenLabel,
  PREMIFLOW_RESOLVER,
  PREMIFLOW_TEST_TOKEN,
  resolverLabel,
} from "../premiflow";
import {
  applyCreateDraftPatch,
  defaultCreateDraft,
  validateCreateDraft,
  validateParties,
  type CreateWizardDraft,
} from "../validation";
import { toCreateContractArgs } from "../../streampay-v2/instructions";
import { STREAMPAY_PROGRAM_ID } from "../../streampay-v2/constants";
import type { CreateContractRequest } from "../../streampay-v2/types";
import {
  MINT as HISTORICAL_MINT,
  RESOLVER as HISTORICAL_RESOLVER,
  makeContract,
  WALLET_A,
  WALLET_B,
} from "../../streampay-v2/tests/fixtures";

const EMPLOYER = WALLET_A;
const FREELANCER = WALLET_B;

function futureAcceptance(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
}

function validDraft(overrides: Partial<CreateWizardDraft> = {}): CreateWizardDraft {
  const draft = defaultCreateDraft();
  draft.freelancer = FREELANCER.toBase58();
  draft.totalAmountUi = "10";
  draft.title = "Landing page";
  draft.description = "Ship the page";
  draft.deliverables = "Figma + code";
  draft.acceptanceDeadlineLocal = futureAcceptance();
  draft.durationSeconds = 3600;
  draft.reviewDuration = 600;
  return { ...draft, ...overrides };
}

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

test("createContract still receives the configured mint and resolver", () => {
  const payment = lockedCreatePayment();
  const poisoned = defaultCreateDraft();
  poisoned.mint = WALLET_A.toBase58();
  poisoned.resolver = WALLET_B.toBase58();
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
    resolver: payment.resolver.address,
    metadataUri: "memory:review",
    metadataHash: new Uint8Array(32),
  };
  const args = toCreateContractArgs(request);
  assert.equal(payment.mint.toBase58(), PREMIFLOW_TEST_TOKEN.mint.toBase58());
  assert.equal(args.resolver.toBase58(), PREMIFLOW_RESOLVER.address.toBase58());
  assert.notEqual(payment.mint.toBase58(), poisoned.mint);
  assert.notEqual(payment.resolver.address.toBase58(), poisoned.resolver);
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
  const errors = validateCreateDraft(EMPLOYER, validDraft(), Math.floor(Date.now() / 1000));
  assert.equal(errors.mint, undefined);
  assert.equal(errors.resolver, undefined);
  assert.deepEqual(errors, {});
});

test("normal Create UI has no editable mint or resolver account fields", () => {
  const wizard = readFileSync(
    new URL("../../../components/create/CreateWizard.tsx", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(wizard, /Mint Account/);
  assert.doesNotMatch(wizard, /Resolver Account/);
  assert.doesNotMatch(wizard, /patch\(\{\s*mint:/);
  assert.doesNotMatch(wizard, /patch\(\{\s*resolver:/);
  assert.doesNotMatch(wizard, /parsePubkey\(draft\.mint/);
  assert.doesNotMatch(wizard, /parsePubkey\(draft\.resolver/);
  assert.doesNotMatch(wizard, /placeholder="Mint/);
  assert.doesNotMatch(wizard, /placeholder="Resolver/);
  assert.match(wizard, /lockedCreatePayment\(\)/);
  assert.match(wizard, /tokenMint: payment.mint/);
  assert.match(wizard, /resolver: payment.resolver.address/);
  // Condensed Review shows read-only mint/resolver under Advanced settings (not editable inputs).
  assert.match(wizard, /Advanced settings/);
  assert.match(wizard, /<Address value=\{draft\.mint\}/);
  assert.match(wizard, /<Address value=\{draft\.resolver\}/);
  assert.doesNotMatch(
    wizard.slice(wizard.indexOf("function ReviewPanel"), wizard.length),
    /<Input[^>]*(mint|resolver)|onChange=\{[^}]*mint|onChange=\{[^}]*resolver/i
  );
});

test("form state cannot override the configured mint or resolver", () => {
  const next = applyCreateDraftPatch(defaultCreateDraft(), {
    mint: WALLET_A.toBase58(),
    resolver: WALLET_B.toBase58(),
    decimals: 0,
    title: "Kept",
  });
  assert.equal(next.mint, PREMIFLOW_TEST_TOKEN.mint.toBase58());
  assert.equal(next.resolver, PREMIFLOW_RESOLVER.address.toBase58());
  assert.equal(next.decimals, 6);
  assert.equal(next.title, "Kept");

  const poisoned = validDraft({
    mint: WALLET_A.toBase58(),
    resolver: WALLET_B.toBase58(),
    decimals: 0,
  });
  const errors = validateCreateDraft(EMPLOYER, poisoned, Math.floor(Date.now() / 1000));
  assert.match(errors.mint ?? "", /cannot be changed/i);
  assert.match(errors.resolver ?? "", /cannot be changed/i);
});

test("missing or invalid configured mint and resolver fail safely", () => {
  assert.throws(() => defaultPaymentToken([]), /not configured/);
  assert.throws(() => defaultResolver([]), /not configured/);
  assert.throws(() => parseTrustedCreatePubkey("", "Mint"), /not configured/);
  assert.throws(() => parseTrustedCreatePubkey("   ", "Resolver"), /not configured/);
  assert.throws(() => parseTrustedCreatePubkey("not-a-key", "Mint"), /not a valid Solana public key/);
  assert.throws(
    () => parseTrustedCreatePubkey(PublicKey.default.toBase58(), "Mint"),
    /placeholder/
  );
  assert.throws(
    () => parseTrustedCreatePubkey(SystemProgram.programId.toBase58(), "Resolver"),
    /placeholder/
  );
  assert.throws(
    () => parseTrustedCreatePubkey(TOKEN_PROGRAM_ID.toBase58(), "Mint"),
    /placeholder/
  );
  assert.throws(
    () => parseTrustedCreatePubkey(STREAMPAY_PROGRAM_ID.toBase58(), "Mint"),
    /placeholder/
  );
});

test("existing contracts keep their on-chain mint and resolver", () => {
  const historical = makeContract({
    tokenMint: HISTORICAL_MINT,
    resolver: HISTORICAL_RESOLVER,
  });
  assert.notEqual(historical.tokenMint.toBase58(), PREMIFLOW_TEST_TOKEN.mint.toBase58());
  assert.notEqual(historical.resolver.toBase58(), PREMIFLOW_RESOLVER.address.toBase58());
  assert.equal(historical.tokenMint.toBase58(), HISTORICAL_MINT.toBase58());
  assert.equal(historical.resolver.toBase58(), HISTORICAL_RESOLVER.toBase58());
  assert.equal(paymentTokenLabel(historical.tokenMint), HISTORICAL_MINT.toBase58());
  assert.equal(resolverLabel(historical.resolver), HISTORICAL_RESOLVER.toBase58());

  const detail = readFileSync(
    new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
    "utf8"
  );
  assert.match(detail, /contract\.tokenMint/);
  assert.match(detail, /contract\.resolver/);
  assert.doesNotMatch(detail, /PREMIFLOW_TEST_TOKEN/);
  assert.doesNotMatch(detail, /lockedCreatePayment/);
});

test("Fixed, Milestone, and Trial creation still validate with locked payment config", () => {
  const now = Math.floor(Date.now() / 1000);
  const fixed = validateCreateDraft(EMPLOYER, validDraft({ paymentMode: "Fixed" }), now);
  assert.deepEqual(fixed, {});

  const milestone = validateCreateDraft(
    EMPLOYER,
    validDraft({
      paymentMode: "Milestone",
      milestones: [{ label: "Ship", amountUi: "10", dueOffsetSeconds: 1800 }],
    }),
    now
  );
  assert.deepEqual(milestone, {});

  const trial = validateCreateDraft(
    EMPLOYER,
    validDraft({ trialEnabled: true, trialAmountUi: "1" }),
    now
  );
  assert.deepEqual(trial, {});

  const streaming = validateCreateDraft(
    EMPLOYER,
    validDraft({
      paymentMode: "Streaming",
      checkpointInterval: 1800,
    }),
    now
  );
  assert.deepEqual(streaming, {});
});
