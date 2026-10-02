import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("PendingAcceptance freelancer can enter Request changes negotiation without a new on-chain action", () => {
  const detail = read("components/contracts/ContractDetail.tsx");

  // The existing acceptContract availability is our eligibility gate:
  // if accepting is available, the freelancer is still inside the live
  // PendingAcceptance response window.
  assert.match(
    detail,
    /\{actions\.includes\("acceptContract"\) \? \(/
  );

  assert.match(
    detail,
    /data-testid="offer-request-changes"/
  );

  assert.match(
    detail,
    />\s*Request changes\s*</
  );

  // The request enters the existing authenticated contract chat.
  assert.match(
    detail,
    /\?chat=1#messages/
  );

  // UX must explicitly say this does not mutate the funded offer.
  assert.match(
    detail,
    /On-chain terms stay unchanged/
  );

  assert.match(
    detail,
    /does not accept, decline, cancel, or move escrow funds/
  );
});

test("Request changes remains off-chain and uses the existing message notification path", () => {
  const actions = read("lib/streampay-v2/actions.ts");
  const route = read("app/api/contracts/[address]/messages/route.ts");

  // Do not invent a fake Solana instruction / UiAction.
  assert.doesNotMatch(
    actions,
    /requestOfferChanges|requestChanges|requestChangesContract/
  );

  // Existing chat POST persists the message and emits the normal
  // counterparty notification.
  assert.match(
    route,
    /notifyOtherPartyOfMessage/
  );

  assert.match(
    route,
    /message_received emit failed/
  );
});
