/**
 * Create & Send Offer: release the "create attempted" lock when a send provably
 * never left the browser.
 *
 * The wizard marks the saved intent `createAttempted` before the wallet prompt,
 * because from then on a create transaction may exist on-chain and the terms
 * must stay immutable. When the wallet refuses to sign, or the signed
 * transaction is refused locally because its blockhash expired before submit,
 * nothing was broadcast, so keeping the lock only strands the user (terms
 * locked, Discard blocked for the landing window). Anything that may have been
 * sent keeps the lock.
 */
import type { CreateIntent } from "@/lib/app/milestone-create-plan";
import {
  TransactionConfirmationUnknownError,
  TransactionFailedOnChainError,
} from "@/lib/streampay-v2/confirm";
import { TransactionExpiredBeforeSubmitError } from "@/lib/streampay-v2/send";

/**
 * True only for errors that prove no transaction was broadcast:
 * - TransactionExpiredBeforeSubmitError (send pipeline refused before sendRawTransaction);
 * - wallet signing refusal: WalletSignTransactionError, or EIP-1193 code 4001.
 * Confirmation timeouts, on-chain failures, network/RPC errors, anything carrying
 * a signature, and unknown errors are NOT unsent.
 */
export function isDefinitelyUnsentError(err: unknown): boolean {
  if (err instanceof TransactionExpiredBeforeSubmitError) return true;
  if (
    err instanceof TransactionConfirmationUnknownError ||
    err instanceof TransactionFailedOnChainError
  ) {
    return false;
  }
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; code?: unknown; signature?: unknown };
  // Anything that carries a signature may have been broadcast.
  if (typeof e.signature === "string" && e.signature.length > 0) return false;
  if (e.name === "TransactionExpiredBeforeSubmitError") return true;
  if (e.name === "WalletSignTransactionError") return true;
  return e.code === 4001;
}

/**
 * After a create send settles: if this click started from an unlocked intent and
 * the send provably never broadcast, return the intent unlocked again
 * (`createAttempted: false`, `createActivityAt` restored). Otherwise return
 * `settled` unchanged. Contract ID and terms are never changed here.
 */
export function releaseUnsentCreateAttempt(
  beforeAttempt: CreateIntent,
  settled: CreateIntent,
  err: unknown,
  nowMs: number
): CreateIntent {
  if (beforeAttempt.createAttempted) return settled;
  if (!isDefinitelyUnsentError(err)) return settled;
  if (
    settled.contractId !== beforeAttempt.contractId ||
    settled.contractAddress !== beforeAttempt.contractAddress ||
    settled.fingerprint !== beforeAttempt.fingerprint
  ) {
    return settled;
  }
  return {
    ...settled,
    createAttempted: false,
    createActivityAt: beforeAttempt.createActivityAt,
    updatedAt: Math.max(settled.updatedAt, nowMs),
  };
}
