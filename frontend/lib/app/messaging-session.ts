/**
 * Shared PREMIFLOW messaging-session helpers.
 * Used by Contract Messages, Resolution, and Submit Work attachments.
 * Does not weaken server requireSession / requireMessageParticipant.
 */

import {
  createChallenge,
  fetchSession,
  logoutSession,
  signatureToBase64,
  verifyChallenge,
  type ApiError,
  type SessionInfo,
} from "@/lib/app/messages-client";
import {
  MESSAGES_PANEL_COPY,
  VERIFY_WALLET_EXPLAIN,
  sessionMatchesConnectedWallet,
} from "@/lib/app/messages-panel";

export type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

export type MessagingSessionDeps = {
  fetchSession: typeof fetchSession;
  createChallenge: typeof createChallenge;
  verifyChallenge: typeof verifyChallenge;
  logoutSession: typeof logoutSession;
};

const defaultDeps: MessagingSessionDeps = {
  fetchSession,
  createChallenge,
  verifyChallenge,
  logoutSession,
};

export type EnsureMessagingSessionInput = {
  wallet: string;
  signMessage: SignMessageFn | undefined;
};

export type EnsureMessagingSessionResult = {
  session: SessionInfo;
  /** True when the user was prompted to sign a challenge. */
  didSign: boolean;
};

export const DELIVERY_SESSION_COPY = {
  needsVerifyHeadline: "Verify your wallet to attach private delivery files.",
  needsVerifyDetail: "Message signature only — no transaction or fee. Same verification as Contract Messages.",
  verifying: "Waiting for a wallet message signature…",
  cannotSign: "This wallet cannot sign login messages.",
  verifyFailed: "Wallet verification did not complete. You can try again.",
  button: VERIFY_WALLET_EXPLAIN.button,
} as const;

function asApiError(err: unknown): ApiError {
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    "code" in err &&
    "message" in err
  ) {
    return err as ApiError;
  }
  return {
    status: 500,
    code: "request_failed",
    message: err instanceof Error ? err.message : DELIVERY_SESSION_COPY.verifyFailed,
  };
}

function sessionMismatchError(): ApiError {
  return {
    status: 401,
    code: "session_mismatch",
    message: MESSAGES_PANEL_COPY.session_mismatch,
  };
}

function cannotSignError(): ApiError {
  return {
    status: 400,
    code: "wallet_cannot_sign",
    message: DELIVERY_SESSION_COPY.cannotSign,
  };
}

/**
 * Returns an existing valid session for `wallet`, or null when missing/expired.
 * Returns `'mismatch'` when a session exists for a different wallet.
 */
export async function readExistingMessagingSession(
  wallet: string,
  deps: MessagingSessionDeps = defaultDeps
): Promise<SessionInfo | null | "mismatch"> {
  try {
    const me = await deps.fetchSession();
    if (!sessionMatchesConnectedWallet(me.wallet, wallet)) return "mismatch";
    return me;
  } catch (err) {
    const api = asApiError(err);
    if (api.status === 401) return null;
    throw api;
  }
}

/**
 * Ensures a valid premiflow_session cookie for the connected wallet.
 * Reuses an existing matching session without prompting for a signature.
 * Otherwise runs challenge → signMessage → verify → cookie (Messages flow).
 */
export async function ensureMessagingSession(
  input: EnsureMessagingSessionInput,
  deps: MessagingSessionDeps = defaultDeps
): Promise<EnsureMessagingSessionResult> {
  const existing = await readExistingMessagingSession(input.wallet, deps);
  if (existing === "mismatch") {
    await deps.logoutSession().catch(() => undefined);
    throw sessionMismatchError();
  }
  if (existing) {
    return { session: existing, didSign: false };
  }

  if (!input.signMessage) {
    throw cannotSignError();
  }

  const challenge = await deps.createChallenge(input.wallet);
  const signature = await input.signMessage(new TextEncoder().encode(challenge.message));
  await deps.verifyChallenge(challenge.challengeId, signatureToBase64(signature));
  const me = await deps.fetchSession();
  if (!sessionMatchesConnectedWallet(me.wallet, input.wallet)) {
    await deps.logoutSession().catch(() => undefined);
    throw sessionMismatchError();
  }
  return { session: me, didSign: true };
}

export function messagingSessionErrorMessage(err: unknown): string {
  return asApiError(err).message || DELIVERY_SESSION_COPY.verifyFailed;
}
