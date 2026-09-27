import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PublicKey } from "@solana/web3.js";

import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";
import {
  createMemoryNotificationStore,
  createMemoryRateLimitStore,
  createMemorySubmissionStore,
} from "../memory-stores";
import {
  REVISED_WORK_SUBMITTED_BODY,
  REVISED_WORK_SUBMITTED_TITLE,
  WORK_SUBMITTED_BODY,
  WORK_SUBMITTED_TITLE,
  notifyEmployerOfWorkSubmission,
  workSubmissionNotificationHref,
  workSubmissionNotificationKind,
  workSubmissionUniqueKey,
} from "../notifications/work-submitted";
import {
  listNotifications,
  unreadNotificationCount,
} from "../notifications/service";
import { persistConfirmedWorkSubmission } from "../submissions/service";
import type { NotificationStore } from "../stores";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const STRANGER = WALLET_C.toBase58();
const PARTIES = { employer: EMPLOYER, freelancer: FREELANCER };
const SIG =
  "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSVnAN";
const SIG_B =
  "2nBh18QoFJS2iJHNmKQcH8jYPvHx2nBh18QoFJS2iJHNmKQcH8jYPvHx2nBh18QoFJS2iJHNmKQcH8";

function submissionStores() {
  return {
    submissions: createMemorySubmissionStore(),
    rates: createMemoryRateLimitStore(),
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    submissionKind: "fixed",
    workUnitIndex: 0,
    revisionNumber: 0,
    deliveryNote: "Completed the landing page revision.",
    links: [{ url: "https://figma.example/file/1", label: "Figma" }],
    onChainSubmissionUri: "https://figma.example/file/1",
    transactionSignature: SIG,
    chainSubmittedAt: 1_700_000_000,
    ...overrides,
  };
}

test("workSubmissionNotificationKind distinguishes initial vs revised", () => {
  assert.equal(workSubmissionNotificationKind(0), "work_submitted");
  assert.equal(workSubmissionNotificationKind(1), "revised_work_submitted");
  assert.equal(workSubmissionNotificationKind(2), "revised_work_submitted");
});

test("A. revisionNumber = 0 → work_submitted → employer recipient", async () => {
  const notes = createMemoryNotificationStore();
  const db = submissionStores();
  const { submission, created } = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: PARTIES,
    body: validBody({ revisionNumber: 0, submissionKind: "milestone", workUnitIndex: 0 }),
  });
  assert.equal(created, true);

  const emit = await notifyEmployerOfWorkSubmission(notes, {
    contractAddress: CONTRACT,
    parties: PARTIES,
    submission,
  });
  assert.equal(emit.created, true);

  const forEmployer = await listNotifications(notes, {
    recipientWallet: EMPLOYER,
    cursor: null,
    limit: "20",
  });
  assert.equal(forEmployer.notifications.length, 1);
  const note = forEmployer.notifications[0]!;
  assert.equal(note.type, "work_submitted");
  assert.equal(note.title, WORK_SUBMITTED_TITLE);
  assert.equal(note.body, WORK_SUBMITTED_BODY);
  assert.equal(note.href, workSubmissionNotificationHref(CONTRACT));
  assert.equal(
    workSubmissionUniqueKey("work_submitted", SIG, EMPLOYER),
    `work_submitted:${SIG}:${EMPLOYER}`
  );
  assert.deepEqual(note.payload, {
    submissionId: submission.id,
    workUnitIndex: 0,
    revisionNumber: 0,
    transactionSignature: SIG,
  });

  assert.equal(
    (
      await listNotifications(notes, {
        recipientWallet: FREELANCER,
        cursor: null,
        limit: "10",
      })
    ).notifications.length,
    0
  );
  assert.equal((await unreadNotificationCount(notes, EMPLOYER)).unreadCount, 1);
});

