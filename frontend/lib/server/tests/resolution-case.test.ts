import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import { PREMIFLOW_RESOLVER } from "@/lib/app/premiflow";
import { suggestedAwardFromCategory } from "@/lib/app/resolution-center";
import { isAuthorizedMessageWallet } from "../messages/authorize";
import {
  createOrRecoverResolutionCase,
  getResolutionCase,
  updateCaseNotes,
  upsertOwnStatement,
  CaseAccessError,
  CaseStateError,
  CaseValidationError,
  categoryDeterminesAward,
  caseExistsWithoutStatements,
  PARTY_STATEMENT_MAX,
} from "../cases/service";
import { isAuthorizedCaseResolverWallet } from "../cases/authorize";
import { createMemoryCaseStore } from "../memory-stores";
import {
  decodeContractCaseFacts,
  encodeContractCaseAccount,
  type ContractCaseFacts,
  type ContractFactsReader,
} from "../solana/read-contract-case-facts";
import { CANONICAL_PROGRAM_ID } from "@/lib/streampay-v2/constants";
import { WALLET_A, WALLET_B, WALLET_C, RESOLVER } from "@/lib/streampay-v2/tests/fixtures";

const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const UNRELATED = WALLET_C.toBase58();
const RESOLVER_WALLET = PREMIFLOW_RESOLVER.address.toBase58();

function facts(overrides: Partial<ContractCaseFacts> = {}): ContractCaseFacts {
  return {
    employer: EMPLOYER,
    freelancer: FREELANCER,
    resolver: RESOLVER_WALLET,
    status: "Disputed",
    paymentMode: "Fixed",
    disputeInitiator: "Employer",
    disputedAt: 1_700_000_100,
    terminatedAt: 0,
    contestedAmount: "90",
    freelancerSettlementAmount: "0",
    employerRefundableAmount: "0",
    releasedAmount: "10",
    withdrawnAmount: "0",
    refundedAmount: "0",
    ...overrides,
  };
}

function readerOf(value: ContractCaseFacts | ((address: string) => ContractCaseFacts)): ContractFactsReader {
  return {
    async read(contractAddress) {
      return typeof value === "function" ? value(contractAddress) : value;
    },
  };
}

function store() {
  return { cases: createMemoryCaseStore() };
}

test("employer can create/recover a case for an own Disputed contract", async () => {
  const db = store();
  const created = await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    category: "scope",
    description: "Milestone 2 was not in the original brief.",
  });
  assert.equal(created.viewerRole, "employer");
  assert.equal(created.contractAddress, CONTRACT);
  assert.equal(created.chainStatus, "Disputed");
  assert.equal(created.disputeCategory, "scope");
  assert.equal(created.disputeDescription, "Milestone 2 was not in the original brief.");
  assert.equal(created.contestedAmount, "90");
  assert.equal(created.resolverWallet, RESOLVER_WALLET);
  assert.equal(created.disputeOpener, "Employer");
});

test("freelancer can access the same recovered case", async () => {
  const db = store();
  const created = await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
  });
  const viewed = await getResolutionCase(db.cases, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
  });
  assert.equal(viewed.id, created.id);
  assert.equal(viewed.viewerRole, "freelancer");
});

test("unrelated wallet is rejected", async () => {
  const db = store();
  await assert.rejects(
    () =>
      createOrRecoverResolutionCase(db, readerOf(facts()), {
        contractAddress: CONTRACT,
        sessionWallet: UNRELATED,
      }),
    CaseAccessError
  );
});

test("fake wallet, role, resolver, and contested amount in JSON are ignored", async () => {
  const db = store();
  const created = await createOrRecoverResolutionCase(db, readerOf(facts({ contestedAmount: "555" })), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    wallet: UNRELATED,
    partyRole: "freelancer",
    resolverWallet: UNRELATED,
    contestedAmount: "1",
    disputeOpener: "Freelancer",
    freelancerContestedAward: "999",
  });
  assert.equal(created.viewerRole, "employer");
  assert.equal(created.resolverWallet, RESOLVER_WALLET);
  assert.equal(created.contestedAmount, "555");
  assert.equal(created.disputeOpener, "Employer");
  assert.notEqual(created.contestedAmount, "1");
});

