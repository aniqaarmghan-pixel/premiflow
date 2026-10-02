import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createMemoryCaseStore } from "@/lib/server/memory-stores";
import type { EvidenceSnapshotRecord } from "@/lib/server/stores";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("evidence snapshot memory persistence is immutable and duplicate-safe", async () => {
  const store = createMemoryCaseStore();

  const original: EvidenceSnapshotRecord = {
    id: "11111111-1111-4111-8111-111111111111",
    caseId: "22222222-2222-4222-8222-222222222222",
    contractAddress: "Contract111111111111111111111111111111111",
    messageId: "33333333-3333-4333-8333-333333333333",
    submittedBy: "Submitter11111111111111111111111111111111",
    submittedByRole: "employer",
    senderWalletSnapshot: "Sender111111111111111111111111111111111",
    bodySnapshot: "Original immutable message text",
    createdAtSnapshot: new Date("2026-10-02T12:00:00.000Z"),
    submittedAt: new Date("2026-10-02T12:01:00.000Z"),
  };

  const saved = await store.insertEvidence(original);

  original.bodySnapshot = "caller mutated its own object";
  saved.bodySnapshot = "caller mutated returned object";

  const loaded = await store.getEvidenceByMessage(
    original.caseId,
    original.messageId
  );

  assert.equal(
    loaded?.bodySnapshot,
    "Original immutable message text"
  );

  const list = await store.listEvidence(original.caseId);
  assert.equal(list.length, 1);
  assert.equal(list[0].messageId, original.messageId);

  await assert.rejects(
    () =>
      store.insertEvidence({
        ...original,
        id: "44444444-4444-4444-8444-444444444444",
        bodySnapshot: "duplicate attempt",
      }),
    (err: unknown) =>
      err instanceof Error &&
      (err as Error & { code?: string }).code === "23505"
  );
});

test("evidence API is party-write-only and does not grant resolver chat access", () => {
  const route = read(
    "app/api/contracts/[address]/case/evidence/route.ts"
  );
  const service = read("lib/server/cases/service.ts");
  const messagesRoute = read(
    "app/api/contracts/[address]/messages/route.ts"
  );

  assert.match(route, /requireCaseParty/);
  assert.match(route, /requireMutatingOrigin/);
  assert.match(route, /addMessageEvidence/);

  assert.doesNotMatch(route, /requireCaseViewer/);

  assert.match(service, /getMessage\(messageId\)/);
  assert.match(
    service,
    /message\.contractAddress !== contractAddress/
  );
  assert.match(service, /senderWalletSnapshot: message\.senderWallet/);
  assert.match(service, /bodySnapshot: message\.body/);
  assert.match(service, /createdAtSnapshot: message\.createdAt/);
  assert.match(service, /CASE_EVENT_TYPES\.evidenceAdded/);

  // Existing private message route remains participant-authorized.
  assert.match(
    messagesRoute,
    /requireAccountContractParticipant/
  );
});

test("database migration stores snapshots rather than live-thread permissions", () => {
  const sql = read("drizzle/0007_case_evidence_snapshots.sql");
  const schema = read("lib/server/db/schema.ts");

  assert.match(sql, /case_evidence_snapshots/);
  assert.match(sql, /body_snapshot/);
  assert.match(sql, /sender_wallet_snapshot/);
  assert.match(sql, /created_at_snapshot/);
  assert.match(sql, /case_evidence_case_message_uidx/);

  assert.doesNotMatch(
    sql,
    /FOREIGN KEY \("message_id"\).*contract_messages/is
  );

  assert.match(schema, /caseEvidenceSnapshots/);
});

test("chat and Resolution Center expose selected-snapshot UX only", () => {
  const messages = read(
    "components/contracts/ContractMessages.tsx"
  );
  const chat = read(
    "components/contracts/ContractChatDialog.tsx"
  );
  const center = read(
    "components/contracts/ResolutionCenter.tsx"
  );
  const plan = read("lib/app/contract-messages.ts");

  assert.match(messages, /addMessageToResolutionEvidence/);
  assert.match(chat, /Add to dispute evidence/);
  assert.match(chat, /Added to dispute evidence/);

  assert.match(center, /Submitted message snapshots/);
  assert.match(
    center,
    /Immutable case copy — not live chat access/
  );

  assert.match(plan, /connected: true/);
  assert.match(plan, /disclosesEntireThread: false/);
  assert.match(plan, /automaticResolverAccess: false/);
});
