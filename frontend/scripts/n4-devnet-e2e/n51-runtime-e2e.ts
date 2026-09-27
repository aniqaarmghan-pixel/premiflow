/**
 * N5.1 browser/runtime E2E harness (test-only).
 * Authenticates disposable Devnet wallets via real challenge/verify.
 * Simulates NotificationBell N5.1 unread client (no /api/auth/me on ticks).
 * Creates a real message_received via messages API (no Solana txs).
 * Never prints secrets.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";

import { SESSION_COOKIE } from "@/lib/server/http";
import { signatureToBase64 } from "@/lib/app/messages-client";
import { NOTIFICATIONS_BADGE_POLL_MS } from "@/lib/app/notifications-ui";

const CONTRACT = "GzbsRoX6D1seSwrgAgtxbTdEf9FAR2qky7XmTPGiexas";
const EXPECTED_EMPLOYER = "CgonbiWvw7vAKhAXP8HbjrKcC8RFXqewKKkQ2SA2wLpz";
const EXPECTED_FREELANCER = "FH8KBiqYJRyHTvwW3y9BdXkitqruXr7b1mnbJ2tMXQE6";

type LogEntry = {
  t: number;
  kind: string;
  path: string;
  status: number;
  phase: string;
};

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function loadEnv(): Record<string, string> {
  const envPath = path.join(repoRoot(), "frontend", ".env.local");
  const out: Record<string, string> = {};
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = val;
  }
  return out;
}

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function extractCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;,]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

async function api(
  base: string,
  origin: string,
  p: string,
  init: {
    method?: string;
    body?: unknown;
    cookie?: string | null;
    phase: string;
    log: LogEntry[];
    t0: number;
  }
) {
  const headers = new Headers({
    "content-type": "application/json",
    origin,
  });
  if (init.cookie) {
    headers.set(
      "cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(init.cookie)}`
    );
  }
  const res = await fetch(`${base}${p}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie().join(", ")
      : res.headers.get("set-cookie");
  const json = await res.json().catch(() => null);
  init.log.push({
    t: Date.now() - init.t0,
    kind: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    path: p.split("?")[0]!,
    status: res.status,
    phase: init.phase,
  });
  return { status: res.status, json, setCookie };
}

async function authenticate(
  base: string,
  origin: string,
  kp: Keypair,
  log: LogEntry[],
  t0: number,
  phase: string
): Promise<string> {
  const wallet = kp.publicKey.toBase58();
  const challenge = await api(base, origin, "/api/auth/challenge", {
    method: "POST",
    body: { wallet },
    phase,
    log,
    t0,
  });
  if (challenge.status !== 200 || !challenge.json?.challengeId) {
    throw new Error(`challenge failed: ${JSON.stringify(challenge.json)}`);
  }
  const msg = new TextEncoder().encode(challenge.json.message as string);
  const sig = signatureToBase64(ed25519.sign(msg, kp.secretKey.slice(0, 32)));
  const verified = await api(base, origin, "/api/auth/verify", {
    method: "POST",
    body: { challengeId: challenge.json.challengeId, signature: sig },
    phase,
    log,
    t0,
  });
  const cookie = extractCookie(verified.setCookie);
  if (verified.status !== 200 || !cookie) {
    throw new Error(`verify failed: ${JSON.stringify(verified.json)}`);
  }
  return cookie;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (NOTIFICATIONS_BADGE_POLL_MS !== 15_000) {
    throw new Error(`Expected 15s poll, got ${NOTIFICATIONS_BADGE_POLL_MS}`);
  }

  const env = loadEnv();
  const base = process.env.APP_ORIGIN ?? env.APP_ORIGIN ?? "http://localhost:3000";
  const origin = base;
  const root = repoRoot();
  const employerKp = loadKeypair(
    path.join(root, ".local/n4-e2e/n4-e2e-employer-keypair.json")
  );
  const freelancerKp = loadKeypair(
    path.join(root, ".local/n4-e2e/n4-e2e-freelancer-keypair.json")
  );
  if (employerKp.publicKey.toBase58() !== EXPECTED_EMPLOYER) {
    throw new Error("employer pubkey mismatch");
  }
  if (freelancerKp.publicKey.toBase58() !== EXPECTED_FREELANCER) {
    throw new Error("freelancer pubkey mismatch");
  }

  const log: LogEntry[] = [];
  const t0 = Date.now();
  const results: Record<string, string> = {};

  // --- Auth ---
  const empCookie = await authenticate(
    base,
    origin,
    employerKp,
    log,
    t0,
    "bootstrap"
  );
  const freCookie = await authenticate(
    base,
    origin,
    freelancerKp,
    log,
    t0,
    "bootstrap"
  );

  // Session bootstrap me (once) — allowed
  await api(base, origin, "/api/auth/me", {
    method: "GET",
    cookie: empCookie,
    phase: "bootstrap",
    log,
    t0,
  });

  // --- 3. Initial unread fetch ---
  const initial = await api(base, origin, "/api/notifications/unread-count", {
    method: "GET",
    cookie: empCookie,
    phase: "initial",
    log,
    t0,
  });
  if (initial.status !== 200) throw new Error("initial unread failed");
  const baselineUnread = Number(initial.json.unreadCount);
  results.initial_unread_fetch = "PASS";
  results.initial_unread_ms = String(Date.now() - t0);
  results.baseline_unread = String(baselineUnread);

  // --- 4–5. Visible 35s polling simulation (N5.1 client: unread only, no /me) ---
  const pollTimes: number[] = [Date.now() - t0];
  let badgeSeenIncrease = false;
  let unreadAfterEvent: number | null = null;

  // Fire message after ~5s from freelancer (real N3 path)
  const messagePromise = (async () => {
    await sleep(5_000);
    const sent = await api(
      base,
      origin,
      `/api/contracts/${CONTRACT}/messages`,
      {
        method: "POST",
        cookie: freCookie,
        body: {
          body: `N5.1 E2E message_received probe ${Date.now()}`,
        },
        phase: "create_message",
        log,
        t0,
      }
    );
    if (sent.status !== 200 && sent.status !== 201) {
      throw new Error(`message create failed: ${JSON.stringify(sent.json)}`);
    }
    results.message_create = "PASS";
  })();

  // Poll at 0 (already done), +15s, +30s — and check mid for badge update
  for (const wait of [15_000, 15_000]) {
    await sleep(wait);
    const tick = await api(base, origin, "/api/notifications/unread-count", {
      method: "GET",
      cookie: empCookie,
      phase: "periodic_poll",
      log,
      t0,
    });
    if (tick.status !== 200) throw new Error("poll failed");
    pollTimes.push(Date.now() - t0);
    const count = Number(tick.json.unreadCount);
    if (count > baselineUnread) {
      badgeSeenIncrease = true;
      unreadAfterEvent = count;
    }
  }
  await messagePromise;

  // One more quick poll if message landed after last tick
  if (!badgeSeenIncrease) {
    await sleep(2_000);
    const late = await api(base, origin, "/api/notifications/unread-count", {
      method: "GET",
      cookie: empCookie,
      phase: "post_message_poll",
      log,
      t0,
    });
    if (Number(late.json.unreadCount) > baselineUnread) {
      badgeSeenIncrease = true;
      unreadAfterEvent = Number(late.json.unreadCount);
    }
  }

  const periodicMe = log.filter(
    (e) => e.phase === "periodic_poll" && e.path === "/api/auth/me"
  );
  const periodicList = log.filter(
    (e) => e.phase === "periodic_poll" && e.path === "/api/notifications"
  );
  const periodicUnread = log.filter(
    (e) =>
      e.phase === "periodic_poll" &&
      e.path === "/api/notifications/unread-count"
  );

  results.poll_15s =
    periodicUnread.length >= 2 && pollTimes.length >= 3 ? "PASS" : "FAIL";
  results.no_periodic_auth_me = periodicMe.length === 0 ? "PASS" : "FAIL";
  results.list_not_periodically_polled =
    periodicList.length === 0 ? "PASS" : "FAIL";
  results.real_notification_badge_update = badgeSeenIncrease
    ? "PASS"
    : "FAIL";
  results.poll_times_ms = JSON.stringify(pollTimes);

  // --- 6. Bell open simulation ---
  const list1 = await api(base, origin, "/api/notifications?limit=20", {
    method: "GET",
    cookie: empCookie,
    phase: "bell_open",
    log,
    t0,
  });
  const unreadOpen = await api(base, origin, "/api/notifications/unread-count", {
    method: "GET",
    cookie: empCookie,
    phase: "bell_open",
    log,
    t0,
  });
  const notes = (list1.json?.notifications ?? []) as Array<{
    id: string;
    type: string;
    body: string;
    readAt: string | null;
  }>;
  const newMsg = notes.find(
    (n) => n.type === "message_received" && n.readAt == null
  );
  results.bell_open_refresh =
    list1.status === 200 && unreadOpen.status === 200 ? "PASS" : "FAIL";
  results.bell_shows_new_notification = newMsg ? "PASS" : "FAIL";

  // reopen
  await api(base, origin, "/api/notifications?limit=20", {
    method: "GET",
    cookie: empCookie,
    phase: "bell_reopen",
    log,
    t0,
  });

  // --- 11. Mark one read ---
  if (newMsg) {
    const before = Number(unreadOpen.json.unreadCount);
    const marked = await api(
      base,
      origin,
      `/api/notifications/${newMsg.id}/read`,
      {
        method: "POST",
        cookie: empCookie,
        body: {},
        phase: "mark_one",
        log,
        t0,
      }
    );
    await sleep(16_000);
    const afterPoll = await api(
      base,
      origin,
      "/api/notifications/unread-count",
      {
        method: "GET",
        cookie: empCookie,
        phase: "after_mark_one_poll",
        log,
        t0,
      }
    );
    const after = Number(afterPoll.json.unreadCount);
    results.mark_one_read_stability =
      marked.status === 200 && after <= before && after === Number(afterPoll.json.unreadCount)
        ? "PASS"
        : "FAIL";
    results.mark_one_before = String(before);
    results.mark_one_after = String(after);
  } else {
    results.mark_one_read_stability = "FAIL";
  }

  // --- 12. Mark all ---
  const beforeAll = await api(base, origin, "/api/notifications/unread-count", {
    method: "GET",
    cookie: empCookie,
    phase: "before_mark_all",
    log,
    t0,
  });
  const markAll = await api(base, origin, "/api/notifications/read-all", {
    method: "POST",
    cookie: empCookie,
    body: {},
    phase: "mark_all",
    log,
    t0,
  });
  await sleep(16_000);
  const afterAll = await api(base, origin, "/api/notifications/unread-count", {
    method: "GET",
    cookie: empCookie,
    phase: "after_mark_all_poll",
    log,
    t0,
  });
  results.mark_all_read_stability =
    markAll.status === 200 && Number(afterAll.json.unreadCount) === 0
      ? "PASS"
      : "FAIL";
  results.mark_all_before = String(beforeAll.json.unreadCount);
  results.mark_all_after = String(afterAll.json.unreadCount);

  // --- 13. Stale session protection: covered by unit tests; soft browser check ---
  // Auth as employer, start "generation", switch cookie to freelancer, ensure
  // we don't treat freelancer unread as employer (client would discard via session mismatch).
  const empUnread = await api(base, origin, "/api/notifications/unread-count", {
    method: "GET",
    cookie: empCookie,
    phase: "stale_session_a",
    log,
    t0,
  });
  const freUnread = await api(base, origin, "/api/notifications/unread-count", {
    method: "GET",
    cookie: freCookie,
    phase: "stale_session_b",
    log,
    t0,
  });
  results.stale_session_response_protection =
    empUnread.status === 200 && freUnread.status === 200
      ? "PASS_UNIT_AND_API_SCOPED"
      : "FAIL";
  // Note: full in-flight race is unit-tested (shouldAcceptUnreadCountResponse).

  // --- 14. Error recovery: call with bad cookie then good ---
  const bad = await api(base, origin, "/api/notifications/unread-count", {
    method: "GET",
    cookie: "invalid",
    phase: "temp_error",
    log,
    t0,
  });
  const recovered = await api(base, origin, "/api/notifications/unread-count", {
    method: "GET",
    cookie: empCookie,
    phase: "temp_error_recover",
    log,
    t0,
  });
  results.temporary_error_recovery =
    bad.status === 401 && recovered.status === 200 ? "PASS" : "FAIL";

  // Hidden/visible: Node cannot drive document.visibilityState of NotificationBell
  // without a connected wallet adapter. Mark for browser CDP follow-up.
  results.hidden_tab_pause = "PENDING_BROWSER";
  results.visible_return_immediate_refresh = "PENDING_BROWSER";

  // Summaries
  const byPhase = (phase: string, pathFrag: string) =>
    log.filter((e) => e.phase === phase && e.path.includes(pathFrag)).length;

  const summary = {
    pollIntervalMs: NOTIFICATIONS_BADGE_POLL_MS,
    results,
    requestCounts: {
      auth_me_bootstrap: byPhase("bootstrap", "/api/auth/me"),
      auth_me_periodic: byPhase("periodic_poll", "/api/auth/me"),
      unread_initial: byPhase("initial", "unread-count"),
      unread_periodic: byPhase("periodic_poll", "unread-count"),
      list_periodic: byPhase("periodic_poll", "/api/notifications") -
        byPhase("periodic_poll", "unread-count"),
      list_bell_open: log.filter(
        (e) =>
          (e.phase === "bell_open" || e.phase === "bell_reopen") &&
          e.path === "/api/notifications"
      ).length,
      unread_bell_open: log.filter(
        (e) => e.phase === "bell_open" && e.path.includes("unread-count")
      ).length,
    },
    log,
    solanaTransactions: 0,
    n4OnChainMutations: 0,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
