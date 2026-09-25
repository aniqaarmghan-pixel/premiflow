import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DELIVERY_SESSION_COPY,
  ensureMessagingSession,
  messagingSessionErrorMessage,
  readExistingMessagingSession,
  type MessagingSessionDeps,
} from "../messaging-session";
import { MESSAGES_PANEL_COPY } from "../messages-panel";

const DETAIL = readFileSync(
  new URL("../../../components/contracts/ContractDetail.tsx", import.meta.url),
  "utf8"
);
const FORM = readFileSync(
  new URL("../../../components/contracts/SubmitWorkForm.tsx", import.meta.url),
  "utf8"
);
const MESSAGES = readFileSync(
  new URL("../../../components/contracts/ContractMessages.tsx", import.meta.url),
  "utf8"
);
const RESOLUTION = readFileSync(
  new URL("../../../components/contracts/ResolutionCenter.tsx", import.meta.url),
  "utf8"
);
const ATTACHMENTS_ROUTE = readFileSync(
  new URL("../../../app/api/contracts/[address]/attachments/route.ts", import.meta.url),
  "utf8"
);

function deps(partial: Partial<MessagingSessionDeps> & Pick<MessagingSessionDeps, "fetchSession">): MessagingSessionDeps {
  return {
    createChallenge: async () => {
      throw new Error("createChallenge should not be called");
    },
    verifyChallenge: async () => {
      throw new Error("verifyChallenge should not be called");
    },
    logoutSession: async () => ({ ok: true as const }),
    ...partial,
  };
}

test("valid existing session reuses cookie without another sign request", async () => {
  let signed = 0;
  const result = await ensureMessagingSession(
    {
      wallet: "Freelancer111",
      signMessage: async () => {
        signed += 1;
        return new Uint8Array([1]);
      },
    },
    deps({
      fetchSession: async () => ({
        wallet: "Freelancer111",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    })
  );
  assert.equal(result.didSign, false);
  assert.equal(result.session.wallet, "Freelancer111");
  assert.equal(signed, 0);
});

test("missing session runs challenge → sign → verify → cookie before ready", async () => {
  let signed = 0;
  let verified = false;
  const result = await ensureMessagingSession(
    {
      wallet: "Freelancer111",
      signMessage: async (message) => {
        signed += 1;
        assert.ok(message.byteLength > 0);
        return new Uint8Array([9, 8, 7]);
      },
    },
    deps({
      fetchSession: async () => {
        if (!verified) {
          throw { status: 401, code: "unauthenticated", message: "Verify your wallet to continue." };
        }
        return { wallet: "Freelancer111", expiresAt: "2099-01-01T00:00:00.000Z" };
      },
      createChallenge: async (wallet) => {
        assert.equal(wallet, "Freelancer111");
        return {
          challengeId: "chal-1",
          message: "PREMIFLOW login\nWallet: Freelancer111",
          expiresAt: "2099-01-01T00:00:00.000Z",
        };
      },
      verifyChallenge: async (challengeId, signature) => {
        assert.equal(challengeId, "chal-1");
        assert.ok(typeof signature === "string" && signature.length > 0);
        verified = true;
        return { wallet: "Freelancer111", expiresAt: "2099-01-01T00:00:00.000Z" };
      },
    })
  );
  assert.equal(result.didSign, true);
  assert.equal(signed, 1);
  assert.equal(result.session.wallet, "Freelancer111");
});

test("wrong wallet / session mismatch is rejected without treating as valid", async () => {
  await assert.rejects(
    () =>
      ensureMessagingSession(
        {
          wallet: "Freelancer111",
          signMessage: async () => new Uint8Array([1]),
        },
        deps({
          fetchSession: async () => ({
            wallet: "Employer999",
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
        })
      ),
    (err: unknown) => {
      const api = err as { code?: string; message?: string };
      assert.equal(api.code, "session_mismatch");
      assert.equal(api.message, MESSAGES_PANEL_COPY.session_mismatch);
      return true;
    }
  );
  assert.equal(await readExistingMessagingSession("Freelancer111", deps({
    fetchSession: async () => ({
      wallet: "Employer999",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }),
  })), "mismatch");
});

test("verification rejection produces a useful UI error message", async () => {
  await assert.rejects(
    () =>
      ensureMessagingSession(
        {
          wallet: "Freelancer111",
          signMessage: undefined,
        },
        deps({
          fetchSession: async () => {
            throw { status: 401, code: "unauthenticated", message: "Verify your wallet to continue." };
          },
        })
      ),
    (err: unknown) => {
      assert.equal(messagingSessionErrorMessage(err), DELIVERY_SESSION_COPY.cannotSign);
      return true;
    }
  );
  await assert.rejects(
    () =>
      ensureMessagingSession(
        {
          wallet: "Freelancer111",
          signMessage: async () => {
            throw { status: 400, code: "invalid_signature", message: "Signature did not match." };
          },
        },
        deps({
          fetchSession: async () => {
            throw { status: 401, code: "unauthenticated", message: "Verify your wallet to continue." };
          },
          createChallenge: async () => ({
            challengeId: "chal-2",
            message: "sign me",
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
        })
      ),
    (err: unknown) => {
      assert.equal(messagingSessionErrorMessage(err), "Signature did not match.");
      return true;
    }
  );
});

test("Submit Work reuses shared session helper and gates the file picker", () => {
  assert.match(DETAIL, /ensureMessagingSession/);
  assert.match(DETAIL, /readExistingMessagingSession/);
  assert.match(DETAIL, /onVerifyDeliveryWallet/);
  assert.match(DETAIL, /deliverySession=\{deliverySession\}/);
  assert.match(FORM, /DELIVERY_SESSION_COPY\.needsVerifyHeadline/);
  assert.match(FORM, /aria-label="Verify wallet"/);
  assert.match(FORM, /filesReady \? \(/);
  assert.match(FORM, /deliverySession\.status === "ready"/);
  assert.match(DETAIL, /if \(deliverySession\.status !== "ready"\) return;/);
});

test("attachment route still requires message participant session (not public)", () => {
  assert.match(ATTACHMENTS_ROUTE, /requireMessageParticipant/);
  assert.match(ATTACHMENTS_ROUTE, /requireMutatingOrigin/);
  assert.doesNotMatch(ATTACHMENTS_ROUTE, /tryOptionalSession/);
});

test("Messages and Resolution still use the shared verification helper", () => {
  assert.match(MESSAGES, /ensureMessagingSession/);
  assert.match(MESSAGES, /ChatVerifyGate/);
  assert.match(MESSAGES, /onVerify=\{\(\) => void onVerifyWallet\(\)\}/);
  assert.match(RESOLUTION, /ensureMessagingSession/);
  assert.doesNotMatch(MESSAGES, /createChallenge\(/);
  assert.doesNotMatch(RESOLUTION, /createChallenge\(/);
});
