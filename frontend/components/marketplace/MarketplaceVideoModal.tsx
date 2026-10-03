"use client";
import { useCallback, useId, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { gigVideoKindLabel, parseGigVideo, type GigVideo } from "@/lib/app/video-embed";
import { useDialogFocus } from "@/lib/hooks/useDialogFocus";

/**
 * Accessible gig video player. Play affordances only render for a valid,
 * allowlisted video (direct https file, YouTube or Vimeo). The dialog traps
 * focus, closes on Escape / overlay / close button, restores focus to the
 * opener and never starts playback on its own: files use native controls,
 * embeds use the privacy player host inside a sandboxed iframe.
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
  const video = parseGigVideo(videoUrl);
  const [open, setOpen] = useState(false);
  if (!video) return null;
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
        <GigVideoDialog title={title} video={video} posterUrl={posterUrl ?? null} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/** Large thumbnail tile with a play button (gig detail page and form preview). */
export function GigVideoPreview({
  title,
  videoUrl,
  posterUrl,
}: {
  title: string;
  videoUrl: string | null | undefined;
  posterUrl?: string | null;
}) {
  const video = parseGigVideo(videoUrl);
  const [open, setOpen] = useState(false);
  if (!video) return null;
  const thumb = posterUrl || (video.kind === "youtube" ? video.thumbnailUrl : null);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Play video for ${title} (${gigVideoKindLabel(video)})`}
        className="group relative flex aspect-video w-full min-w-0 items-center justify-center overflow-hidden rounded-[var(--radius)] border border-line bg-[linear-gradient(135deg,#071222,#0f2335_55%,#2a1f4d)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover opacity-90 transition group-hover:opacity-100"
          />
        ) : null}
        <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,10,20,.05),rgba(4,10,20,.55))]" />
        <span className="relative flex size-16 items-center justify-center rounded-full border border-white/50 bg-white/20 backdrop-blur-md transition motion-safe:group-hover:scale-105">
          <Play size={24} aria-hidden="true" className="ml-1 fill-white text-white" />
        </span>
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          <Play size={11} aria-hidden="true" className="fill-white" />
          Watch video - {gigVideoKindLabel(video)}
        </span>
      </button>
      {open ? (
        <GigVideoDialog title={title} video={video} posterUrl={posterUrl ?? null} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function GigVideoDialog({
  title,
  video,
  posterUrl,
  onClose,
}: {
  title: string;
  video: GigVideo;
  posterUrl: string | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [failed, setFailed] = useState(false);
  const close = useCallback(() => onClose(), [onClose]);
  useDialogFocus(true, ref, close);
  return (
    <div className="fixed inset-0 z-[10001] flex items-end justify-center p-0 sm:items-center sm:p-6">
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
        className="relative w-full max-w-4xl overflow-hidden rounded-t-[22px] border border-white/10 bg-[#070d18] pb-[env(safe-area-inset-bottom)] text-white shadow-2xl sm:rounded-[22px] sm:pb-0"
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
        {video.kind === "file" ? (
          failed ? (
            <p role="alert" className="px-5 pb-8 pt-4 text-sm text-white/75">
              This video could not be loaded. The seller&apos;s link may be unavailable right now.
            </p>
          ) : (
            <video
              src={video.src}
              poster={posterUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              onError={() => setFailed(true)}
              className="aspect-video max-h-[75dvh] w-full bg-black"
            >
              Your browser cannot play this video.
            </video>
          )
        ) : (
          <div className="relative aspect-video max-h-[75dvh] w-full bg-black">
            <iframe
              src={video.embedUrl}
              title={`${title} (${gigVideoKindLabel(video)} video)`}
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        )}
      </div>
    </div>
  );
}
