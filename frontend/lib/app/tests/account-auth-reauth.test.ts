import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  ACCOUNT_AUTH_ERROR_COPY,
  accountAuthErrorMessage,
  classifyAccountAuthError,
  classifyThrownAccountAuthError,
} from "../../account-auth/errors";
import { runAccountAuthCall, runAccountSignOut } from "../../account-auth/session-flow";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const CREDENTIAL = /email or password|wrong password|incorrect password|check your email/i;
const noWait = async () => undefined;

/**
 * Minimal stand-in for Better Auth semantics that matter here: a shared
 * cookie jar (all tabs of one browser), server-side sessions with expiry,
 * get-session deleting an expired/unknown cookie, sign-in issuing a fresh
 * cookie regardless of any stale one, and sign-out revoking + deleting.
 */
function fakeAuth(opts: { password?: string } = {}) {
  const password = opts.password ?? "Correct-horse-1";
  const sessions = new Map<string, { expiresAt: number }>();
  const jar: { cookie: string | null } = { cookie: null };
  let now = 1_000;
  let seq = 0;
  let failNext: number | null = null;
  return {
    jar,
    sessions,
    advance(ms: number) {
      now += ms;
    },
    failNextWith(status: number) {
      failNext = status;
    },
    getSession() {
      const s = jar.cookie ? sessions.get(jar.cookie) : undefined;
      if (!s || s.expiresAt < now) {
        jar.cookie = null; // server deletes the stale cookie
        return null;
      }
      return { user: { id: "u1" } };
    },
    async signIn(email: string, pw: string) {
      if (failNext !== null) {
        const status = failNext;
        failNext = null;
        return { error: { status, statusText: "Internal Server Error" } };
      }
      if (email !== "qa@example.com" || pw !== password) {
        return {
          error: { status: 401, code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
        };
      }
      const token = `t${++seq}`;
      sessions.set(token, { expiresAt: now + 60_000 });
      jar.cookie = token; // overwrites any stale cookie
      return { error: null };
    },
    async signOut() {
      if (jar.cookie) sessions.delete(jar.cookie);
      jar.cookie = null;
      return { error: null };
    },
  };
}

function tab(auth: ReturnType<typeof fakeAuth>) {
  const state = { user: null as null | { id: string }, refreshes: 0 };
  const refresh = () => {
    state.refreshes++;
    state.user = auth.getSession()?.user ?? null;
  };
  const login = (pw = "Correct-horse-1") =>
    runAccountAuthCall({
      context: "sign_in",
      retries: 1,
      wait: noWait,
      call: () => auth.signIn("qa@example.com", pw),
      refreshSession: refresh,
    });
  return { state, refresh, login };
}

test("expired session: client state cleared, same-tab login with same credentials succeeds", async () => {
  const auth = fakeAuth();
  const t = tab(auth);
  assert.equal((await t.login()).ok, true);
  assert.deepEqual(t.state.user, { id: "u1" });
  auth.advance(120_000); // session expires while the tab sits open
  t.refresh();
  assert.equal(t.state.user, null);
  assert.equal(auth.jar.cookie, null, "server cleared the expired cookie");
  const again = await t.login();
  assert.equal(again.ok, true);
  assert.deepEqual(t.state.user, { id: "u1" });
});

test("stale cookie is replaced and login succeeds without closing the browser", async () => {
  const auth = fakeAuth();
  const t = tab(auth);
  auth.jar.cookie = "stale-unknown-token";
  const r = await t.login();
  assert.equal(r.ok, true);
  assert.notEqual(auth.jar.cookie, "stale-unknown-token");
  assert.deepEqual(t.state.user, { id: "u1" });
});

test("logout clears server session, wallet cookie and client state; login works again", async () => {
  const auth = fakeAuth();
  const t = tab(auth);
  await t.login();
  const token = auth.jar.cookie!;
  let walletCleared = false;
  const out = await runAccountSignOut({
    signOut: () => auth.signOut(),
    clearWalletSession: async () => {
      walletCleared = true;
    },
    refreshSession: t.refresh,
  });
  assert.equal(out.serverCleared, true);
  assert.equal(walletCleared, true);
  assert.equal(auth.sessions.has(token), false, "server session revoked");
  assert.equal(t.state.user, null);
  assert.equal((await t.login()).ok, true);
  assert.deepEqual(t.state.user, { id: "u1" });
});

test("logout still clears client state when the server call fails", async () => {
  const t = tab(fakeAuth());
  const out = await runAccountSignOut({
    signOut: async () => {
      throw new TypeError("fetch failed");
    },
    clearWalletSession: async () => {
      throw new Error("no wallet session");
    },
    refreshSession: t.refresh,
  });
  assert.equal(out.serverCleared, false);
  assert.equal(t.state.refreshes, 1);
});

test("invalid password is still rejected with credential copy and is not retried", async () => {
  const auth = fakeAuth();
  let calls = 0;
  const r = await runAccountAuthCall({
    retries: 1,
    wait: noWait,
    call: () => {
      calls++;
      return auth.signIn("qa@example.com", "wrong-pass-1");
    },
    refreshSession: () => undefined,
  });
  assert.equal(r.ok, false);
  assert.equal(calls, 1);
  if (!r.ok) {
    assert.equal(r.kind, "invalid_credentials");
    assert.equal(r.message, ACCOUNT_AUTH_ERROR_COPY.invalid_credentials);
  }
});

test("transient 500 (cold database) retries once and then signs in", async () => {
  const auth = fakeAuth();
  const t = tab(auth);
  auth.failNextWith(500);
  const r = await t.login();
  assert.equal(r.ok, true);
  assert.deepEqual(t.state.user, { id: "u1" });
});

test("session/network/server/CSRF/rate-limit errors never read as wrong credentials", async () => {
  const cases: Array<[Parameters<typeof classifyAccountAuthError>[0], string]> = [
    [{ status: 500, statusText: "Internal Server Error" }, "server_unavailable"],
    [{ status: 503 }, "server_unavailable"],
    [{ status: 429, message: "Too many requests. Please try again later." }, "rate_limited"],
    [{ status: 403, code: "INVALID_ORIGIN", message: "Invalid origin" }, "request_blocked"],
    [{ status: 403, message: "CSRF token mismatch" }, "request_blocked"],
    [{ status: 401, code: "FAILED_TO_GET_SESSION" }, "session_expired"],
    [{ status: 401 }, "session_expired"],
    [{ status: 0 }, "network"],
    [{}, "network"],
  ];
  for (const [err, kind] of cases) {
    assert.equal(classifyAccountAuthError(err), kind, JSON.stringify(err));
    assert.doesNotMatch(accountAuthErrorMessage(err), CREDENTIAL, JSON.stringify(err));
  }
  assert.equal(classifyThrownAccountAuthError(new TypeError("fetch failed")), "network");
  const thrown = await runAccountAuthCall({
    retries: 1,
    wait: noWait,
    call: async () => {
      throw new TypeError("fetch failed");
    },
    refreshSession: () => undefined,
  });
  assert.equal(thrown.ok, false);
  if (!thrown.ok) {
    assert.equal(thrown.kind, "network");
    assert.doesNotMatch(thrown.message, CREDENTIAL);
  }
  // A 4xx message containing credential wording without the code is not echoed.
  assert.doesNotMatch(
    accountAuthErrorMessage({ status: 400, message: "Check your email or password" }),
    CREDENTIAL
  );
  assert.equal(
    accountAuthErrorMessage({ status: 422, code: "USER_ALREADY_EXISTS", message: "User already exists" }, "sign_up"),
    "User already exists"
  );
});

test("multi-tab: sign-out or expiry in one tab does not poison login in another", async () => {
  const auth = fakeAuth();
  const a = tab(auth);
  const b = tab(auth);
  await a.login();
  b.refresh();
  assert.deepEqual(b.state.user, { id: "u1" });
  await runAccountSignOut({
    signOut: () => auth.signOut(),
    clearWalletSession: async () => undefined,
    refreshSession: b.refresh,
  });
  a.refresh(); // broadcast / focus refetch
  assert.equal(a.state.user, null);
  assert.equal((await a.login()).ok, true);
  b.refresh();
  assert.deepEqual(b.state.user, { id: "u1" });
});

test("wiring: pages use the mapped flow, no credential fallback, no password storage", () => {
  const signIn = read("app/sign-in/page.tsx");
  const signUp = read("app/sign-up/page.tsx");
  const control = read("components/shell/AccountControl.tsx");
  const client = read("lib/account-auth/client.ts");
  assert.match(signIn, /runAccountAuthCall\(/);
  assert.match(signIn, /refreshAccountSession\(\)/);
  assert.doesNotMatch(signIn, /Check your email and password/);
  assert.match(signUp, /runAccountAuthCall\(/);
  assert.match(control, /runAccountSignOut\(/);
  assert.match(control, /clearWalletSession: \(\) => logoutSession\(\)/);
  assert.match(client, /\$sessionSignal/);
  for (const src of [signIn, signUp, control, client, read("lib/account-auth/session-flow.ts")]) {
    assert.doesNotMatch(src, /(localStorage|sessionStorage)/);
  }
});
