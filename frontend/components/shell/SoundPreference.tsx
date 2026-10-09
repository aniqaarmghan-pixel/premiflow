"use client";

import { useState, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";

import {
  isNoticeSoundEnabled,
  setNoticeSoundEnabled,
} from "@/lib/app/notices";
import { unlockNoticeAudio } from "@/lib/app/notice-sound";

function subscribeNoop() {
  return () => {};
}

export function SoundPreference({
  compact = false,
  variant = "default",
}: {
  compact?: boolean;
  /** "sidebar": one-line dashboard utility row with a clear Sound On / Sound Off state. */
  variant?: "default" | "sidebar";
}) {
  const storedEnabled = useSyncExternalStore(
    subscribeNoop,
    isNoticeSoundEnabled,
    () => false
  );
  const [override, setEnabled] = useState<boolean | null>(null);
  const enabled = override ?? storedEnabled;

  function toggle() {
    const next = !enabled;
    setNoticeSoundEnabled(next);
    setEnabled(next);
    // Unlock only. Do not preview a sound on the toggle itself.
    unlockNoticeAudio();
  }

  if (variant === "sidebar") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Notification sound"
        title="Play a short sound for important confirmed contract actions"
        onClick={toggle}
        className="flex min-h-9 w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[13px] text-white/75 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
      >
        {enabled ? (
          <Volume2 size={15} aria-hidden="true" className="shrink-0 text-cyan" />
        ) : (
          <VolumeX size={15} aria-hidden="true" className="shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">Notification sound</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            enabled ? "bg-[rgba(46,230,214,.16)] text-cyan" : "bg-white/10 text-white/60"
          }`}
        >
          {enabled ? "Sound On" : "Sound Off"}
        </span>
      </button>
    );
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl text-left ${
          compact ? "px-0 py-1" : "px-0 py-1"
        }`}
      >
        <span className={compact ? "text-[11px] font-medium text-white" : "text-sm font-medium text-ink"}>
          Notification sounds
        </span>
        <span
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
            enabled ? "bg-accent" : "bg-white/20"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
      <p className={compact ? "text-[11px] leading-4 text-white/45" : "text-xs leading-5 text-ink-faint"}>
        Play a short sound for important confirmed contract actions.
      </p>
    </div>
  );
}
