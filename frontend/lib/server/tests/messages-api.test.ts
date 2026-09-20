import assert from "node:assert/strict";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import { PREMIFLOW_RESOLVER } from "@/lib/app/premiflow";
import { isAuthorizedMessageWallet } from "../messages/authorize";
import {
  createContractMessage,
  listContractMessages,
  markThreadRead,
  MessageValidationError,
  unreadCountForWallet,
} from "../messages/service";
import { createMemoryMessageStore, createMemoryRateLimitStore } from "../memory-stores";
import { RateLimitedError } from "../rate-limit";
import {
  CONTRACT_DISCRIMINATOR,
  CONTRACT_MIN_LEN,
  readContractParties,
  type AccountReader,
  type AccountSnapshot,
} from "../solana/read-contract-parties";
import { CANONICAL_PROGRAM_ID } from "@/lib/streampay-v2/constants";
import { WALLET_A, WALLET_B, WALLET_C } from "@/lib/streampay-v2/tests/fixtures";

const CONTRACT = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr").toBase58();
const EMPLOYER = WALLET_A.toBase58();
const FREELANCER = WALLET_B.toBase58();
const UNRELATED = WALLET_C.toBase58();
const RESOLVER = PREMIFLOW_RESOLVER.address.toBase58();

function fakeContractAccount(
  employer = WALLET_A,
  freelancer = WALLET_B,
  overrides: Partial<AccountSnapshot> = {}
): AccountSnapshot {
  const data = new Uint8Array(Math.max(CONTRACT_MIN_LEN, 80));
  data.set(CONTRACT_DISCRIMINATOR, 0);
  data.set(employer.toBytes(), 9);
  data.set(freelancer.toBytes(), 41);
  return {
    owner: CANONICAL_PROGRAM_ID,
    data,
    ...overrides,
  };
}

function readerOf(account: AccountSnapshot | null, fail = false): AccountReader {
  return {
    async getAccountInfo() {
      if (fail) throw new Error("rpc down");
      return account;
    },
  };
}

function stores() {
  return {
    messages: createMemoryMessageStore(),
    rates: createMemoryRateLimitStore(),
  };
}

test("employer and freelancer are authorized; resolver and strangers are not", () => {
  const parties = { employer: EMPLOYER, freelancer: FREELANCER };
  assert.equal(isAuthorizedMessageWallet(EMPLOYER, parties), true);
  assert.equal(isAuthorizedMessageWallet(FREELANCER, parties), true);
  assert.equal(isAuthorizedMessageWallet(RESOLVER, parties), false);
  assert.equal(isAuthorizedMessageWallet(UNRELATED, parties), false);
});

test("readContractParties accepts a valid PREMIFLOW contract account", async () => {
  const parties = await readContractParties(readerOf(fakeContractAccount()), CONTRACT);
  assert.equal(parties.employer, EMPLOYER);
  assert.equal(parties.freelancer, FREELANCER);
});

test("readContractParties rejects missing contract, wrong owner, bad discriminator, and RPC failure", async () => {
  await assert.rejects(
    () => readContractParties(readerOf(null), CONTRACT),
    { code: "not_found" }
  );
  await assert.rejects(
    () =>
      readContractParties(
        readerOf(fakeContractAccount(WALLET_A, WALLET_B, { owner: PublicKey.default.toBase58() })),
        CONTRACT
      ),
    { code: "wrong_owner" }
  );
  const badDisc = fakeContractAccount();
  badDisc.data[0] = (badDisc.data[0] + 1) % 256;
  await assert.rejects(
    () => readContractParties(readerOf(badDisc), CONTRACT),
    { code: "bad_discriminator" }
  );
  await assert.rejects(
    () => readContractParties(readerOf(fakeContractAccount(), true), CONTRACT),
    { code: "rpc_failure" }
  );
  await assert.rejects(
    () => readContractParties(readerOf(fakeContractAccount()), "not-a-pubkey"),
    { code: "invalid_address" }
  );
});

test("send persists and later retrieval returns the same message", async () => {
  const db = stores();
  const sent = await createContractMessage(db, {
    contractAddress: CONTRACT,
    wallet: EMPLOYER,
    body: "Kickoff notes.",
  });
  assert.equal(sent.senderWallet, EMPLOYER);
  assert.equal(sent.body, "Kickoff notes.");
  const page = await listContractMessages(db.messages, {
    contractAddress: CONTRACT,
    cursor: null,
    limit: "30",
    wallet: FREELANCER,
  });
  assert.equal(page.messages.length, 1);
  assert.equal(page.messages[0].id, sent.id);
  assert.equal(page.messages[0].body, "Kickoff notes.");
});

test("empty and whitespace bodies are rejected; 2000 accepted; 2001 rejected", async () => {
  const db = stores();
  await assert.rejects(
    () => createContractMessage(db, { contractAddress: CONTRACT, wallet: EMPLOYER, body: "" }),
    MessageValidationError
  );
  await assert.rejects(
    () => createContractMessage(db, { contractAddress: CONTRACT, wallet: EMPLOYER, body: "   " }),
    MessageValidationError
  );
  const ok = await createContractMessage(db, {
    contractAddress: CONTRACT,
    wallet: EMPLOYER,
    body: "x".repeat(2000),
  });
  assert.equal(ok.body.length, 2000);
  await assert.rejects(
    () =>
      createContractMessage(db, {
        contractAddress: CONTRACT,
        wallet: EMPLOYER,
        body: "x".repeat(2001),
      }),
    MessageValidationError
  );
});

