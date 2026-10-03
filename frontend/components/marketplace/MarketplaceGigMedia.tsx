"use client";
import { parseGigVideo } from "@/lib/app/video-embed";
import { GigVideoPreview } from "./MarketplaceVideoModal";

/**
 * Seller-owned gig media, linked by https URL only (nothing is bundled or proxied).
 * Images load lazily; YouTube / Vimeo links open in an accessible player; a direct file video never starts on its own, preloads only metadata on
 * demand (preload="none"), starts muted, and always shows controls, so it is safe
 * for reduced-motion users.
 */
export function MarketplaceGigMedia({
  title,
  coverUrl,
  media,
  videoUrl,
}: {
  title: string;
  coverUrl: string | null;
  media: string[];
  videoUrl: string | null;
}) {
  const video = parseGigVideo(videoUrl);
  const playable = video?.kind === "file" ? video.src : null;
  if (!coverUrl && media.length === 0 && !video) return null;
  return (
    <section aria-label="Gig media" className="min-w-0 space-y-3">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt={`${title} cover`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="aspect-[16/9] w-full rounded-[var(--radius)] border border-line object-cover"
        />
      ) : null}
      {video ? (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
          <span aria-hidden="true">&#9654;</span> Includes a video from the seller
        </p>
      ) : null}
      {playable ? (
        <video
          src={playable}
          poster={coverUrl ?? undefined}
          controls
          muted
          playsInline
          preload="none"
          className="aspect-[16/9] w-full rounded-[var(--radius)] border border-line bg-black"
        >
          Your browser cannot play this video.
        </video>
      ) : null}
      {video && video.kind !== "file" ? (
        <GigVideoPreview title={title} videoUrl={video.url} posterUrl={coverUrl} />
      ) : null}
      {media.length > 0 ? (
        <ul className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((url, i) => (
            <li key={`${url}-${i}`} className="min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${title} image ${i + 1}`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="aspect-[4/3] w-full rounded-[var(--radius)] border border-line object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