test("B. revisionNumber >= 1 → revised_work_submitted → employer", async () => {
  const notes = createMemoryNotificationStore();
  const db = submissionStores();
  const { submission } = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: PARTIES,
    body: validBody({
      revisionNumber: 1,
      submissionKind: "fixed",
      transactionSignature: SIG_B,
    }),
  });

  const emit = await notifyEmployerOfWorkSubmission(notes, {
    contractAddress: CONTRACT,
    parties: PARTIES,
    submission,
  });
  assert.equal(emit.created, true);

  const forEmployer = await listNotifications(notes, {
    recipientWallet: EMPLOYER,
    cursor: null,
    limit: "10",
  });
  assert.equal(forEmployer.notifications.length, 1);
  assert.equal(forEmployer.notifications[0]!.type, "revised_work_submitted");
  assert.equal(forEmployer.notifications[0]!.title, REVISED_WORK_SUBMITTED_TITLE);
  assert.equal(forEmployer.notifications[0]!.body, REVISED_WORK_SUBMITTED_BODY);
  assert.equal(
    workSubmissionUniqueKey("revised_work_submitted", SIG_B, EMPLOYER),
    `revised_work_submitted:${SIG_B}:${EMPLOYER}`
  );
  assert.equal(
    (
      await listNotifications(notes, {
        recipientWallet: FREELANCER,
        cursor: null,
        limit: "10",
      })
    ).notifications.length,
    0
  );
});

test("C. trial submission → NO notification", async () => {
  const notes = createMemoryNotificationStore();
  const db = submissionStores();
  const { submission } = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: PARTIES,
    body: validBody({
      submissionKind: "trial",
      revisionNumber: 0,
      transactionSignature: SIG,
    }),
  });

  const emit = await notifyEmployerOfWorkSubmission(notes, {
    contractAddress: CONTRACT,
    parties: PARTIES,
    submission,
  });
  assert.equal(emit.created, false);
  assert.equal(emit.skipped, "trial");
  assert.equal(
    (
      await listNotifications(notes, {
        recipientWallet: EMPLOYER,
        cursor: null,
        limit: "10",
      })
    ).notifications.length,
    0
  );
});

test("D. repeated same transactionSignature → no duplicate notification", async () => {
  const notes = createMemoryNotificationStore();
  const db = submissionStores();
  const first = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: PARTIES,
    body: validBody({ revisionNumber: 0 }),
  });
  assert.equal(first.created, true);

  const emit1 = await notifyEmployerOfWorkSubmission(notes, {
    contractAddress: CONTRACT,
    parties: PARTIES,
    submission: first.submission,
  });
  assert.equal(emit1.created, true);

  const second = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: PARTIES,
    body: validBody({ revisionNumber: 0 }),
  });
  assert.equal(second.created, false);
  assert.equal(second.submission.id, first.submission.id);

  const emit2 = await notifyEmployerOfWorkSubmission(notes, {
    contractAddress: CONTRACT,
    parties: PARTIES,
    submission: second.submission,
  });
  assert.equal(emit2.created, false);

  assert.equal(
    (
      await listNotifications(notes, {
        recipientWallet: EMPLOYER,
        cursor: null,
        limit: "20",
      })
    ).notifications.length,
    1
  );
});

test("E. recipient is parties.employer — not freelancer / not client identity", async () => {
  const notes = createMemoryNotificationStore();
  const db = submissionStores();
  const { submission } = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: PARTIES,
    body: validBody({ revisionNumber: 0 }),
  });

  await notifyEmployerOfWorkSubmission(notes, {
    contractAddress: CONTRACT,
    parties: PARTIES,
    submission,
  });

  const employerInbox = await listNotifications(notes, {
    recipientWallet: EMPLOYER,
    cursor: null,
    limit: "10",
  });
  assert.equal(employerInbox.notifications.length, 1);
  assert.equal(employerInbox.notifications[0]!.type, "work_submitted");
  assert.equal(employerInbox.notifications[0]!.contractAddress, CONTRACT);

  assert.equal(
    (
      await listNotifications(notes, {
        recipientWallet: FREELANCER,
        cursor: null,
        limit: "10",
      })
    ).notifications.length,
    0
  );
  assert.equal(
    (
      await listNotifications(notes, {
        recipientWallet: STRANGER,
        cursor: null,
        limit: "10",
      })
    ).notifications.length,
    0
  );

  // Defensive skip when employer === freelancer (never trust a forged client identity).
  const selfEmit = await notifyEmployerOfWorkSubmission(notes, {
    contractAddress: CONTRACT,
    parties: { employer: EMPLOYER, freelancer: EMPLOYER },
    submission,
  });
  assert.equal(selfEmit.created, false);
  assert.equal(selfEmit.skipped, "self");
});

