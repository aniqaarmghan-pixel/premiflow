"use client";

/**
 * Seller-owned gig media, linked by https URL only (nothing is bundled or proxied).
 * Images load lazily; the optional video never starts on its own, preloads only metadata on
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
  if (!coverUrl && media.length === 0 && !videoUrl) return null;
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
      {videoUrl ? (
        <video
          src={videoUrl}
          controls
          muted
          playsInline
          preload="none"
          className="aspect-[16/9] w-full rounded-[var(--radius)] border border-line bg-black"
        >
          Your browser cannot play this video.
        </video>
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