test("resolver cannot use the private message API", () => {
  const parties = { employer: EMPLOYER, freelancer: FREELANCER };
  assert.equal(isAuthorizedMessageWallet(RESOLVER_WALLET, parties), false);
  const authorize = readFileSync(new URL("../messages/authorize.ts", import.meta.url), "utf8");
  assert.match(authorize, /wallet === parties\.employer \|\| wallet === parties\.freelancer/);
  assert.doesNotMatch(authorize, /resolver/);
  const guard = readFileSync(new URL("../api-guard.ts", import.meta.url), "utf8");
  const start = guard.indexOf("export async function requireMessageParticipant");
  const end = guard.indexOf("export async function requireCaseParty");
  const messageFn = guard.slice(start, end);
  assert.match(messageFn, /isAuthorizedMessageWallet\(session\.walletAddress, parties\)/);
  assert.doesNotMatch(messageFn, /resolver/);
});

test("duplicate recovery returns the same case and does not overwrite notes", async () => {
  const db = store();
  const first = await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    category: "payment",
    description: "Original description",
  });
  const second = await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    category: "other",
    description: "Should not overwrite",
  });
  assert.equal(second.id, first.id);
  assert.equal(second.disputeCategory, "payment");
  assert.equal(second.disputeDescription, "Original description");
});

test("a case cannot be created for a non-disputed chain state", async () => {
  const db = store();
  await assert.rejects(
    () =>
      createOrRecoverResolutionCase(db, readerOf(facts({ status: "Active" })), {
        contractAddress: CONTRACT,
        sessionWallet: EMPLOYER,
      }),
    (err) => err instanceof CaseStateError && err.code === "not_disputed"
  );
  await assert.rejects(
    () =>
      createOrRecoverResolutionCase(db, readerOf(facts({ status: "Cancelled" })), {
        contractAddress: CONTRACT,
        sessionWallet: EMPLOYER,
      }),
    (err) => err instanceof CaseStateError && err.code === "not_disputed"
  );
});

test("a Resolved contract can recover a historical case", async () => {
  const db = store();
  const recovered = await createOrRecoverResolutionCase(
    db,
    readerOf(
      facts({
        status: "Resolved",
        terminatedAt: 1_700_000_800,
        freelancerSettlementAmount: "40",
        employerRefundableAmount: "50",
      })
    ),
    { contractAddress: CONTRACT, sessionWallet: FREELANCER }
  );
  assert.equal(recovered.chainStatus, "Resolved");
  assert.equal(recovered.display.resolvedFromChain, true);
  assert.ok(recovered.resolvedAt);
});

test("contested amount, resolver, and initiator come from chain", async () => {
  const db = store();
  const created = await createOrRecoverResolutionCase(
    db,
    readerOf(
      facts({
        contestedAmount: "12345",
        resolver: RESOLVER.toBase58(),
        disputeInitiator: "Freelancer",
      })
    ),
    {
      contractAddress: CONTRACT,
      sessionWallet: EMPLOYER,
      contestedAmount: "0",
      resolverWallet: UNRELATED,
      disputeOpener: "Employer",
    }
  );
  assert.equal(created.contestedAmount, "12345");
  assert.equal(created.resolverWallet, RESOLVER.toBase58());
  assert.equal(created.disputeOpener, "Freelancer");
});

test("employer can create and update only their own statement", async () => {
  const db = store();
  await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
  });
  const written = await upsertOwnStatement(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    body: "Employer position",
    partyWallet: FREELANCER,
    partyRole: "freelancer",
  });
  assert.equal(written.employerStatement?.body, "Employer position");
  assert.equal(written.freelancerStatement, null);
  const updated = await upsertOwnStatement(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    body: "Employer position revised",
  });
  assert.equal(updated.employerStatement?.body, "Employer position revised");
});

test("freelancer can create and update only their own statement", async () => {
  const db = store();
  await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
  });
  const written = await upsertOwnStatement(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    body: "Freelancer position",
    partyRole: "employer",
    wallet: EMPLOYER,
  });
  assert.equal(written.freelancerStatement?.body, "Freelancer position");
  assert.equal(written.employerStatement, null);
});

test("employer cannot edit the freelancer statement and freelancer cannot edit the employer statement", async () => {
  const db = store();
  await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
  });
  await upsertOwnStatement(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    body: "Employer only",
  });
  await upsertOwnStatement(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    body: "Freelancer only",
  });
  const afterEmployer = await upsertOwnStatement(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    body: "Employer still only",
    targetWallet: FREELANCER,
    partyRole: "freelancer",
  });
  assert.equal(afterEmployer.freelancerStatement?.body, "Freelancer only");
  assert.equal(afterEmployer.employerStatement?.body, "Employer still only");
});

