import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";

import {
  OVERVIEW_DASHBOARD_HREFS,
  buildContractsListHref,
  contractsListEmptyCopy,
  filterContractsByListQuery,
  parseContractsListQuery,
  type ContractsListQuery,
} from "../contracts-list-query";
import { groupContractsByRole } from "../view-model";
import { makeContract } from "../../streampay-v2/tests/fixtures";

const EMPLOYER = new PublicKey("AXMM3XNF2jpN1WizwF1CaT22V5BFugCokhB2bojKdAoD");
const FREELANCER = new PublicKey("8xgEBF59YbwLrGnWb5HKZCk9JbWyVnuGZmZZkV3bKUQX");
const OTHER = new PublicKey("11111111111111111111111111111112");

function params(qs: string): URLSearchParams {
  return new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
}

test("overview dashboard hrefs match required destinations", () => {
  assert.equal(
    OVERVIEW_DASHBOARD_HREFS.activeContracts,
    "/contracts?status=active"
  );
  assert.equal(
    OVERVIEW_DASHBOARD_HREFS.pendingReviews,
    "/contracts?status=review"
  );
  assert.equal(
    OVERVIEW_DASHBOARD_HREFS.liveStreams,
    "/contracts?type=streaming&status=active"
  );
  assert.equal(OVERVIEW_DASHBOARD_HREFS.allContracts, "/contracts");
  assert.equal(
    OVERVIEW_DASHBOARD_HREFS.availableToWithdraw,
    "/contracts?claim=withdraw"
  );
  assert.equal(
    OVERVIEW_DASHBOARD_HREFS.availableRefund,
    "/contracts?claim=refund"
  );
});

test("parseContractsListQuery covers every overview navigation target", () => {
  assert.deepEqual(parseContractsListQuery(params("")), {
    role: "all",
    status: "all",
    type: "all",
    claim: "none",
  });
  assert.equal(
    parseContractsListQuery(params("status=active")).status,
    "Active"
  );
  assert.equal(
    parseContractsListQuery(params("status=review")).status,
    "review"
  );
  assert.deepEqual(
    parseContractsListQuery(params("type=streaming&status=active")),
    {
      role: "all",
      status: "Active",
      type: "Streaming",
      claim: "none",
    }
  );
  assert.equal(
    parseContractsListQuery(params("claim=withdraw")).claim,
    "withdraw"
  );
  assert.equal(parseContractsListQuery(params("claim=refund")).claim, "refund");
  assert.equal(parseContractsListQuery(params("role=hiring")).role, "hiring");
  assert.equal(parseContractsListQuery(params("role=working")).role, "working");
});

test("buildContractsListHref round-trips overview targets", () => {
  assert.equal(buildContractsListHref({}), "/contracts");
  assert.equal(
    buildContractsListHref({ status: "Active" }),
    "/contracts?status=active"
  );
  assert.equal(
    buildContractsListHref({ status: "review" }),
    "/contracts?status=review"
  );
  assert.equal(
    buildContractsListHref({ type: "Streaming", status: "Active" }),
    "/contracts?type=streaming&status=active"
  );
  assert.equal(
    buildContractsListHref({ claim: "withdraw" }),
    "/contracts?claim=withdraw"
  );
  assert.equal(
    buildContractsListHref({ claim: "refund" }),
    "/contracts?claim=refund"
  );
  assert.equal(
    buildContractsListHref({ role: "hiring" }),
    "/contracts?role=hiring"
  );

  for (const href of Object.values(OVERVIEW_DASHBOARD_HREFS)) {
    const q = parseContractsListQuery(params(href.replace("/contracts", "")));
    assert.equal(buildContractsListHref(q), href);
  }
});