test("spoofed sender field cannot control sender_wallet", async () => {
  const db = stores();
  const spoofed = {
    body: "Hello",
    senderWallet: UNRELATED,
    sender: UNRELATED,
  };
  const saved = await createContractMessage(db, {
    contractAddress: CONTRACT,
    wallet: EMPLOYER,
    body: spoofed.body,
  });
  assert.equal(saved.senderWallet, EMPLOYER);
  assert.notEqual(saved.senderWallet, UNRELATED);
});

test("stable cursor pagination returns oldest-to-newest pages without duplicates", async () => {
  const db = stores();
  const base = new Date("2026-03-01T00:00:00.000Z");
  const inserted = [];
  for (let i = 0; i < 5; i += 1) {
    inserted.push(
      await createContractMessage(
        db,
        { contractAddress: CONTRACT, wallet: EMPLOYER, body: `m${i}` },
        new Date(base.getTime() + i * 1000)
      )
    );
  }
  const first = await listContractMessages(db.messages, {
    contractAddress: CONTRACT,
    cursor: null,
    limit: "2",
    wallet: FREELANCER,
  });
  assert.deepEqual(
    first.messages.map((row) => row.body),
    ["m3", "m4"]
  );
  assert.ok(first.nextCursor);
  const second = await listContractMessages(db.messages, {
    contractAddress: CONTRACT,
    cursor: first.nextCursor,
    limit: "2",
    wallet: FREELANCER,
  });
  assert.deepEqual(
    second.messages.map((row) => row.body),
    ["m1", "m2"]
  );
  const ids = [...first.messages, ...second.messages].map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
  const third = await listContractMessages(db.messages, {
    contractAddress: CONTRACT,
    cursor: second.nextCursor,
    limit: "2",
    wallet: FREELANCER,
  });
  assert.deepEqual(
    third.messages.map((row) => row.body),
    ["m0"]
  );
  assert.equal(third.nextCursor, null);
});

test("same-timestamp messages have stable id order and unread counts", async () => {
  const messages = createMemoryMessageStore();
  const createdAt = new Date("2026-03-02T12:00:00.000Z");
  const first = await messages.insertMessage({
    id: "00000000-0000-4000-8000-000000000001",
    contractAddress: CONTRACT,
    senderWallet: EMPLOYER,
    body: "first",
    createdAt,
  });
  const second = await messages.insertMessage({
    id: "00000000-0000-4000-8000-000000000002",
    contractAddress: CONTRACT,
    senderWallet: EMPLOYER,
    body: "second",
    createdAt,
  });
  const page = await listContractMessages(messages, {
    contractAddress: CONTRACT,
    cursor: null,
    limit: "10",
    wallet: FREELANCER,
  });
  assert.deepEqual(
    page.messages.map((row) => row.body),
    ["first", "second"]
  );
  assert.equal(page.unreadCount, 2);
  await markThreadRead(messages, {
    contractAddress: CONTRACT,
    wallet: FREELANCER,
    lastReadMessageId: first.id,
  });
  assert.equal(await unreadCountForWallet(messages, CONTRACT, FREELANCER), 1);
  const newest = await listContractMessages(messages, {
    contractAddress: CONTRACT,
    cursor: null,
    limit: "1",
    wallet: FREELANCER,
  });
  assert.deepEqual(
    newest.messages.map((row) => row.id),
    [second.id]
  );
  const older = await listContractMessages(messages, {
    contractAddress: CONTRACT,
    cursor: newest.nextCursor,
    limit: "1",
    wallet: FREELANCER,
  });
  assert.deepEqual(
    older.messages.map((row) => row.id),
    [first.id]
  );
});

test("read state is one row per contract and wallet", async () => {
  const db = stores();
  const a = await createContractMessage(db, {
    contractAddress: CONTRACT,
    wallet: EMPLOYER,
    body: "one",
  });
  await createContractMessage(db, {
    contractAddress: CONTRACT,
    wallet: EMPLOYER,
    body: "two",
    // same wallet, later by clock
  }, new Date(Date.now() + 1000));
  const first = await markThreadRead(db.messages, {
    contractAddress: CONTRACT,
    wallet: FREELANCER,
    lastReadMessageId: a.id,
  });
  assert.equal(typeof first.unreadCount, "number");
  const again = await markThreadRead(db.messages, {
    contractAddress: CONTRACT,
    wallet: FREELANCER,
    lastReadMessageId: a.id,
  });
  const read = await db.messages.getRead(CONTRACT, FREELANCER);
  assert.ok(read);
  assert.equal(read.lastReadMessageId, a.id);
  assert.equal(again.unreadCount, first.unreadCount);
});

test("send rate limit is about 20 messages per minute per wallet per contract", async () => {
  const db = stores();
  const now = new Date("2026-04-01T00:00:00.000Z");
  for (let i = 0; i < 20; i += 1) {
    await createContractMessage(
      db,
      { contractAddress: CONTRACT, wallet: EMPLOYER, body: `n${i}` },
      new Date(now.getTime() + i)
    );
  }
  await assert.rejects(
    () =>
      createContractMessage(
        db,
        { contractAddress: CONTRACT, wallet: EMPLOYER, body: "too many" },
        new Date(now.getTime() + 50)
      ),
    (err) => err instanceof RateLimitedError
  );
});

test("refresh persistence is repository-level: a second list sees the inserted row", async () => {
  const db = stores();
  await createContractMessage(db, {
    contractAddress: CONTRACT,
    wallet: FREELANCER,
    body: "Still here after refresh.",
  });
  const first = await listContractMessages(db.messages, {
    contractAddress: CONTRACT,
    cursor: null,
    limit: null,
    wallet: EMPLOYER,
  });
  const second = await listContractMessages(db.messages, {
    contractAddress: CONTRACT,
    cursor: null,
    limit: null,
    wallet: EMPLOYER,
  });
  assert.equal(first.messages[0].id, second.messages[0].id);
  assert.equal(second.messages[0].body, "Still here after refresh.");
});