test("unrelated wallet cannot read statements", async () => {
  const db = store();
  await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
  });
  await assert.rejects(
    () =>
      getResolutionCase(db.cases, readerOf(facts()), {
        contractAddress: CONTRACT,
        sessionWallet: UNRELATED,
      }),
    CaseAccessError
  );
});

test("missing statement does not block case existence", async () => {
  const db = store();
  const created = await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
  });
  const statements = await db.cases.listStatements(created.id);
  assert.equal(caseExistsWithoutStatements(await db.cases.getCaseById(created.id), statements), true);
  assert.equal(created.employerStatement, null);
  assert.equal(created.freelancerStatement, null);
});

test("resolver cannot write a party statement", async () => {
  const db = store();
  await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
  });
  await assert.rejects(
    () =>
      upsertOwnStatement(db, readerOf(facts()), {
        contractAddress: CONTRACT,
        sessionWallet: RESOLVER_WALLET,
        body: "Resolver should not write this",
      }),
    CaseAccessError
  );
  assert.equal(isAuthorizedCaseResolverWallet(RESOLVER_WALLET, facts()), true);
});

test("category and description persist and do not determine settlement award", async () => {
  const db = store();
  const created = await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    category: "work_quality",
    description: "Revisions were requested twice.",
  });
  const patched = await updateCaseNotes(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    category: "deadline_abandonment",
    description: "Updated context from the other party.",
  });
  assert.equal(created.disputeCategory, "work_quality");
  assert.equal(patched.disputeCategory, "deadline_abandonment");
  assert.equal(patched.disputeDescription, "Updated context from the other party.");
  assert.equal(categoryDeterminesAward(), false);
  assert.equal(suggestedAwardFromCategory("work_quality"), null);
  assert.equal(suggestedAwardFromCategory(patched.disputeCategory), null);
});

test("paid-trial reject_activation Disputed path can recover without open_dispute arguments", async () => {
  const db = store();
  const trialFacts = facts({
    status: "Disputed",
    disputeInitiator: "Employer",
    terminatedAt: 1_700_000_400,
    contestedAmount: "110",
    paymentMode: "Fixed",
  });
  const recovered = await createOrRecoverResolutionCase(db, readerOf(trialFacts), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
  });
  assert.equal(recovered.chainStatus, "Disputed");
  assert.equal(recovered.terminatedAt, 1_700_000_400);
  assert.equal(recovered.contestedAmount, "110");
  assert.equal(recovered.disputeOpener, "Employer");
});

test("Hourly case uses confirmed post-freeze facts, not a pre-sign projection", async () => {
  const db = store();
  const created = await createOrRecoverResolutionCase(
    db,
    readerOf(
      facts({
        paymentMode: "Hourly",
        contestedAmount: "777",
        releasedAmount: "200",
      })
    ),
    {
      contractAddress: CONTRACT,
      sessionWallet: FREELANCER,
      contestedAmount: "12",
    }
  );
  assert.equal(created.paymentMode, "Hourly");
  assert.equal(created.contestedAmount, "777");
  assert.equal(created.releasedAmount, "200");
});

test("Streaming case uses confirmed post-freeze facts, not a pre-sign projection", async () => {
  const db = store();
  const created = await createOrRecoverResolutionCase(
    db,
    readerOf(
      facts({
        paymentMode: "Streaming",
        contestedAmount: "333",
        releasedAmount: "50",
      })
    ),
    {
      contractAddress: CONTRACT,
      sessionWallet: EMPLOYER,
      contestedAmount: "999999",
    }
  );
  assert.equal(created.paymentMode, "Streaming");
  assert.equal(created.contestedAmount, "333");
});