test("F. notification emitter throws → persistence success remains successful", async () => {
  const db = submissionStores();
  const { submission, created } = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: PARTIES,
    body: validBody({ revisionNumber: 0, transactionSignature: SIG }),
  });
  assert.equal(created, true);

  const throwingStore = {
    async insertIdempotent() {
      throw new Error("neon inbox unavailable");
    },
    async listForWallet() {
      return [];
    },
    async countUnread() {
      return 0;
    },
    async getByIdForWallet() {
      return null;
    },
    async markRead() {
      return null;
    },
    async markAllRead() {
      return 0;
    },
  } as unknown as NotificationStore;

  await assert.rejects(
    () =>
      notifyEmployerOfWorkSubmission(throwingStore, {
        contractAddress: CONTRACT,
        parties: PARTIES,
        submission,
      }),
    /neon inbox unavailable/
  );

  // History row still present and listable.
  const listed = await db.submissions.listByContract(CONTRACT);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.id, submission.id);
  assert.equal(listed[0]!.transactionSignature, SIG);
});

test("G. submissions POST route emits after persistConfirmedWorkSubmission", () => {
  const route = readFileSync(
    join(ROOT, "app/api/contracts/[address]/submissions/route.ts"),
    "utf8"
  );
  assert.match(route, /notifyEmployerOfWorkSubmission/);
  assert.match(route, /persistConfirmedWorkSubmission/);
  assert.match(route, /work submission emit failed/);

  const persistIdx = route.indexOf("await persistConfirmedWorkSubmission");
  const notifyIdx = route.indexOf("await notifyEmployerOfWorkSubmission");
  const returnIdx = route.indexOf(
    "return NextResponse.json(result, { status: result.created ? 201 : 200 })"
  );
  assert.ok(persistIdx > 0, "persist call missing");
  assert.ok(notifyIdx > persistIdx, "notify must follow persist");
  assert.ok(returnIdx > notifyIdx, "HTTP return must follow notify");

  // Best-effort isolation
  assert.match(route, /try \{\s*await notifyEmployerOfWorkSubmission/s);
  assert.match(route, /catch \(notifyErr\)/);
});

test("H. multiple work-unit indexes preserve correct payload metadata", async () => {
  const notes = createMemoryNotificationStore();
  const db = submissionStores();

  const unit0 = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: PARTIES,
    body: validBody({
      workUnitIndex: 0,
      revisionNumber: 0,
      transactionSignature: SIG,
      submissionKind: "milestone",
    }),
  });
  const unit2 = await persistConfirmedWorkSubmission(db, {
    contractAddress: CONTRACT,
    sessionWallet: FREELANCER,
    parties: PARTIES,
    body: validBody({
      workUnitIndex: 2,
      revisionNumber: 1,
      transactionSignature: SIG_B,
      submissionKind: "milestone",
      onChainSubmissionUri: "https://figma.example/file/2",
      links: [{ url: "https://figma.example/file/2", label: "Figma" }],
    }),
  });

  await notifyEmployerOfWorkSubmission(notes, {
    contractAddress: CONTRACT,
    parties: PARTIES,
    submission: unit0.submission,
  });
  await notifyEmployerOfWorkSubmission(notes, {
    contractAddress: CONTRACT,
    parties: PARTIES,
    submission: unit2.submission,
  });

  const inbox = await listNotifications(notes, {
    recipientWallet: EMPLOYER,
    cursor: null,
    limit: "20",
  });
  assert.equal(inbox.notifications.length, 2);

  const byUnit = new Map(
    inbox.notifications.map((n) => [
      (n.payload as { workUnitIndex: number }).workUnitIndex,
      n,
    ])
  );
  assert.equal(byUnit.get(0)?.type, "work_submitted");
  assert.equal(
    (byUnit.get(0)?.payload as { submissionId: string }).submissionId,
    unit0.submission.id
  );
  assert.equal(byUnit.get(2)?.type, "revised_work_submitted");
  assert.deepEqual(byUnit.get(2)?.payload, {
    submissionId: unit2.submission.id,
    workUnitIndex: 2,
    revisionNumber: 1,
    transactionSignature: SIG_B,
  });
});
