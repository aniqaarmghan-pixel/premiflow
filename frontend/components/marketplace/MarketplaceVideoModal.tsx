"use client";
import { useCallback, useId, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { playableVideoUrl } from "@/lib/app/marketplace-media";
import { useDialogFocus } from "@/lib/hooks/useDialogFocus";

/**
 * Accessible gig video player. The play button only renders for a valid,
 * directly playable https video file; the dialog traps focus, closes on
 * Escape / overlay / close button, restores focus to the opener and never
 * starts playback on its own (the viewer presses play in the native controls).
 */
export function GigVideoButton({
  title,
  videoUrl,
  posterUrl,
  className = "",
}: {
  title: string;
  videoUrl: string | null | undefined;
  posterUrl?: string | null;
  className?: string;
}) {
  const src = playableVideoUrl(videoUrl);
  const [open, setOpen] = useState(false);
  if (!src) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Play video for ${title}`}
        className={`flex size-14 items-center justify-center rounded-full border border-white/40 bg-white/15 backdrop-blur-md transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${className}`}
      >
        <Play size={20} aria-hidden="true" className="ml-0.5 fill-white text-white" />
      </button>
      {open ? (
        <GigVideoDialog title={title} src={src} posterUrl={posterUrl ?? null} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function GigVideoDialog({
  title,
  src,
  posterUrl,
  onClose,
}: {
  title: string;
  src: string;
  posterUrl: string | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [failed, setFailed] = useState(false);
  const close = useCallback(() => onClose(), [onClose]);
  useDialogFocus(true, ref, close);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        tabIndex={-1}
        data-focus-skip
        aria-label="Close video"
        onClick={close}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-4xl overflow-hidden rounded-t-[22px] border border-white/10 bg-[#070d18] text-white shadow-2xl sm:rounded-[22px]"
      >
        <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <h2 id={titleId} className="min-w-0 truncate text-sm font-semibold sm:text-base">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            data-autofocus
            aria-label="Close video"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {failed ? (
          <p role="alert" className="px-5 pb-8 pt-4 text-sm text-white/75">
            This video could not be loaded. The seller&apos;s link may be unavailable right now.
          </p>
        ) : (
          <video
            src={src}
            poster={posterUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            className="aspect-video max-h-[75vh] w-full bg-black pb-[env(safe-area-inset-bottom)]"
          >
            Your browser cannot play this video.
          </video>
        )}
      </div>
    </div>
  );
}