test("chain reconciliation updates financial cache but not user notes or statements", async () => {
  const db = store();
  await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    category: "scope",
    description: "Keep this",
  });
  await upsertOwnStatement(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    body: "Keep statement",
  });
  const reconciled = await getResolutionCase(
    db.cases,
    readerOf(
      facts({
        contestedAmount: "80",
        resolver: RESOLVER.toBase58(),
        disputeInitiator: "Freelancer",
        status: "Resolved",
        terminatedAt: 1_700_001_000,
        withdrawnAmount: "10",
        freelancerSettlementAmount: "30",
        employerRefundableAmount: "50",
      })
    ),
    { contractAddress: CONTRACT, sessionWallet: EMPLOYER }
  );
  assert.equal(reconciled.contestedAmount, "80");
  assert.equal(reconciled.resolverWallet, RESOLVER.toBase58());
  assert.equal(reconciled.disputeOpener, "Freelancer");
  assert.equal(reconciled.chainStatus, "Resolved");
  assert.equal(reconciled.disputeCategory, "scope");
  assert.equal(reconciled.disputeDescription, "Keep this");
  assert.equal(reconciled.employerStatement?.body, "Keep statement");
  assert.equal(reconciled.payoutState, "partially_claimed");
  assert.match(reconciled.display.chainStatus, /Resolved/);
  assert.doesNotMatch(
    `${reconciled.display.chainStatus} ${reconciled.workflowStatus}`,
    /\bPaid\b/
  );
});

test("statement body is validated server-side", async () => {
  const db = store();
  await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
  });
  await assert.rejects(
    () =>
      upsertOwnStatement(db, readerOf(facts()), {
        contractAddress: CONTRACT,
        sessionWallet: EMPLOYER,
        body: "   ",
      }),
    CaseValidationError
  );
  await assert.rejects(
    () =>
      upsertOwnStatement(db, readerOf(facts()), {
        contractAddress: CONTRACT,
        sessionWallet: EMPLOYER,
        body: "x".repeat(PARTY_STATEMENT_MAX + 1),
      }),
    CaseValidationError
  );
});

test("both statements move workflow to ready_for_resolver without blocking resolve", async () => {
  const db = store();
  const created = await createOrRecoverResolutionCase(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
  });
  assert.equal(created.workflowStatus, "awaiting_statements");
  await upsertOwnStatement(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: EMPLOYER,
    body: "Employer",
  });
  const both = await upsertOwnStatement(db, readerOf(facts()), {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    body: "Freelancer",
  });
  assert.equal(both.workflowStatus, "ready_for_resolver");
  assert.equal(both.chainStatus, "Disputed");
});

test("raw contract account decoding reads post-freeze Hourly and Streaming amounts", () => {
  const hourly = encodeContractCaseAccount({
    employer: WALLET_A,
    freelancer: WALLET_B,
    resolver: PREMIFLOW_RESOLVER.address,
    status: "Disputed",
    paymentMode: "Hourly",
    disputeInitiator: "Freelancer",
    disputedAt: 50,
    contestedAmount: 888n,
    releasedAmount: 112n,
  });
  const decodedHourly = decodeContractCaseFacts(hourly);
  assert.equal(decodedHourly.paymentMode, "Hourly");
  assert.equal(decodedHourly.contestedAmount, "888");
  assert.equal(decodedHourly.releasedAmount, "112");
  assert.equal(decodedHourly.resolver, RESOLVER_WALLET);

  const streaming = encodeContractCaseAccount({
    employer: WALLET_A,
    freelancer: WALLET_B,
    resolver: PREMIFLOW_RESOLVER.address,
    status: "Disputed",
    paymentMode: "Streaming",
    disputeInitiator: "Employer",
    contestedAmount: 444n,
    terminatedAt: 90,
  });
  const decodedStreaming = decodeContractCaseFacts(streaming);
  assert.equal(decodedStreaming.paymentMode, "Streaming");
  assert.equal(decodedStreaming.contestedAmount, "444");
  assert.equal(decodedStreaming.terminatedAt, 90);
  assert.equal(hourly.owner, CANONICAL_PROGRAM_ID);
});

test("case routes do not query contract_messages and message participant checks stay party-only", () => {
  const caseRoute = readFileSync(
    new URL("../../../app/api/contracts/[address]/case/route.ts", import.meta.url),
    "utf8"
  );
  const statementRoute = readFileSync(
    new URL("../../../app/api/contracts/[address]/case/statement/route.ts", import.meta.url),
    "utf8"
  );
  const messagesRoute = readFileSync(
    new URL("../../../app/api/contracts/[address]/messages/route.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(caseRoute, /contract_messages|listContractMessages|requireMessageParticipant/);
  assert.doesNotMatch(statementRoute, /contract_messages|listContractMessages/);
  assert.match(messagesRoute, /requireMessageParticipant/);
  assert.doesNotMatch(messagesRoute, /requireCaseParty/);
});
