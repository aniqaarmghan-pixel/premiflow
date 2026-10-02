import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import {
  MAX_PLAYED_NOTICE_SOUNDS,
  PLAYED_NOTICE_SOUNDS_KEY,
  claimNoticeSound,
} from "@/lib/app/notice-feed";
import {
  isRealSignature,
  readResolveSignature,
  recordResolveSignature,
  resolveSignatureKey,
} from "@/lib/app/resolve-signature-store";
import { mergeResolverTxHistory } from "@/lib/app/resolver-tx-history";
import { RESOLVER_WORKSPACE_COPY, resolvedCaseRow } from "@/lib/app/resolver-workspace";
import { makeContract } from "@/lib/streampay-v2/tests/fixtures";

const SIG_A = "5".repeat(88);
const SIG_B = "4".repeat(87);
const SIG_C = "3".repeat(86);
const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

test("resolve signature store: only real signatures, scoped by cluster and contract", () => {
  const s = memory();
  assert.equal(isRealSignature(SIG_A), true);
  assert.equal(isRealSignature("abc"), false);
  assert.equal(isRealSignature("0".repeat(88)), false);
  assert.equal(recordResolveSignature(s, "devnet", "C1", "not-a-signature"), false);
  assert.equal(readResolveSignature(s, "devnet", "C1"), null);
  assert.equal(recordResolveSignature(s, "devnet", "C1", SIG_A), true);
  assert.equal(readResolveSignature(s, "devnet", "C1"), SIG_A);
  assert.equal(readResolveSignature(s, "mainnet", "C1"), null);
  assert.equal(readResolveSignature(s, "devnet", "C2"), null);
  s.map.set(resolveSignatureKey("devnet", "C3"), "{corrupt");
  assert.equal(readResolveSignature(s, "devnet", "C3"), null);
  s.map.set(resolveSignatureKey("devnet", "C4"), JSON.stringify({ signature: "fake" }));
  assert.equal(readResolveSignature(s, "devnet", "C4"), null);
  assert.equal(readResolveSignature(null, "devnet", "C1"), null);
});

test("resolved case row shows a transaction only for a real recorded signature", () => {
  const done = makeContract({ address: new PublicKey(new Uint8Array(32).fill(61)), status: "Resolved" });
  assert.equal(resolvedCaseRow(done, 6).txSignature, null);
  assert.equal(resolvedCaseRow(done, 6, SIG_A).txSignature, SIG_A);
  assert.equal(resolvedCaseRow(done, 6, "fake").txSignature, null);
});

test("resolve wiring: signature recorded after the confirmed send; View transaction gated", () => {
  const detail = read("components/contracts/ContractDetail.tsx");
  const i = detail.indexOf("await client.resolveDispute(");
  assert.ok(i > 0);
  assert.ok(detail.indexOf("recordResolveSignature(", i) > i);
  const rc = read("components/contracts/ResolutionCenter.tsx");
  assert.match(rc, /\{resolveSignature \? \(\s*<a\s+href=\{explorerTxUrl\(resolveSignature\)\}/);
  const ws = read("components/resolver/ResolverWorkspace.tsx");
  assert.match(ws, /\{row\.txSignature \? \(\s*<a\s+href=\{explorerTxUrl\(row\.txSignature\)\}/);
  assert.equal(read("lib/streampay-v2/send.ts").includes("recordResolveSignature"), false);
});

test("resolver tx history: real signatures only, deduped, newest first, explorer links", () => {
  const explorer = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
  const items = mergeResolverTxHistory(
    [
      {
        contract: "C1",
        signatures: [
          { signature: SIG_A, slot: 10, err: null, blockTime: 100 },
          { signature: "bogus", slot: 11, err: null, blockTime: 500 },
          { signature: SIG_C, slot: 5, err: null, blockTime: null },
        ],
      },
      {
        contract: "C2",
        signatures: [
          { signature: SIG_B, slot: 12, err: { InstructionError: [0, "x"] }, blockTime: 200 },
          { signature: SIG_A, slot: 10, err: null, blockTime: 100 },
        ],
      },
    ],
    explorer
  );
  assert.deepEqual(items.map((i) => i.signature), [SIG_B, SIG_A, SIG_C]);
  assert.equal(items[0].failed, true);
  assert.equal(items[0].contract, "C2");
  assert.equal(items[0].explorerHref, explorer(SIG_B));
  assert.equal(items[0].contractHref, "/contracts/C2");
  assert.equal(items[2].timeLabel, "Time unavailable");
  assert.deepEqual(mergeResolverTxHistory([], explorer), []);
  assert.equal(mergeResolverTxHistory([{ contract: "C1", signatures: [{ signature: SIG_A, slot: 1, err: null }] }], explorer, 0).length, 0);
  assert.match(RESOLVER_WORKSPACE_COPY.txHistoryEmpty, /No on-chain transactions/);
  assert.match(RESOLVER_WORKSPACE_COPY.txHistoryError, /could not be loaded/);
  const ws = read("components/resolver/ResolverWorkspace.tsx");
  assert.match(ws, /useResolverTxHistory\(/);
  assert.match(ws, /txHistoryError/);
  assert.match(ws, /txHistoryEmpty/);
  assert.match(read("lib/hooks/useResolverTxHistory.ts"), /getSignaturesForAddress\(/);
});

test("notice sound plays once per id, persists across sessions, survives corrupt storage", () => {
  const s = memory();
  assert.equal(claimNoticeSound(s, "tx:1"), true);
  assert.equal(claimNoticeSound(s, "tx:1"), false);
  const reloaded = { getItem: s.getItem, setItem: s.setItem };
  assert.equal(claimNoticeSound(reloaded, "tx:1"), false);
  assert.equal(claimNoticeSound(s, "tx:2"), true);
  assert.equal(claimNoticeSound(s, ""), false);
  s.map.set(PLAYED_NOTICE_SOUNDS_KEY, "{bad");
  assert.equal(claimNoticeSound(s, "tx:3"), true);
  for (let i = 0; i < MAX_PLAYED_NOTICE_SOUNDS + 20; i += 1) claimNoticeSound(s, `x:${i}`);
  const stored = JSON.parse(s.map.get(PLAYED_NOTICE_SOUNDS_KEY) ?? "[]") as string[];
  assert.equal(stored.length, MAX_PLAYED_NOTICE_SOUNDS);
  assert.equal(claimNoticeSound(null, "tx:9"), true);
  const provider = read("components/shell/NoticeProvider.tsx");
  assert.match(
    provider,
    /if \(isNoticeSoundEnabled\(\) && claimNoticeSound\(browserPlayedSoundStorage\(\), notice\.id\)\) \{\s*requestNoticeSound\(/
  );
});

test("density pass 2 and overflow: no zoom/scale/root-font hacks; compact desktop spacing", () => {
  const files = [
    "components/contracts/ContractDetail.tsx",
    "components/contracts/ResolutionCenter.tsx",
    "components/contracts/HourlyShowcase.tsx",
    "components/contracts/StreamShowcase.tsx",
    "components/contracts/ContractMessages.tsx",
    "components/contracts/PaymentProgress.tsx",
    "components/resolver/ResolverWorkspace.tsx",
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /zoom:|style=\{\{\s*zoom|\bscale-\[0\.|html\s*\{\s*font-size/, f);
    assert.match(src, /lg:p-4|lg:text-xl|lg:text-base/, f);
  }
  const ws = read("components/resolver/ResolverWorkspace.tsx");
  assert.match(ws, /break-words text-xs text-ink-soft">\s*Employer/);
  assert.match(ws, /min-w-0 break-words text-sm font-medium/);
});
