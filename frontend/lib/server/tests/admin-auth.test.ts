import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ADMIN_AUTHORITY, isAppAdminUser } from "../admin/auth";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const env = { PREMIFLOW_ADMIN_EMAILS: "  Ops@PremiFlow.app , second@example.com,,", PREMIFLOW_ADMIN_USER_IDS: " user-admin " };

test("admin emails: comma separated, trimmed, case-insensitive, verified only", () => {
  assert.equal(isAppAdminUser({ id: "u1", email: "ops@premiflow.app", emailVerified: true }, env), true);
  assert.equal(isAppAdminUser({ id: "u2", email: "  SECOND@example.COM ", emailVerified: true }, env), true);
  assert.equal(isAppAdminUser({ id: "u3", email: "ops@premiflow.app", emailVerified: false }, env), false);
  assert.equal(isAppAdminUser({ id: "u4", email: "ops@premiflow.app" }, env), false);
  assert.equal(isAppAdminUser({ id: "u5", email: "other@premiflow.app", emailVerified: true }, env), false);
  assert.equal(isAppAdminUser({ id: "u6", email: "ops@premiflow.app", emailVerified: true }, { PREMIFLOW_ADMIN_EMAILS: '"ops@premiflow.app"' }), true);
  assert.equal(isAppAdminUser({ id: "u7", email: "ops@premiflow.app", emailVerified: "true" } as never, env), false);
});

test("admin user ids preserved; client flags never grant admin", () => {
  assert.equal(isAppAdminUser({ id: "user-admin" }, env), true);
  assert.equal(isAppAdminUser({ id: "user-x", admin: true, role: "admin" } as never, env), false);
  assert.equal(isAppAdminUser(null, env), false);
  assert.equal(isAppAdminUser({ id: "user-admin" }, {}), false);
  assert.equal(ADMIN_AUTHORITY.settlement, false);
});

test("one shared check: /api/admin/me and every Help Desk admin API use auth.ts; no allowlist exposed", () => {
  const me = read("app/api/admin/me/route.ts");
  assert.match(me, /requireAccountUser\(request\)/);
  assert.doesNotMatch(me, /PREMIFLOW_ADMIN|process\.env/);
  for (const p of ["app/api/admin/support/tickets/route.ts", "app/api/admin/support/tickets/[id]/route.ts"]) {
    const src = read(p);
    assert.match(src, /requireAppAdmin\(request\)/);
    assert.doesNotMatch(src, /PREMIFLOW_ADMIN|process\.env/);
  }
  const auth = read("lib/server/admin/auth.ts");
  assert.match(auth, /admin: isAppAdminUser\(user, env\)/);
  assert.match(auth, /if \(!account\.admin\)/);
});
