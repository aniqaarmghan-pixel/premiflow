import assert from "node:assert/strict";
import test from "node:test";

import { isCreateHandoff, loadPendingHandoff, savePendingHandoff } from "@/lib/app/marketplace-handoff-store";
import {
  EMPTY_SEARCH,
  MARKETPLACE_NAV,
  buildSearchQuery,
  marketplaceHandoffDraft,
  profileHref,
  splitSkills,
} from "@/lib/app/marketplace";
import type { IntentScope, IntentStorage } from "@/lib/app/milestone-create-plan";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import type { CreateHandoff } from "@/lib/server/marketplace/service";

const SCOPE: IntentScope = { cluster: "devnet", programId: "Prog1111111111111111111111111111111111111111" };
const EMPLOYER = "Emp11111111111111111111111111111111111111111";
const FREELANCER = "FrL11111111111111111111111111111111111111111";

function memory(): IntentStorage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  } as IntentStorage;
}

const gigHandoff: CreateHandoff = {
  source: "gig",
  gigId: "00000000-0000-4000-8000-0000000000aa",
  jobId: "",
  proposalId: "",
  title: "Logo design",
  description: "Three concepts.",
  paymentMode: "Fixed",
  amount: "150000000",
  freelancerWallet: FREELANCER,
};

test("gig handoff: accepted by the secure store, round-trips, extra fields dropped", () => {
  assert.equal(isCreateHandoff(gigHandoff), true);
  assert.equal(isCreateHandoff({ ...gigHandoff, gigId: "" }), false);
  assert.equal(isCreateHandoff({ ...gigHandoff, jobId: "00000000-0000-4000-8000-000000000001" }), false);
  const storage = memory();
  const tainted = { ...gigHandoff, tokenMint: "Evil", resolver: "Evil", decimals: 0 } as CreateHandoff;
  assert.equal(savePendingHandoff(storage, SCOPE, EMPLOYER, tainted, 1), true);
  const loaded = loadPendingHandoff(storage, SCOPE, EMPLOYER);
  assert.deepEqual(loaded?.handoff, gigHandoff);
  assert.equal(loadPendingHandoff(storage, SCOPE, FREELANCER), null);
});

test("gig handoff: draft uses gig owner as freelancer and locked token config", () => {
  const draft = marketplaceHandoffDraft(gigHandoff);
  const locked = lockedCreatePayment();
  assert.equal(draft.freelancer, FREELANCER);
  assert.equal(draft.paymentMode, "Fixed");
  assert.equal(draft.decimals, locked.decimals);
  assert.equal(draft.title, "Logo design");
});

test("search query builder: base-unit conversion, bounded text and skills", () => {
  assert.deepEqual(buildSearchQuery(EMPTY_SEARCH, 6), { ok: true, qs: "" });
  const built = buildSearchQuery(
    { q: " logo ", skills: "a,b,,c,d,e,f", mode: "Hourly", minUi: "1.5", maxUi: "10" },
    6
  );
  assert.equal(built.ok, true);
  const params = new URLSearchParams(built.ok ? built.qs.slice(1) : "");
  assert.equal(params.get("q"), "logo");
  assert.equal(params.get("skill"), "a,b,c,d,e");
  assert.equal(params.get("mode"), "Hourly");
  assert.equal(params.get("min"), "1500000");
  assert.equal(params.get("max"), "10000000");
  assert.equal(buildSearchQuery({ ...EMPTY_SEARCH, minUi: "abc" }, 6).ok, false);
  assert.deepEqual(splitSkills(" a, ,b "), ["a", "b"]);
});

test("marketplace nav and links: gigs and profile entries, encoded profile href", () => {
  const hrefs = MARKETPLACE_NAV.map((n) => n.href);
  for (const href of ["/marketplace/gigs", "/marketplace/my-gigs", "/marketplace/profile"]) {
    assert.ok((hrefs as readonly string[]).includes(href), href);
  }
  assert.equal(profileHref("a/b"), "/marketplace/profiles/a%2Fb");
});
