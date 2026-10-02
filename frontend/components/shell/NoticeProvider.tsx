"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { playNoticeSound, unlockNoticeAudio } from "@/lib/app/notice-sound";
import { isNoticeSoundEnabled } from "@/lib/app/notices";
import {
  NOTICE_AUTO_DISMISS_MS,
  NoticeDedupe,
  dismissNotice,
  noticeFromTxOutcome,
  prependNotice,
  browserPlayedSoundStorage,
  claimNoticeSound,
  requestNoticeSound,
  type ConfirmedNoticeInput,
  type InAppNotice,
} from "@/lib/app/notice-feed";

type NoticeContextValue = {
  notices: InAppNotice[];
  notifyConfirmed: (input: Omit<ConfirmedNoticeInput, "phase"> & { phase?: ConfirmedNoticeInput["phase"] }) => InAppNotice | null;
  dismiss: (id: string) => void;
};

const NoticeContext = createContext<NoticeContextValue | null>(null);

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<InAppNotice[]>([]);
  const dedupe = useRef(new NoticeDedupe());

  useEffect(() => {
    const unlock = () => unlockNoticeAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const notifyConfirmed = useCallback(
    (input: Omit<ConfirmedNoticeInput, "phase"> & { phase?: ConfirmedNoticeInput["phase"] }) => {
      const notice = noticeFromTxOutcome(
        {
          ...input,
          phase: input.phase ?? "success",
          now: input.now ?? Date.now(),
        },
        dedupe.current
      );
      if (!notice) return null;
      setNotices((current) => prependNotice(current, notice));
      // At most one chime per confirmed signature, even across reloads or tabs.
      if (isNoticeSoundEnabled() && claimNoticeSound(browserPlayedSoundStorage(), notice.id)) {
        requestNoticeSound(isNoticeSoundEnabled(), notice, playNoticeSound);
      }
      return notice;
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setNotices((current) => dismissNotice(current, id));
  }, []);

  const value = useMemo(
    () => ({ notices, notifyConfirmed, dismiss }),
    [dismiss, notices, notifyConfirmed]
  );

  return (
    <NoticeContext.Provider value={value}>
      {children}
      <NoticeToasts notices={notices} onDismiss={dismiss} />
    </NoticeContext.Provider>
  );
}

export function useNotices(): NoticeContextValue {
  const value = useContext(NoticeContext);
  if (!value) {
    return {
      notices: [],
      notifyConfirmed: () => null,
      dismiss: () => undefined,
    };
  }
  return value;
}

function NoticeToasts({
  notices,
  onDismiss,
}: {
  notices: InAppNotice[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-3 top-20 z-40 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4"
      aria-live="polite"
      aria-relevant="additions"
      aria-atomic="false"
    >
      {notices.map((notice) => (
        <NoticeToast key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function NoticeToast({
  notice,
  onDismiss,
}: {
  notice: InAppNotice;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(notice.id), NOTICE_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice.id, onDismiss]);

  return (
    <div
      role="status"
      className="pointer-events-auto w-full max-w-sm break-words rounded-2xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)] motion-safe:animate-[pf-toast-in_.28s_ease] motion-reduce:animate-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{notice.title}</p>
          <p className="mt-1 break-words text-sm leading-5 text-ink-soft">{notice.body}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-ink-faint hover:bg-paper-2 hover:text-ink"
          onClick={() => onDismiss(notice.id)}
          aria-label={`Dismiss ${notice.title}`}
        >
          Close
        </button>
      </div>
    </div>
  );
}
