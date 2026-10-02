import type { TxPhase } from "@/lib/app/tx-state";
import {
  noticeCopyForKind,
  noticeKindForAction,
  type NoticeKind,
  type NoticeKindContext,
} from "@/lib/app/notices";
import type { UiAction } from "@/lib/streampay-v2";

export type NoticeLevel = "success";

export type InAppNotice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  timestamp: number;
  level: NoticeLevel;
  signature: string;
};

export type ConfirmedNoticeInput = {
  phase: TxPhase;
  signature?: string;
  action?: UiAction;
  workUnitStatus?: NoticeKindContext["workUnitStatus"];
  paymentMode?: NoticeKindContext["paymentMode"];
  noticeKind?: NoticeKind;
  /** Create uses SuccessMoment instead of a toast/sound. */
  suppressNotice?: boolean;
  now?: number;
};

export const MAX_VISIBLE_NOTICES = 3;
export const NOTICE_AUTO_DISMISS_MS = 5_600;

/** Deadline catalog entries stay unused until a real scheduler exists. */
export const SCHEDULED_ONLY_NOTICE_KINDS: readonly NoticeKind[] = [
  "revision_approaching_deadline",
  "revision_deadline_passed",
];

export function resolveNoticeKind(input: {
  action?: UiAction;
  workUnitStatus?: NoticeKindContext["workUnitStatus"];
  paymentMode?: NoticeKindContext["paymentMode"];
  noticeKind?: NoticeKind;
}): NoticeKind | null {
  if (input.noticeKind) {
    if (SCHEDULED_ONLY_NOTICE_KINDS.includes(input.noticeKind)) return null;
    return input.noticeKind;
  }
  if (!input.action) return null;
  return noticeKindForAction(input.action, {
    workUnitStatus: input.workUnitStatus,
    paymentMode: input.paymentMode,
  });
}

export function noticeFromAccountRefresh(): null {
  return null;
}

export function shouldPlayNoticeSound(
  soundEnabled: boolean,
  notice: InAppNotice | null
): boolean {
  return Boolean(soundEnabled && notice);
}

export function requestNoticeSound(
  soundEnabled: boolean,
  notice: InAppNotice | null,
  play: () => boolean
): boolean {
  if (!shouldPlayNoticeSound(soundEnabled, notice)) return false;
  try {
    return play();
  } catch {
    return false;
  }
}

export function dismissNotice(
  notices: readonly InAppNotice[],
  id: string
): InAppNotice[] {
  return notices.filter((notice) => notice.id !== id);
}

export function prependNotice(
  notices: readonly InAppNotice[],
  next: InAppNotice,
  limit = MAX_VISIBLE_NOTICES
): InAppNotice[] {
  const withoutDup = notices.filter(
    (notice) => notice.id !== next.id && notice.signature !== next.signature
  );
  return [next, ...withoutDup].slice(0, limit);
}

export class NoticeDedupe {
  private readonly seen = new Set<string>();
  constructor(private readonly max = 64) {}

  has(signature: string): boolean {
    return this.seen.has(signature);
  }

  remember(signature: string): void {
    this.seen.add(signature);
    if (this.seen.size <= this.max) return;
    const first = this.seen.values().next().value;
    if (typeof first === "string") this.seen.delete(first);
  }
}

/**
 * Build at most one success notice from a locally confirmed tx result.
 * Account refresh, pending, confirming, and failures never produce a notice.
 * Create success is suppressed so SuccessMoment is the only celebration.
 */
export function noticeFromTxOutcome(
  input: ConfirmedNoticeInput,
  dedupe: NoticeDedupe
): InAppNotice | null {
  if (input.suppressNotice) return null;
  if (input.phase !== "success") return null;
  const signature = input.signature?.trim();
  if (!signature) return null;
  if (dedupe.has(signature)) return null;
  const kind = resolveNoticeKind(input);
  if (!kind) return null;
  const copy = noticeCopyForKind(kind);
  const notice: InAppNotice = {
    id: `tx:${signature}`,
    kind: copy.kind,
    title: copy.title,
    body: copy.body,
    timestamp: input.now ?? 0,
    level: "success",
    signature,
  };
  dedupe.remember(signature);
  return notice;
}

/** Signatures whose confirmation chime already played (persists across reloads/tabs). */
export const PLAYED_NOTICE_SOUNDS_KEY = "premiflow:notice-sounds-played:v1";
export const MAX_PLAYED_NOTICE_SOUNDS = 200;
export type PlayedSoundStorage = Pick<Storage, "getItem" | "setItem">;

export function browserPlayedSoundStorage(): PlayedSoundStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * True only the first time an id is claimed. Read, duplicate or replayed events
 * (same id) never chime again. Without storage, the in-memory dedupe still applies.
 */
export function claimNoticeSound(storage: PlayedSoundStorage | null, id: string): boolean {
  if (!id) return false;
  if (!storage) return true;
  let ids: string[] = [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(PLAYED_NOTICE_SOUNDS_KEY) ?? "[]");
    if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    ids = [];
  }
  if (ids.includes(id)) return false;
  ids.push(id);
  try {
    storage.setItem(PLAYED_NOTICE_SOUNDS_KEY, JSON.stringify(ids.slice(-MAX_PLAYED_NOTICE_SOUNDS)));
  } catch {
    // Storage full or blocked: still play once in this session.
  }
  return true;
}