test("filterContractsByListQuery applies status, review, type, and claim", () => {
  const activeFixed = makeContract({
    employer: EMPLOYER,
    freelancer: FREELANCER,
    status: "Active",
    paymentMode: "Fixed",
    address: OTHER,
    contractId: 1n,
    openReviewCount: 0,
    releasedAmount: 0n,
    withdrawnAmount: 0n,
  });
  const activeStream = makeContract({
    employer: EMPLOYER,
    freelancer: FREELANCER,
    status: "Active",
    paymentMode: "Streaming",
    address: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    contractId: 2n,
    openReviewCount: 1,
    releasedAmount: 50n,
    withdrawnAmount: 10n,
    totalAmount: 100n,
  });
  const rejected = makeContract({
    employer: EMPLOYER,
    freelancer: FREELANCER,
    status: "ActivationRejected",
    paymentMode: "Fixed",
    address: new PublicKey("So11111111111111111111111111111111111111112"),
    contractId: 3n,
    employerRefundableAmount: 100n,
    refundedAmount: 0n,
    totalAmount: 100n,
  });
  const grouped = groupContractsByRole(EMPLOYER, [
    activeFixed,
    activeStream,
    rejected,
  ]);

  const active = filterContractsByListQuery(grouped, {
    ...parseContractsListQuery(params("status=active")),
  });
  assert.equal(active.length, 2);

  const review = filterContractsByListQuery(grouped, {
    ...parseContractsListQuery(params("status=review")),
  });
  assert.equal(review.length, 1);
  assert.equal(review[0]?.paymentMode, "Streaming");

  const live = filterContractsByListQuery(
    grouped,
    parseContractsListQuery(params("type=streaming&status=active"))
  );
  assert.equal(live.length, 1);
  assert.equal(live[0]?.paymentMode, "Streaming");

  const refund = filterContractsByListQuery(
    grouped,
    parseContractsListQuery(params("claim=refund"))
  );
  assert.equal(refund.length, 1);
  assert.equal(refund[0]?.status, "ActivationRejected");

  const withdrawGrouped = groupContractsByRole(FREELANCER, [
    activeFixed,
    activeStream,
    rejected,
  ]);
  const withdraw = filterContractsByListQuery(
    withdrawGrouped,
    parseContractsListQuery(params("claim=withdraw"))
  );
  assert.equal(withdraw.length, 1);
  assert.equal(withdraw[0]?.paymentMode, "Streaming");

  const empty = filterContractsByListQuery(grouped, {
    role: "all",
    status: "Completed",
    type: "all",
    claim: "none",
  } satisfies ContractsListQuery);
  assert.equal(empty.length, 0);
  assert.equal(
    contractsListEmptyCopy({
      role: "all",
      status: "Active",
      type: "all",
      claim: "none",
    }).title,
    "No active contracts"
  );
});

test("unknown query values do not invent filters", () => {
  const q = parseContractsListQuery(
    params("status=nope&type=banana&claim=steal&role=admin")
  );
  assert.deepEqual(q, {
    role: "all",
    status: "all",
    type: "all",
    claim: "none",
  });
});

test("OverviewPage wires every dashboard card to OVERVIEW_DASHBOARD_HREFS", () => {
  const source = readFileSync(
    new URL("../../../components/overview/OverviewPage.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /href=\{OVERVIEW_DASHBOARD_HREFS\.availableToWithdraw\}/);
  assert.match(source, /href=\{OVERVIEW_DASHBOARD_HREFS\.availableRefund\}/);
  assert.match(source, /href=\{OVERVIEW_DASHBOARD_HREFS\.activeContracts\}/);
  assert.match(source, /href=\{OVERVIEW_DASHBOARD_HREFS\.pendingReviews\}/);
  assert.match(source, /href=\{OVERVIEW_DASHBOARD_HREFS\.liveStreams\}/);
  assert.match(source, /href=\{OVERVIEW_DASHBOARD_HREFS\.allContracts\}/);
  assert.match(source, /aria-label=\{`\$\{label\}: \$\{value\}/);
});

test("ContractsPage reads URL query via parseContractsListQuery", () => {
  const source = readFileSync(
    new URL("../../../components/contracts/ContractsPage.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /parseContractsListQuery/);
  assert.match(source, /filterContractsByListQuery/);
  assert.match(source, /buildContractsListHref/);
  assert.match(source, /useSearchParams/);
  assert.match(source, /router\.replace/);
});
