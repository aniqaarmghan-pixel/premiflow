"use client";

import { useEffect, useState } from "react";

import {
  isNoticeSoundEnabled,
  setNoticeSoundEnabled,
} from "@/lib/app/notices";
import { unlockNoticeAudio } from "@/lib/app/notice-sound";

export function SoundPreference({ compact = false }: { compact?: boolean }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isNoticeSoundEnabled());
  }, []);

  function toggle() {
    const next = !enabled;
    setNoticeSoundEnabled(next);
    setEnabled(next);
    // Unlock only. Do not preview a sound on the toggle itself.
    unlockNoticeAudio();
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
